// public/js/quiz.js
(function () {
  // --- small logger ---
  function log(...a) { try { console.log("[quiz]", ...a); } catch (_) {} }

  // --- boot when DOM is ready (works even if script is before/after #qwrap) ---
  function start() {
    const wrap = document.getElementById("qwrap");
    if (!wrap) { document.addEventListener("DOMContentLoaded", start, { once: true }); return; }

    const slug = wrap.getAttribute("data-lesson");
    const proc = wrap.getAttribute("data-proc"); // e.g. "103"

    const loading = document.getElementById("loading-text");

    // state
    let questions = [];
    let idx = 0;
    let sessionPts = 0;
    let stageInfo = {}; // shared tier/progression info for this procedure


    // HUD helpers (may not exist; guard every use)
    const elHudPts  = () => document.getElementById("hud-pts");
    const elHudProg = () => document.getElementById("hud-prog");
    const elHudStr  = () => document.getElementById("hud-streak");

    function setLoading(msg) {
      if (loading) loading.textContent = msg;
    }

    function lockButtons(lock = true) {
      document
        .querySelectorAll(".mcq-choice,.tf-choice,#btn-fb-submit,#btn-match-submit,.match-select")
        .forEach((b) => {
          if (lock) b.setAttribute("disabled", "disabled");
          else b.removeAttribute("disabled");
        });
    }

    function renderProgress(i, total) {
      const pct = total ? Math.round((i / total) * 100) : 0;
      return `
        <div class="progress mb-3" style="height:10px;">
          <div class="progress-bar" role="progressbar" style="width:${pct}%"></div>
        </div>`;
    }

    async function loadData() {
      try {
        const url = urlDifficulty
          ? `/lessons/${encodeURIComponent(slug)}.json?difficulty=${encodeURIComponent(urlDifficulty)}`
          : `/lessons/${encodeURIComponent(slug)}.json`;

        log("requesting", url);
        setLoading("Loading procedure…");

        const r = await fetch(url, { headers: { Accept: "application/json" } });
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
        const data = await r.json();

        stageInfo = data.stageInfo || {};

        // If backend fell back because the requested tier had 0 questions, show a banner
        const fallback = stageInfo && stageInfo.tierEmpty && stageInfo.fallbackFrom && stageInfo.fallbackTo;
        if (fallback) {
          const note = document.getElementById("difficultyNote");
          if (note) {
            const msg = `No questions in ${String(stageInfo.fallbackFrom).toUpperCase()} yet — showing ${String(stageInfo.fallbackTo).toUpperCase()}.`;
            note.innerHTML = `<div class="alert alert-warning py-2 px-2 mb-2">${msg}</div>` + note.innerHTML;
          }
        }



        // Difficulty selector UI (if present)
        (function initDifficultySelector() {
          const sel = document.getElementById("difficultySelect");
          const note = document.getElementById("difficultyNote");
          if (!sel) return;

          const info = data.stageInfo || {};
          const unlockedStages = Array.isArray(info.unlockedStages) ? info.unlockedStages : [0];
          const served = (info.servedDifficulty || info.difficulty || "easy").toLowerCase();

          const options = [
            { value: "easy", label: "Easy", stage: 0 },
            { value: "medium", label: "Medium", stage: 1 },
            { value: "hard", label: "Hard", stage: 2 }
          ];

          const tierCounts = (info.tierCounts && typeof info.tierCounts === "object")
  ? info.tierCounts
  : { easy: 0, medium: 0, hard: 0 };

              sel.innerHTML = options
                .map(o => {
                  const unlocked = unlockedStages.includes(o.stage);
                  const selected = o.value === served ? "selected" : "";

                  const count = Number(tierCounts[o.value] || 0);
                  const isEmpty = count === 0;

                  // disable if locked OR empty
                  const disabled = (!unlocked || isEmpty) ? "disabled" : "";

                  const lockLabel = unlocked ? "" : " (locked)";
                  const emptyLabel = isEmpty ? " (empty)" : "";

                  return `<option value="${o.value}" ${selected} ${disabled}>${o.label}${lockLabel}${emptyLabel}</option>`;
                })
                .join("");

                // If backend fell back (requested empty tier), make dropdown match what we're actually viewing
                  if (info.tierEmpty && info.fallbackTo) {
                    sel.value = String(info.fallbackTo).toLowerCase();
                  }



              if (note) {
                const prog = (info.difficulty || "easy").toLowerCase();                 // progression tier
                const servedTier = (info.servedDifficulty || prog).toLowerCase();       // what you're viewing

                const unlockedNames = options
                  .filter(o => unlockedStages.includes(o.stage))
                  .map(o => o.label)
                  .join(", ");

                const practiceMode = (servedTier !== prog); // only happens when you choose an easier tier
                const practiceBanner = practiceMode
                  ? `<div class="alert alert-secondary py-2 px-2 mb-2"><strong>Practice mode:</strong> Completing this tier won’t advance progression.</div>`
                  : "";

                note.innerHTML = `
                  ${practiceBanner}
                  <div><strong>Selected:</strong> ${servedTier.toUpperCase()}</div>
                  <div><strong>Progression:</strong> ${prog.toUpperCase()}</div>
                  <div>Unlocked: ${unlockedNames}</div>
                `;

                if (info.locked) {
                  note.innerHTML =
                    `<div class="text-danger fw-semibold">Locked — complete previous tiers first.</div>` +
                    note.innerHTML;
                }
              }


              // "Continue progression" link: jump to the user's progression tier
              const btnCont = document.getElementById("btnContinueProgression");
              if (btnCont) {
                const prog = (info.difficulty || "easy").toLowerCase();
                const servedTier = (info.servedDifficulty || prog).toLowerCase();
                const practiceMode = (servedTier !== prog) && (servedTier === "easy" || servedTier === "medium" || servedTier === "hard");
                const u = new URL(window.location.href);
                u.searchParams.set("difficulty", prog);
                btnCont.href = u.toString();
              }


              // On change, reload same page with ?difficulty=
              sel.onchange = () => {
                const chosen = sel.value;
                const u = new URL(window.location.href);
                u.searchParams.set("difficulty", chosen);
                window.location.href = u.toString();
              };
        })();


        questions = Array.isArray(data.questions) ? data.questions : [];
        log("fetched", url, "count:", questions.length);

        // init HUD safely
        const hp = elHudProg(); if (hp) hp.textContent = `0/${questions.length}`;
        const hpts = elHudPts(); if (hpts) hpts.textContent = "0";
        const hs = elHudStr(); if (hs) hs.textContent = "—";

       setLoading(`Loaded: ${questions.length} questions`);
        renderCurrent();
      } catch (e) {
        console.error("[quiz] loadData error:", e);
        setLoading("Failed to load questions.");
        wrap.innerHTML = `<div class="alert alert-danger">
          Could not load lesson data. Check <code>/lessons/${slug}.json</code>.
        </div>`;
      }
    }

    const urlDifficulty = new URLSearchParams(window.location.search).get("difficulty");


    function renderCurrent() {
      log("renderCurrent idx=", idx, "total=", questions.length);

      if (!Array.isArray(questions) || questions.length === 0) {
        wrap.innerHTML = `<div class="alert alert-info">No questions in this procedure yet.</div>`;

        return;
      }
      if (idx >= questions.length) {
        wrap.innerHTML = `
          <div class="alert alert-success">
            Procedure complete! ✅
            <div id="complete-msg" class="mt-3"></div>
            <div class="mt-2 d-flex gap-2">
              <a class="btn btn-primary" href="/review/${encodeURIComponent(slug)}">Review this procedure</a>
              <a class="btn btn-outline-secondary" href="/lessons">Back to Procedures</a>
            </div>
          </div>`;
        return;

      }

      const q = questions[idx];
      const timer = q.time_limit_sec || 60;

      const typeLabel =
  q.type === "mcq" ? "Multiple Choice" :
  q.type === "true_false" ? "True/False" :
  q.type === "fill_blank" ? "Fill in the Blank" :
  q.type === "matching" ? "Matching" :
  (q.type || "");

  const diff = (q.difficulty || "").toLowerCase();
const diffClass =
  diff === "easy" ? "bg-success" :
  diff === "medium" ? "bg-warning text-dark" :
  diff === "hard" ? "bg-danger" :
  "bg-info";



      const parts = [];
      parts.push(`
        ${renderProgress(idx, questions.length)}
        <div class="card p-3 mb-3">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              ${proc ? `<span class="badge bg-dark">Procedure ${proc}</span>` : ""}
              ${(q.topic || q.subtopic) ? `<span class="badge bg-secondary ${proc ? "ms-2" : ""}">${q.topic || ""}${q.subtopic ? " • " + q.subtopic : ""}</span>` : ""}
              <span class="badge ${ (proc || q.topic || q.subtopic) ? "ms-2" : "" } ${diffClass}">${q.difficulty || ""}</span>
              <span class="badge bg-light text-dark ${ (proc || q.topic || q.subtopic || q.difficulty) ? "ms-2" : "" }">${typeLabel}</span>
            </div>
           <div><strong>Time remaining:</strong> <span id="tleft">${timer}</span>s</div>
          </div>
          <div class="mt-2 fs-5">${q.stem || ""}</div>
      `);

      if (q.type === "mcq" && Array.isArray(q.choices)) {
        parts.push(
          `<div class="mt-3">` +
            q.choices
              .map(
                (c) => `
            <button class="btn btn-outline-dark w-100 text-start mb-2 mcq-choice" data-choice="${c.id}">
              <strong>${c.id}.</strong> ${c.text}
            </button>`
              )
              .join("") +
            `</div>`
        );
      } else if (q.type === "true_false") {
        parts.push(`
          <div class="mt-3 d-flex gap-2">
            <button class="btn btn-outline-dark tf-choice" data-value="true">True</button>
            <button class="btn btn-outline-dark tf-choice" data-value="false">False</button>
          </div>
        `);
      } else if (q.type === "fill_blank") {
        parts.push(`
          <div class="mt-3">
            <input id="fb" class="form-control" placeholder="Type your answer"/>
            <button id="btn-fb-submit" class="btn btn-primary mt-2">Check Answer</button>
          </div>
        `);
      } else if (q.type === "matching") {
  const pairs = Array.isArray(q.answer) ? q.answer : [];
  if (!pairs.length) {
    parts.push(`<div class="alert alert-info mb-0">No matching pairs found for this question.</div>`);
  } else {
    const lefts = pairs.map(p => p[0]);
    const rights = pairs.map(p => p[1]);

    // shuffle the right-side options
    const shuffledRights = rights
      .map(v => ({ v, r: Math.random() }))
      .sort((a, b) => a.r - b.r)
      .map(x => x.v);

    const optionHtml = shuffledRights
      .map(opt => `<option value="${String(opt).replaceAll('"', "&quot;")}">${opt}</option>`)
      .join("");

    const rows = lefts.map((left, i) => `
      <div class="row align-items-center g-2 mb-2">
        <div class="col-md-6">
          <div class="fw-semibold">${left}</div>
        </div>
        <div class="col-md-6">
          <select class="form-select match-select" data-idx="${i}">
            <option value="">Select match…</option>
            ${optionHtml}
          </select>
          
        </div>
      </div>
    `).join("");

    parts.push(`
      <div class="mt-3">
        <div class="d-flex justify-content-between align-items-center mb-2">
        <div class="text-muted">Match each item, then click “Check Answer”.</div>
        <div class="d-flex gap-3 align-items-center">
        <div class="small text-muted" id="match-count">Matched 0 / ${lefts.length}</div>
        <button type="button" class="btn btn-link p-0 small" id="match-clear">Clear</button>
      </div>

      </div>
      ${rows}
      <button id="btn-match-submit" class="btn btn-primary mt-2">Check Answer</button>

      </div>
    `);
  }
}



      parts.push(`
          <div class="mt-3">
            <button id="btn-hint" class="btn btn-link p-0">Show hint</button>
            <div id="hint" class="text-muted small" style="display:none;"></div>
          </div>
        </div>
        <div id="result"></div>
      `);

      wrap.innerHTML = parts.join("");

      // matching: prevent duplicate selections (each right option can be used once)
if (q.type === "matching") {
  const selects = Array.from(document.querySelectorAll(".match-select"));

  function updateUniqueMatchOptions() {
    const chosen = selects.map(s => s.value).filter(Boolean);

    const c = document.getElementById("match-count");
    if (c) c.textContent = `Matched ${chosen.length} / ${selects.length}`;


    selects.forEach(sel => {
      const mine = sel.value;
      Array.from(sel.options).forEach(opt => {
        if (!opt.value) { opt.disabled = false; return; } // keep placeholder enabled
        opt.disabled = chosen.includes(opt.value) && opt.value !== mine;
      });
    });

const hintBtn = document.getElementById("btn-hint");
if (hintBtn) {
  if (!Array.isArray(q.hints) || !q.hints.length) {
    hintBtn.style.display = "none";
  } else {
    let hintIdx = 0;

    hintBtn.addEventListener("click", () => {
      const h = document.getElementById("hint");
      if (!h) return;

      h.style.display = "block";
      h.textContent = q.hints[Math.min(hintIdx, q.hints.length - 1)];

      hintIdx++;

      if (hintIdx === 1) hintBtn.textContent = "Show next hint";
      if (hintIdx >= q.hints.length) hintBtn.textContent = "No more hints";
    });
  }
}




    

  }

  selects.forEach(sel => sel.addEventListener("change", updateUniqueMatchOptions));
  updateUniqueMatchOptions();
}


      // Render LaTeX if MathJax v3 is present
      if (window.MathJax && typeof window.MathJax.typeset === "function") {
        try { window.MathJax.typeset(); } catch (_) {}
      }

      // timer (per-question)
      let t = timer;
      const intv = setInterval(() => {
        if (idx >= questions.length) return clearInterval(intv);
        t--;
        if (t < 0) { clearInterval(intv); return; }
        const tnode = document.getElementById("tleft");
        if (tnode) tnode.textContent = String(t);
      }, 1000);

      // stamp start time for scoring
      wrap.dataset.start = String(Date.now());

      // hint
      const hintBtn = document.getElementById("btn-hint");
      if (hintBtn) {
        hintBtn.addEventListener("click", () => {
          if (!Array.isArray(q.hints) || !q.hints.length) return;
          const h = document.getElementById("hint");
          if (h) { h.style.display = "block"; h.textContent = q.hints[0]; }
        });
      }

      // handlers (lock during submit)
      if (q.type === "mcq") {
        document.querySelectorAll(".mcq-choice").forEach((btn) => {
          btn.addEventListener("click", () => {
            lockButtons(true);
            const choiceId = btn.getAttribute("data-choice");
            postAttempt(q.question_id, { choiceId })
              .then(afterSubmit)
              .finally(() => lockButtons(false));
          });
        });
      } else if (q.type === "true_false") {
        document.querySelectorAll(".tf-choice").forEach((btn) => {
          btn.addEventListener("click", () => {
            lockButtons(true);
            const val = btn.getAttribute("data-value");
            postAttempt(q.question_id, { value: val })
              .then(afterSubmit)
              .finally(() => lockButtons(false));
          });
        });
      } else if (q.type === "fill_blank") {
        const sb = document.getElementById("btn-fb-submit");
        if (sb) {
          sb.addEventListener("click", () => {
            lockButtons(true);
            const vEl = document.getElementById("fb");
            const v = (vEl && vEl.value ? vEl.value : "").toString();
            postAttempt(q.question_id, { value: v })
              .then(afterSubmit)
              .finally(() => lockButtons(false));
          });
        }
      } else if (q.type === "matching") {
  const mb = document.getElementById("btn-match-submit");
  if (mb) {
    mb.addEventListener("click", () => {
      lockButtons(true);

      const selects = Array.from(document.querySelectorAll(".match-select"));
      if (!selects.length) {
        alert("Matching is not available for this question.");
        lockButtons(false);
        return;
      }

      // Build pairs: [ [leftText, selectedRight], ... ]
      const correctPairs = Array.isArray(q.answer) ? q.answer : [];
      const lefts = correctPairs.map(p => p[0]);

      const pairs = lefts.map((left, i) => {
        const sel = selects.find(s => Number(s.getAttribute("data-idx")) === i);
        const val = sel ? sel.value : "";
        return [left, val];
      });

      // Require all selections
      const missing = pairs.some(p => !p[1]);
      if (missing) {
        alert("Please select a match for every item.");
        lockButtons(false);
        return;
      }

      postAttempt(q.question_id, { pairs })
        .then(afterSubmit)
        .finally(() => lockButtons(false));
    });
  }
}
  
    }

    async function postAttempt(question_id, answerPayload) {
      const startMs = Number(wrap.dataset.start || Date.now());
      const timeTakenSec = Math.round((Date.now() - startMs) / 1000);

      const r = await fetch("/attempts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id, answerPayload, timeTakenSec })
      });
      return r.json();
    }


    function showNextControl() {
  const box = document.getElementById("result");
  if (!box) return;

  // If a next button already exists, don't add another
  if (document.getElementById("btn-next")) return;

  const isLast = (idx + 1) >= questions.length;

  const ctr = document.createElement("div");
  ctr.className = "mt-3 d-flex";
  ctr.innerHTML = `
    <button id="btn-next" class="btn btn-primary">
      ${isLast ? "Complete Procedure" : "Continue \u2192"}
    </button>
  `;


  box.appendChild(ctr);

  const btn = document.getElementById("btn-next");
  btn.addEventListener("click", async () => {
  const wasLast = (idx + 1) >= questions.length;

  let advanceInfo = null;

if (wasLast) {
  // Only advance if you're completing your current progression tier
  const prog = (stageInfo.difficulty || "easy").toLowerCase();
  const served = (stageInfo.servedDifficulty || prog).toLowerCase();
  const canAdvance = (served === prog);

  if (canAdvance) {
    try {
      const rr = await fetch(`/lessons/${encodeURIComponent(slug)}/advance-stage`, { method: "POST" });
      if (rr.ok) advanceInfo = await rr.json();
    } catch (e) {
      // ignore
    }
  }
}


  idx++;
  renderCurrent();

  // If it was the last question and we did NOT advance (practice mode), show a message
if (wasLast && !advanceInfo) {
  const target = document.getElementById("complete-msg");
  if (target) {
    target.innerHTML = `<div class="alert alert-secondary mb-0">Practice complete — progression unchanged.</div>`;
  }
}


  // After completion screen renders, show unlock message
  if (wasLast && advanceInfo && advanceInfo.ok) {
  const target = document.getElementById("complete-msg");
  const nextDiff = (advanceInfo.difficulty || "").toLowerCase();

  if (target) {
    const msg = advanceInfo.advanced
      ? `Next unlocked: ${String(nextDiff).toUpperCase()}`
      : `No higher difficulty available yet.`;
    target.innerHTML = `<div class="alert alert-info mb-0">${msg}</div>`;
  }

  // Update dropdown + URL to reflect the newly unlocked tier
  if (advanceInfo.advanced && nextDiff) {
    const sel = document.getElementById("difficultySelect");
    if (sel) {
      // enable the option if it was disabled
      const opt = Array.from(sel.options).find(o => o.value === nextDiff);
      if (opt) opt.disabled = false;

      sel.value = nextDiff;

      const u = new URL(window.location.href);
      u.searchParams.set("difficulty", nextDiff);
      window.history.replaceState({}, "", u.toString());
    }
  }
}



});


}

    async function afterSubmit(resp) {
      const box = document.getElementById("result");
      if (box) {
        box.innerHTML = `
          <div class="alert ${resp.isCorrect ? "alert-success" : "alert-danger"}">
            <div><strong>${resp.isCorrect ? "Correct!" : "Not quite"}</strong> +${resp.awardedPoints} pts</div>
            <div class="mt-2">${resp.explanation || ""}</div>
          </div>`;
      }

      // HUD + navbar live updates
      sessionPts += resp.awardedPoints || 0;
      const pts = elHudPts();  if (pts)  pts.textContent  = String(sessionPts);
      const prog = elHudProg(); if (prog) prog.textContent = `${idx + 1}/${questions.length}`;
      if (resp.newStreak != null) {
        const st = elHudStr(); if (st) st.textContent = String(resp.newStreak);
        // also try navbar badges if present
        const navXp = document.getElementById("badge-xp");
        if (navXp && resp.newXp != null) navXp.textContent = `XP: ${resp.newXp}`;
        const navSt = document.getElementById("badge-streak");
        if (navSt && resp.newStreak != null) navSt.textContent = `🔥 ${resp.newStreak}`;
      }


// ❌ remove auto-advance
// idx++;
// setTimeout(renderCurrent, 900);

// ✅ show explicit Next button instead
showNextControl();

// allow Enter to press "Next"
function onKey(e) {
  if (e.key === "Enter") {
    const nb = document.getElementById("btn-next");
    if (nb) nb.click();
  }
}
document.addEventListener("keydown", onKey, { once: true });


    }

    // kick off
    loadData();
  }

  start();
})();
