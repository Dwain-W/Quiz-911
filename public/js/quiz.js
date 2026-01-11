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

    const DEFAULT_TIME_PER_QUESTION = 60;


    // state
    let questions = [];
    let idx = 0;
    let sessionPts = 0;
    let maxPts = 0;      // total possible points for current question set
    let correctCount = 0;
    let attemptedCount = 0;

    let stageInfo = {}; // shared tier/progression info for this procedure

        // per-question timer handle
        let timerHandle = null;


    // HUD helpers (may not exist; guard every use)
    const elHudPts  = () => document.getElementById("hud-pts");
    const elHudProg = () => document.getElementById("hud-prog");
    const elHudStr  = () => document.getElementById("hud-streak");

    async function submitCompletion() {
      try {
        const res = await fetch(`/lessons/${encodeURIComponent(slug)}/complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            correct: correctCount,
            total: attemptedCount,
            points: sessionPts
          })
        });

        const data = await res.json();
        if (!data.ok) {
          console.warn("[complete] save failed:", data.error);
          return null;
        }
        return data;
      } catch (err) {
        console.warn("[complete] save error:", err);
        return null;
      }
    }


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


                let qs = Array.isArray(data.questions) ? data.questions : [];

                // If in "missed-only" mode, filter down to just those IDs
                if (missedSet && missedSet.size > 0) {
                  qs = qs.filter(q => q && missedSet.has(q.question_id));
                }

                questions = qs;
                log("fetched", url, "count:", questions.length, "mode:", mode || "normal");


        // reset score + compute max possible points
        sessionPts = 0;
        maxPts = questions.reduce((sum, q) => {
          const pts = (q && q.points != null) ? q.points : 10;
          return sum + pts;
        }, 0);

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

        const urlParams = new URLSearchParams(window.location.search);
        const urlDifficulty = urlParams.get("difficulty");
        const mode = urlParams.get("mode") || null;
        const missedParam = urlParams.get("missed") || "";
        const missedSet = (mode === "missed" && missedParam)
          ? new Set(missedParam.split(",").map(s => s.trim()).filter(Boolean))
          : null;



    function renderCurrent() {
      log("renderCurrent idx=", idx, "total=", questions.length);

            // 🔁 clear any existing timer when rendering a new question or completion
              if (timerHandle) {
                clearInterval(timerHandle);
                timerHandle = null;
              }

      if (!Array.isArray(questions) || questions.length === 0) {
        wrap.innerHTML = `<div class="alert alert-info">No questions in this procedure yet.</div>`;
        return;
      }

      if (idx >= questions.length) {
        const score = sessionPts;
        const total = maxPts;
        const pct = total > 0 ? Math.round((score / total) * 100) : null;

        wrap.innerHTML = `
          <div class="alert alert-success">
            <div class="mb-2">Procedure complete! ✅</div>

            <div class="mb-2">
              <strong>Score:</strong>
              ${total > 0
                ? `${score} / ${total} points${pct !== null ? ` (${pct}%)` : ""}`
                : `${score} points`}
            </div>

            <div id="complete-msg" class="mt-3"></div>

            <div class="mt-2 d-flex gap-2">
              <a class="btn btn-primary" href="/review/${encodeURIComponent(slug)}">Review this procedure</a>
              <a class="btn btn-outline-secondary" href="/learn">Back to Procedures</a>
            </div>
          </div>`;
        return;
      }

    



      const q = questions[idx];
      // If time_limit_sec === 0 → no timer for this question
        const hasTimer = (q.time_limit_sec === 0) ? false : true;

        // If no time_limit_sec specified, use default
        const timer = hasTimer
          ? (typeof q.time_limit_sec === "number" && q.time_limit_sec > 0
              ? q.time_limit_sec
              : DEFAULT_TIME_PER_QUESTION)
          : 0;


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



        const timerHtml = hasTimer
            ? `
                <div class="text-end">
                  <div>
                    <strong>Time remaining:</strong>
                    <span id="tleft">${timer}</span>s
                  </div>
                  <div class="mt-1">
                    <div class="progress" style="height:6px;">
                      <div
                        id="timer-bar"
                        class="progress-bar bg-danger"
                        role="progressbar"
                        style="width:100%;"
                      ></div>
                    </div>
                  </div>
                </div>
              `
            : "";


      const parts = [];


      parts.push(`
          ${renderProgress(idx, questions.length)}
          <div class="card p-3 mb-3">
            <div class="d-flex justify-content-between align-items-center">
              <div>
                ${proc ? `<span class="badge bg-dark">Procedure ${proc}</span>` : ""}
                ${(q.topic || q.subtopic)
                  ? `<span class="badge bg-secondary ${proc ? "ms-2" : ""}">${q.topic || ""}${q.subtopic ? " • " + q.subtopic : ""}</span>`
                  : ""
                }
                <span class="badge ${(proc || q.topic || q.subtopic) ? "ms-2" : ""} ${diffClass}">
                  ${q.difficulty || ""}
                </span>
                <span class="badge bg-light text-dark ${(proc || q.topic || q.subtopic || q.difficulty) ? "ms-2" : ""}">
                  ${typeLabel}
                </span>
              </div>
              ${timerHtml}
            </div>
            <div class="mt-2 fs-5">${q.stem || ""}</div>
        `);


      // MCQ
      if (q.type === "mcq" && Array.isArray(q.choices)) {
        parts.push(
          `<div class="mt-3">` +
          q.choices.map(c => `
            <button class="btn btn-outline-dark w-100 text-start mb-2 mcq-choice" data-choice="${c.id}">
              <strong>${c.id}.</strong> ${c.text}
            </button>
          `).join("") +
          `</div>`
        );
      }

      // True/False
      else if (q.type === "true_false") {
        parts.push(`
          <div class="mt-3 d-flex gap-2">
            <button class="btn btn-outline-dark tf-choice" data-value="true">True</button>
            <button class="btn btn-outline-dark tf-choice" data-value="false">False</button>
          </div>
        `);
      }

      // Fill blank
      else if (q.type === "fill_blank") {
        parts.push(`
          <div class="mt-3">
            <input id="fb" class="form-control" placeholder="Type your answer"/>
            <button id="btn-fb-submit" class="btn btn-primary mt-2">Check Answer</button>
          </div>
        `);
      }

      // Matching
      else if (q.type === "matching") {
        const pairs = Array.isArray(q.answer) ? q.answer : [];
        if (!pairs.length) {
          parts.push(`<div class="alert alert-info mb-0">No matching pairs found for this question.</div>`);
        } else {
          const lefts = pairs.map(p => p[0]);
          const rights = pairs.map(p => p[1]);

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
                <div class="small text-muted" id="match-count">Matched 0 / ${lefts.length}</div>
              </div>

              ${rows}

              <button id="btn-match-submit" class="btn btn-primary mt-2">Check Answer</button>
            </div>
          `);
        }
      }

      // Hint + close card
      parts.push(`
          <div class="mt-3">
            <button id="btn-hint" class="btn btn-link p-0">Show hint</button>
            <div id="hint" class="text-muted small" style="display:none;"></div>
          </div>
        </div>
        <div id="result"></div>
      `);

      wrap.innerHTML = parts.join("");


            // timer (per-question)
      if (hasTimer) {
        let t = timer;

        timerHandle = setInterval(() => {
          // If we somehow moved off this question, stop ticking
          if (idx >= questions.length) {
            clearInterval(timerHandle);
            timerHandle = null;
            return;
          }

          t--;

          // Time's up
          if (t <= 0) {
            clearInterval(timerHandle);
            timerHandle = null;

            // lock all answer inputs
            lockButtons(true);

            // hard-set display to 0
            const tnode = document.getElementById("tleft");
            if (tnode) tnode.textContent = "0";

            // shrink bar to 0
            const bar = document.getElementById("timer-bar");
            if (bar) bar.style.width = "0%";

            // optional message
            const box = document.getElementById("result");
            if (box) {
              box.innerHTML = `
                <div class="alert alert-warning mb-0">
                  Time's up for this question. Moving to the next one.
                </div>
              `;
            }

            // auto-advance to next question (or completion screen)
            setTimeout(() => {
              if (idx < questions.length) {
                idx++;
                renderCurrent();
              }
            }, 800);

            return;
          }

          // Update timer text
          const tnode = document.getElementById("tleft");
          if (tnode) tnode.textContent = String(t);

          // Update timer bar width
          const bar = document.getElementById("timer-bar");
          if (bar && timer > 0) {
            const pct = Math.max(0, Math.round((t / timer) * 100));
            bar.style.width = `${pct}%`;
          }
        }, 1000);
      }




      wrap.dataset.start = String(Date.now());

      // hint (hide if none)
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

      // matching unique options (prevent duplicates)
      if (q.type === "matching") {
        const selects = Array.from(document.querySelectorAll(".match-select"));

        function updateUniqueMatchOptions() {
          const chosen = selects.map(s => s.value).filter(Boolean);
          const c = document.getElementById("match-count");
          if (c) c.textContent = `Matched ${chosen.length} / ${selects.length}`;

          selects.forEach(sel => {
            const mine = sel.value;
            Array.from(sel.options).forEach(opt => {
              if (!opt.value) { opt.disabled = false; return; }
              opt.disabled = chosen.includes(opt.value) && opt.value !== mine;
            });
          });
        }

        selects.forEach(sel => sel.addEventListener("change", updateUniqueMatchOptions));
        updateUniqueMatchOptions();
      }

      // handlers
      if (q.type === "mcq") {
        document.querySelectorAll(".mcq-choice").forEach(btn => {
          btn.addEventListener("click", () => {
            lockButtons(true);
            const choiceId = btn.getAttribute("data-choice");
            postAttempt(q.question_id, { choiceId }).then(afterSubmit);
          });
        });
      } else if (q.type === "true_false") {
        document.querySelectorAll(".tf-choice").forEach(btn => {
          btn.addEventListener("click", () => {
            lockButtons(true);
            const val = btn.getAttribute("data-value");
            postAttempt(q.question_id, { value: val }).then(afterSubmit);
          });
        });
      } else if (q.type === "fill_blank") {
        const sb = document.getElementById("btn-fb-submit");
        if (sb) {
          sb.addEventListener("click", () => {
            const vEl = document.getElementById("fb");
            const v = (vEl && vEl.value ? vEl.value : "").toString().trim();

            if (!v) {
              const box = document.getElementById("result");
              if (box) box.innerHTML = `<div class="alert alert-warning">Please enter an answer before submitting.</div>`;
              return;
            }

            lockButtons(true);
            postAttempt(q.question_id, { value: v }).then(afterSubmit);
          });
        }
      } else if (q.type === "matching") {
        const mb = document.getElementById("btn-match-submit");
        if (mb) {
          mb.addEventListener("click", () => {
            lockButtons(true);

            const selects = Array.from(document.querySelectorAll(".match-select"));
            const correctPairs = Array.isArray(q.answer) ? q.answer : [];
            const lefts = correctPairs.map(p => p[0]);

            const pairsToSend = lefts.map((left, i) => {
              const sel = selects.find(s => Number(s.getAttribute("data-idx")) === i);
              const val = sel ? sel.value : "";
              return [left, val];
            });

            const missing = pairsToSend.some(p => !p[1]);
            if (missing) {
              alert("Please select a match for every item.");
              lockButtons(false);
              return;
            }

            postAttempt(q.question_id, { pairs: pairsToSend }).then(afterSubmit);
          });
        }
      }
    }



    async function saveProgressDelta({ lessonId, correctDelta, totalDelta }) {
  try {
    const res = await fetch("/api/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lessonId, correctDelta, totalDelta })
    });

    const data = await res.json();
    if (!data.ok) {
      console.warn("[progress] save failed:", data.error);
      return null;
    }

    return data.progress;
  } catch (err) {
    console.warn("[progress] save error:", err);
    return null;
  }
}


    function afterSubmit(resp) {
          const box = document.getElementById("result");

          if (box) {
            const explanationHtml = resp.explanation
              ? `
                <div class="explanation-body mt-2">
                  <div class="explanation-label small text-uppercase text-muted mb-1">
                    Explanation
                  </div>
                  <div class="explanation-text">
                    ${resp.explanation}
                  </div>
                </div>`
              : "";

            box.innerHTML = `
              <div class="alert ${resp.isCorrect ? "alert-success" : "alert-danger"}">
                <div class="d-flex justify-content-between align-items-center">
                  <div>
                    <strong>${resp.isCorrect ? "Correct!" : "Not quite"}</strong>
                    <span class="ms-1">+${resp.awardedPoints} pts</span>
                  </div>
                </div>
                ${explanationHtml}
              </div>`;
          }

          // Update score + HUD
          sessionPts += resp.awardedPoints || 0;

          const pts = elHudPts();
          if (pts) pts.textContent = String(sessionPts);

          const prog = elHudProg();
          if (prog) prog.textContent = `${idx + 1}/${questions.length}`;

          if (resp.newStreak != null) {
            const st = elHudStr();
            if (st) st.textContent = String(resp.newStreak);

            const navXp = document.getElementById("badge-xp");
            if (navXp && resp.newXp != null) navXp.textContent = `XP: ${resp.newXp}`;

            const navSt = document.getElementById("badge-streak");
            if (navSt) navSt.textContent = `🔥 ${resp.newStreak}`;
          }


            // Save progress (anonymous for now)
              saveProgressDelta({
                lessonId: slug,
                correctDelta: resp.isCorrect ? 1 : 0,
                totalDelta: 1
              });


            attemptedCount += 1;
            if (resp.isCorrect) correctCount += 1;

              
          showNextControl();
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

        // If finishing the last question, optionally advance progression
        if (wasLast) {
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

        // ✅ Normal next question flow
        if (!wasLast) {
          idx++;
          renderCurrent();
          return;
    
        }
    
        const qs = new URLSearchParams({
          correct: String(correctCount),
          total: String(attemptedCount),
          points: String(sessionPts)
        });

        if (advanceInfo && advanceInfo.ok) {
          qs.set("advanced", String(!!advanceInfo.advanced));
          if (advanceInfo.difficulty) qs.set("next", String(advanceInfo.difficulty));
        }


        // ✅ LAST QUESTION: save completion + redirect to results page
        await submitCompletion();


        // Pass progression info to results (if available)
          if (advanceInfo && advanceInfo.ok) {
            qs.set("advanced", String(!!advanceInfo.advanced));
            if (advanceInfo.difficulty) qs.set("next", String(advanceInfo.difficulty));
          } else {
            qs.set("practice", "true");
          }


        // (Optional) if you want, you can pass unlocked info too
        // if (advanceInfo?.difficulty) qs.set("next", advanceInfo.difficulty);

        window.location.href =
          `/lessons/${encodeURIComponent(slug)}/results?` + qs.toString();
      });



}

        


    

    // kick off
    loadData();
  }

  start();
})();
