/* =========================================================
   FEthink — Automarker (Collaboration & Editing)
   - Access code gate -> signed httpOnly cookie session
   - Marking rules:
       <20 words: "Please add..." only; no score; no extras; no model answer
       >=20 words: score + strengths + tags + grid + improvement notes
       + optional Learn more framework tabs (collapsed by default)
       + model answer (collapsed) shown only when server returns it
   ========================================================= */

const gateEl = document.getElementById("gate");
const appEl = document.getElementById("app");

const codeInput = document.getElementById("codeInput");
const unlockBtn = document.getElementById("unlockBtn");
const gateMsg = document.getElementById("gateMsg");

// ✅ Support both header ID variants (Priorities + legacy)
const backLink =
  document.getElementById("backToCourse") ||
  document.getElementById("backLink");

const nextLink =
  document.getElementById("nextLesson") ||
  document.getElementById("nextLink");

const logoutBtn = document.getElementById("logoutBtn");

const questionTextEl = document.getElementById("questionText");
const targetWordsEl = document.getElementById("targetWords");
const minGateEl = document.getElementById("minGate");

const insertTemplateBtn = document.getElementById("insertTemplateBtn");
const clearBtn = document.getElementById("clearBtn");
const answerTextEl = document.getElementById("answerText");

// Evidence (front-end only; no server upload)
const docFileEl = document.getElementById("docFile");
const evidenceFilesEl = document.getElementById("evidenceFiles");
const evidencePasteEl = document.getElementById("evidencePaste");
const docFileNameEl = document.getElementById("docFileName");
const evidenceFileListEl = document.getElementById("evidenceFileList");

const submitBtn = document.getElementById("submitBtn");
const wordCountBox = document.getElementById("wordCountBox");

const scoreBig = document.getElementById("scoreBig");
const wordCountBig = document.getElementById("wordCountBig");

const strengthsWrap = document.getElementById("strengthsWrap");
const strengthsList = document.getElementById("strengthsList");

const tagsWrap = document.getElementById("tagsWrap");
const tagsRow = document.getElementById("tagsRow");

const gridWrap = document.getElementById("gridWrap");
const gEthical = document.getElementById("gEthical");
const gImpact = document.getElementById("gImpact");
const gLegal = document.getElementById("gLegal");
const gRecs = document.getElementById("gRecs");
const gStructure = document.getElementById("gStructure");

const feedbackBox = document.getElementById("feedbackBox");

const learnMoreWrap = document.getElementById("learnMoreWrap");
const learnMoreBtn = document.getElementById("learnMoreBtn");
const frameworkPanel = document.getElementById("frameworkPanel");

const tabBtns = Array.from(document.querySelectorAll(".tabBtn"));
const tabPanes = {
  gdpr: document.getElementById("tab-gdpr"),
  unesco: document.getElementById("tab-unesco"),
  ofsted: document.getElementById("tab-ofsted"),
  jisc: document.getElementById("tab-jisc")
};

const gdprExpectation = document.getElementById("gdprExpectation");
const gdprCase = document.getElementById("gdprCase");
const unescoExpectation = document.getElementById("unescoExpectation");
const unescoCase = document.getElementById("unescoCase");
const ofstedExpectation = document.getElementById("ofstedExpectation");
const ofstedCase = document.getElementById("ofstedCase");
const jiscExpectation = document.getElementById("jiscExpectation");
const jiscCase = document.getElementById("jiscCase");

const modelWrap = document.getElementById("modelWrap");
const modelAnswerEl = document.getElementById("modelAnswer");

/* ---------------- Helpers ---------------- */
function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function wc(s) {
  const t = String(s || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function setVisible(el, show) {
  el.style.display = show ? "block" : "none";
}

function setExpanded(btn, panel, expanded) {
  btn.setAttribute("aria-expanded", expanded ? "true" : "false");
  panel.style.display = expanded ? "block" : "none";
  panel.setAttribute("aria-hidden", expanded ? "false" : "true");
}

function showGate() {
  // Show the app behind the modal so the dimmed underlay is visible (Priorities behaviour)
  appEl.style.display = "block";
  gateEl.style.display = "flex";

  gateMsg.textContent = "";
  codeInput.value = "";
}

function showApp() {
  gateEl.style.display = "none";
  appEl.style.display = "block";
}

async function api(path, body) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "request_failed");
  return data;
}

/* ---------------- Load config ---------------- */
async function loadConfig() {
  const res = await fetch("/api/config");
  const data = await res.json();

  questionTextEl.innerHTML = data.questionText || "—";
  targetWordsEl.textContent = data.targetWords || "—";
  minGateEl.textContent = data.minWordsGate || "20";

  if (backLink) {
    if (data.courseBackUrl) {
      backLink.href = data.courseBackUrl;
      backLink.style.display = "inline-flex";
    } else {
      backLink.style.display = "none";
    }
  }

  if (nextLink) {
    if (data.nextLessonUrl) {
      nextLink.href = data.nextLessonUrl;
      nextLink.style.display = "inline-flex";
    } else {
      nextLink.style.display = "none";
    }
  }

  insertTemplateBtn.addEventListener("click", () => {
    answerTextEl.value = data.templateText || "";
    updateWordCount();
  });

  clearBtn.addEventListener("click", () => {
    answerTextEl.value = "";
    updateWordCount();
  });

  logoutBtn.addEventListener("click", async () => {
    try {
      await api("/api/logout", {});
    } catch {}
    showGate();
  });

  // Tabs
  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-tab");
      tabBtns.forEach((b) => {
        b.classList.toggle("active", b === btn);
        b.setAttribute("aria-selected", b === btn ? "true" : "false");
      });
      Object.entries(tabPanes).forEach(([k, pane]) => {
        pane.classList.toggle("active", k === tab);
      });
    });
  });

  // Learn more toggle
  learnMoreBtn.addEventListener("click", () => {
    const expanded = learnMoreBtn.getAttribute("aria-expanded") === "true";
    setExpanded(learnMoreBtn, frameworkPanel, !expanded);
  });

  // Word count live
  answerTextEl.addEventListener("input", updateWordCount);
  updateWordCount();
}

/* ---------------- Gate unlock ---------------- */
unlockBtn.addEventListener("click", async () => {
  const code = String(codeInput.value || "").trim();
  if (!code) {
    gateMsg.textContent = "Please enter your access code.";
    return;
  }
  unlockBtn.disabled = true;
  gateMsg.textContent = "";
  try {
    await api("/api/unlock", { code });
    showApp();
  } catch {
    gateMsg.textContent = "Incorrect access code.";
  } finally {
    unlockBtn.disabled = false;
  }
});

/* ---------------- Renderers ---------------- */
function renderStrengths(list) {
  if (!list || list.length === 0) {
    strengthsWrap.style.display = "none";
    return;
  }
  strengthsList.innerHTML = list.map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  strengthsWrap.style.display = "block";
}

function renderTags(tags) {
  if (!tags || tags.length === 0) {
    tagsWrap.style.display = "none";
    return;
  }
  tagsRow.innerHTML = tags
    .map((t) => `<span class="tag ${t.status}">${escapeHtml(t.name)}</span>`)
    .join("");
  tagsWrap.style.display = "block";
}

function renderGrid(grid) {
  if (!grid) {
    gridWrap.style.display = "none";
    return;
  }
  gEthical.textContent = grid.ethical || "—";
  gImpact.textContent = grid.impact || "—";
  gLegal.textContent = grid.legal || "—";
  gRecs.textContent = grid.recs || "—";
  gStructure.textContent = grid.structure || "—";
  gridWrap.style.display = "block";
}

function renderFramework(framework) {
  if (!framework) {
    learnMoreWrap.style.display = "none";
    return;
  }
  gdprExpectation.textContent = framework.gdpr?.expectation || "—";
  gdprCase.textContent = framework.gdpr?.case || "—";
  unescoExpectation.textContent = framework.unesco?.expectation || "—";
  unescoCase.textContent = framework.unesco?.case || "—";
  ofstedExpectation.textContent = framework.ofsted?.expectation || "—";
  ofstedCase.textContent = framework.ofsted?.case || "—";
  jiscExpectation.textContent = framework.jisc?.expectation || "—";
  jiscCase.textContent = framework.jisc?.case || "—";

  setExpanded(learnMoreBtn, frameworkPanel, false);
  learnMoreWrap.style.display = "block";
}

function updateWordCount() {
  const n = wc(answerTextEl.value);
  wordCountBox.textContent = `Words: ${n}`;
}

/* ---------------- Marking ---------------- */
async function mark() {
  const answerText = String(answerTextEl.value || "");
  const n = wc(answerText);
  wordCountBig.textContent = String(n);

  scoreBig.textContent = "—";
  strengthsWrap.style.display = "none";
  tagsWrap.style.display = "none";
  gridWrap.style.display = "none";
  feedbackBox.textContent = "";
  learnMoreWrap.style.display = "none";
  modelWrap.style.display = "none";

  submitBtn.disabled = true;

  try {
    const data = await api("/api/mark", { answerText });
    const r = data.result;

    if (r.gated) {
      feedbackBox.textContent = r.message || "Please add to your answer.";
      return;
    }

    scoreBig.textContent = `${r.score}/10`;
    renderStrengths(r.strengths);
    renderTags(r.tags);
    renderGrid(r.grid);
    renderFramework(r.framework);
    feedbackBox.textContent = r.feedback || "—";

    if (r.modelAnswer) {
      modelAnswerEl.textContent = r.modelAnswer;
      modelWrap.style.display = "block";
    }
  } catch {
    feedbackBox.textContent = "Network issue. Please try again.";
  } finally {
    submitBtn.disabled = false;
  }
}

/* ---------------- Evidence helpers (front-end only) ---------------- */
function safeName(file) {
  return file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : "No file selected";
}

function renderEvidenceUI() {
  if (docFileNameEl && docFileEl) {
    const f = docFileEl.files && docFileEl.files[0] ? docFileEl.files[0] : null;
    docFileNameEl.textContent = safeName(f);
  }
  if (evidenceFileListEl && evidenceFilesEl) {
    const files = evidenceFilesEl.files ? Array.from(evidenceFilesEl.files) : [];
    if (files.length === 0) {
      evidenceFileListEl.textContent = "No files selected";
    } else {
      evidenceFileListEl.textContent = files.map(safeName).join(" • ");
    }
  }
}

if (docFileEl) docFileEl.addEventListener("change", renderEvidenceUI);
if (evidenceFilesEl) evidenceFilesEl.addEventListener("change", renderEvidenceUI);

submitBtn.addEventListener("click", mark);

/* ---------------- Initial load ---------------- */
loadConfig().then(() => {
  showGate();
});
