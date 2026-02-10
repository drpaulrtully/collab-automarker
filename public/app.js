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
const minGateEchoEl = document.getElementById("minGateEcho");

const insertTemplateBtn = document.getElementById("insertTemplateBtn");
const clearBtn = document.getElementById("clearBtn");
const answerTextEl = document.getElementById("answerText");

const prompt1CountEl = document.getElementById("prompt1Count");
const draftCountEl = document.getElementById("draftCount");

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

/* ---------------- Draft Assistant (Stage 1) ---------------- */
const genDraftBtn = document.getElementById("genDraftBtn");
const draftEditedEl = document.getElementById("draftEdited");
const draftOriginalHiddenEl = document.getElementById("draftOriginalHidden");
const draftMsgEl = document.getElementById("draftMsg");

const prompt2TextEl = document.getElementById("prompt2Text");
const refineDraftBtn = document.getElementById("refineDraftBtn");

const finalDraftEl = document.getElementById("finalDraft");
const copyFinalToGuideBtn = document.getElementById("copyFinalToGuideBtn");
const copyFinalBtn = document.getElementById("copyFinalBtn");
const finalMsgEl = document.getElementById("finalMsg");
const copyEditedBtn = document.getElementById("copyEditedBtn");
const editedDraftToRefineEl = document.getElementById("editedDraftToRefine");

// Final guide scoring (Stage 3)
const finalGuideTextEl = document.getElementById("finalGuideText");
const guideScoreWrap = document.getElementById("guideScoreWrap");
const guideScoreBig = document.getElementById("guideScoreBig");
const guideStrengths = document.getElementById("guideStrengths");
const guideImprovements = document.getElementById("guideImprovements");

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
function updateDraftAndPromptCounts() {
  if (prompt1CountEl) {
    prompt1CountEl.textContent = `Prompt 1 words: ${wc(answerTextEl?.value || "")}`;
  }
  if (draftCountEl) {
    draftCountEl.textContent = `Draft words: ${wc(draftEditedEl?.value || "")}`;
  }
}

function normText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

// Deterministic similarity: Jaccard overlap of word sets
function similarity(a, b) {
  const A = new Set(normText(a).split(" ").filter(Boolean));
  const B = new Set(normText(b).split(" ").filter(Boolean));
  if (A.size === 0 && B.size === 0) return 1;
  if (A.size === 0 || B.size === 0) return 0;

  let inter = 0;
  for (const w of A) if (B.has(w)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

async function copyToClipboard(text) {
  await navigator.clipboard.writeText(String(text || ""));
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
  if (targetWordsEl) targetWordsEl.textContent = data.targetWords || "—";
  minGateEl.textContent = data.minWordsGate || "20";
  if (minGateEchoEl) minGateEchoEl.textContent = data.minWordsGate || "20";

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

 if (insertTemplateBtn) {
  insertTemplateBtn.addEventListener("click", () => {
    answerTextEl.value = data.templateText || "";
    updateWordCount();
  });
}

if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    answerTextEl.value = "";
    updateWordCount();
  });
}


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
answerTextEl.addEventListener("input", updateDraftAndPromptCounts);
updateDraftAndPromptCounts();

  initDraftAssistant();
}

function initDraftAssistant() {
  if (!genDraftBtn || !draftEditedEl || !draftOriginalHiddenEl || !draftMsgEl) return;
  if (!prompt2TextEl || !refineDraftBtn || !finalDraftEl || !finalMsgEl) return;

  const setMsg = (el, msg) => {
    if (!el) return;
    el.textContent = String(msg || "");
  };
  // Live word count for the draft as the student edits
  draftEditedEl.addEventListener("input", updateDraftAndPromptCounts);

  // ✅ Step 2: Generate draft
  genDraftBtn.addEventListener("click", async () => {
    const p1 = String(answerTextEl?.value || "").trim();

    if (wc(p1) < 20) {
      setMsg(draftMsgEl, "Prompt 1 must be at least 20 words.");
      return;
    }

    setMsg(draftMsgEl, "Generating draft…");

    try {
      const draft =
`How to Use Shared Documents Effectively

Shared documents help teams collaborate in real time, but only when used well. Below are practical tips to help new staff work effectively with shared files.

• Use clear file names so others can quickly find the latest version.
• Use comments to explain changes rather than silently rewriting someone else’s work.
• Use track changes or suggestions so edits are transparent.
• Avoid creating duplicate copies of the same document — agree where the “source of truth” lives.
• Check version history before you start editing, and leave a short note when you finish.

In summary, good shared-document habits reduce mistakes and save time.`;

      draftOriginalHiddenEl.value = draft;
      draftEditedEl.value = draft;
updateDraftAndPromptCounts();
      setMsg(draftMsgEl, "Draft generated. Now edit at least 10% in your own words.");
    } catch {
      setMsg(draftMsgEl, "Could not generate draft. Please try again.");
    }
  });

  // ✅ Step 3: Copy edited draft
 copyEditedBtn?.addEventListener("click", async () => {
  try {
    const edited = String(draftEditedEl.value || "");
    if (!edited.trim()) {
      draftMsgEl.textContent = "Nothing to copy yet. Generate and edit the draft first.";
      return;
    }
    await copyToClipboard(edited);
    if (editedDraftToRefineEl) {
      editedDraftToRefineEl.value = edited;
    }
    draftMsgEl.textContent =
      "Copied and pasted into Step 4. You can now write Prompt 2 and refine.";
  } catch {
    draftMsgEl.textContent = "Copy failed. Select the text and copy manually.";
  }
});

  // ✅ Step 4: Refine
  refineDraftBtn.addEventListener("click", async () => {
    const original = String(draftOriginalHiddenEl.value || "");
    const edited = String(editedDraftToRefineEl?.value || "");
    const p2 = String(prompt2TextEl.value || "").trim();

    if (!original) {
      setMsg(finalMsgEl, "Generate a draft first (Step 2).");
      return;
    }

    if (!edited.trim()) {
      setMsg(finalMsgEl, "Paste your edited draft into Step 4 before refining.");
      return;
    }

    const sim = similarity(edited, original);
    if (sim > 0.90) {
      const pct = Math.round(sim * 100);
      setMsg(draftMsgEl, `Edit more before refining. Current similarity: ${pct}%. Aim for ≤90%.`);
      return;
    }

    if (wc(p2) < 20) {
      setMsg(finalMsgEl, "Prompt 2 must be at least 20 words.");
      return;
    }

    setMsg(finalMsgEl, "Refining draft…");

    try {
      const refined =
  edited.trim() +
  "\n\n---\n" +
  "Improvements added by AI:\n" +
  "• Reworded the introduction for clarity and tone for new starters.\n" +
  "• Tightened bullet points to be more action-focused.\n" +
  "• Added a short closing line to reinforce good practice.\n\n" +
  "Tip: You can further ask the AI to suggest alternative phrasings or a checklist version.";

      finalDraftEl.value = refined;
      setMsg(finalMsgEl, "Refined guide ready.");
    } catch {
      setMsg(finalMsgEl, "Could not refine draft. Please try again.");
    }
  });

  copyFinalToGuideBtn?.addEventListener("click", () => {
    if (!finalGuideTextEl) return;
    finalGuideTextEl.value = String(finalDraftEl.value || "");
    setMsg(finalMsgEl, "Copied into FINAL ONE-PAGE GUIDE.");
  });

  copyFinalBtn?.addEventListener("click", async () => {
    try {
      await copyToClipboard(finalDraftEl.value || "");
      setMsg(finalMsgEl, "Copied to clipboard.");
    } catch {
      setMsg(finalMsgEl, "Copy failed. Select the text and copy manually.");
    }
  });
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
  guideScoreWrap.style.display = "none";

  submitBtn.disabled = true;

  try {
    const data = await api("/api/mark", {
      answerText,
      finalGuideText: finalGuideTextEl.value
    });

    const r = data.result;

    if (r.gated) {
      feedbackBox.textContent = r.message || "Please add to your answer.";
      return;
    }

    scoreBig.textContent = `${r.score}/10`;

// ✅ Hard gate message for final guide (<300 words)
if (r.guideGated) {
  guideScoreWrap.style.display = "none";

  // Append the guide gate message so students understand what to fix
  const existing = String(feedbackBox.textContent || "").trim();
  const msg = r.guideMessage || "Final guide must be at least 300 words.";
  feedbackBox.textContent = existing ? `${existing}\n\nFINAL GUIDE: ${msg}` : `FINAL GUIDE: ${msg}`;
}

    // Final guide score (Stage 3)
    if (typeof r.guideScore === "number") {
      guideScoreBig.textContent = `${r.guideScore}/10`;
      guideStrengths.innerHTML = (r.guideStrengths || [])
        .map(x => `<li>${escapeHtml(x)}</li>`)
        .join("");
      guideImprovements.innerHTML = (r.guideImprovements || [])
        .map(x => `<li>${escapeHtml(x)}</li>`)
        .join("");
      guideScoreWrap.style.display = "block";
    }

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
loadConfig()
  .catch((e) => console.warn("Config load failed:", e))
  .finally(() => showGate());
});
