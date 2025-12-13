// public/js/quiz.js
(function () {
  // --- small logger ---
  function log(...a) { try { console.log("[quiz]", ...a); } catch (_) {} }

  // --- boot when DOM is ready (works even if script is before/after #qwrap) ---
  function start() {
    const wrap = document.getElementById("qwrap");
    if (!wrap) { document.addEventListener("DOMContentLoaded", start, { once: true }); return; }

    const slug = wrap.getAttribute("data-lesson");
    const loading = document.getElementById("loading-text");

    // state
    let questions = [];
    let idx = 0;
    let sessionPts = 0;

    // HUD helpers (may not exist; guard every use)
    const elHudPts  = () => document.getElementById("hud-pts");
    const elHudProg = () => document.getElementById("hud-prog");
    const elHudStr  = () => document.getElementById("hud-streak");

    function setLoading(msg) {
      if (loading) loading.textContent = msg;
    }

    function lockButtons(lock = true) {
      document
        .querySelectorAll(".mcq-choice,.tf-choice,#btn-fb-submit,#btn-match-submit")
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
        const url = `/lessons/${encodeURIComponent(slug)}.json`;
        log("requesting", url);
        setLoading("Loading questions…");

        const r = await fetch(url, { headers: { Accept: "application/json" } });
        if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
        const data = await r.json();

        questions = Array.isArray(data.questions) ? data.questions : [];
        log("fetched", url, "count:", questions.length);

        // init HUD safely
        const hp = elHudProg(); if (hp) hp.textContent = `0/${questions.length}`;
        const hpts = elHudPts(); if (hpts) hpts.textContent = "0";
        const hs = elHudStr(); if (hs) hs.textContent = "—";

        setLoading(`Questions loaded: ${questions.length}`);
        renderCurrent();
      } catch (e) {
        console.error("[quiz] loadData error:", e);
        setLoading("Failed to load questions.");
        wrap.innerHTML = `<div class="alert alert-danger">
          Could not load lesson data. Check <code>/lessons/${slug}.json</code>.
        </div>`;
      }
    }

    function renderCurrent() {
      log("renderCurrent idx=", idx, "total=", questions.length);

      if (!Array.isArray(questions) || questions.length === 0) {
        wrap.innerHTML = `<div class="alert alert-info">No questions in this lesson yet.</div>`;
        return;
      }
      if (idx >= questions.length) {
        wrap.innerHTML = `
          <div class="alert alert-success">
            Lesson complete! 🎉
            <div class="mt-2 d-flex gap-2">
              <a class="btn btn-primary" href="/review/${encodeURIComponent(slug)}">Review answers</a>
              <a class="btn btn-outline-secondary" href="/learn">Back to Learn</a>
            </div>
          </div>`;
        return;
      }

      const q = questions[idx];
      const timer = q.time_limit_sec || 60;

      const parts = [];
      parts.push(`
        ${renderProgress(idx, questions.length)}
        <div class="card p-3 mb-3">
          <div class="d-flex justify-content-between align-items-center">
            <div>
              <span class="badge bg-secondary">${q.topic || ""}${q.subtopic ? " • " + q.subtopic : ""}</span>
              <span class="badge bg-info ms-2">${q.difficulty || ""}</span>
              <span class="badge bg-light text-dark ms-2">${q.type}</span>
            </div>
            <div><strong>Time:</strong> <span id="tleft">${timer}</span>s</div>
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
            <button id="btn-fb-submit" class="btn btn-primary mt-2">Submit</button>
          </div>
        `);
      } else if (q.type === "matching") {
        parts.push(`
          <p class="text-muted">Paste JSON pairs, e.g. [[\\"velocity\\",\\"m/s\\"]]</p>
          <textarea id="match" class="form-control" rows="3"></textarea>
          <button id="btn-match-submit" class="btn btn-primary mt-2">Submit</button>
        `);
      }

      parts.push(`
          <div class="mt-3">
            <button id="btn-hint" class="btn btn-link p-0">Need a nudge?</button>
            <div id="hint" class="text-muted small" style="display:none;"></div>
          </div>
        </div>
        <div id="result"></div>
      `);

      wrap.innerHTML = parts.join("");

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
            let pairs = [];
            try {
              const txt = (document.getElementById("match") && document.getElementById("match").value) || "[]";
              pairs = JSON.parse(txt);
            } catch {
              alert('Invalid JSON. Try [["velocity","m/s"]]');
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
      ${isLast ? "Finish Lesson" : "Next Question \u2192"}
    </button>
  `;

  box.appendChild(ctr);

  const btn = document.getElementById("btn-next");
  btn.addEventListener("click", () => {
    idx++;
    renderCurrent();
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
