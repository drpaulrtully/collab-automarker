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
// Workflow evidence flags (sent to server on /api/mark)
let didCopyEditedToStep4 = false;
let didRefine = false;


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


  logoutBtn?.addEventListener("click", async () => {
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
  learnMoreBtn?.addEventListener("click", () => {
    const expanded = learnMoreBtn.getAttribute("aria-expanded") === "true";
    setExpanded(learnMoreBtn, frameworkPanel, !expanded);
  });

  // Word count live
  answerTextEl?.addEventListener("input", updateWordCount);
  updateWordCount();
answerTextEl?.addEventListener("input", updateDraftAndPromptCounts);
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
      const draft = `
### How to Share Documents Effectively  

**Introduction and rationale**  
FEthink is a multi-site organisation, with teams based both in the UK and overseas. We depend on shared documents to draft reports, design courses and manage projects efficiently across locations and time zones. When documents are not shared or updated properly, the risks are significant: colleagues may work from outdated versions, key decisions can be made on incomplete or incorrect information, and staff may waste time duplicating work that has already been done. Poor document practice can also create compliance and audit issues if important records are scattered across personal drives or email threads instead of being held in one agreed location.  

Good document-sharing habits ensure that everyone can access the same, most up-to-date information and that changes are transparent, traceable and easy to review. This is central to FEthink’s commitment to collaboration, quality and accountability.  

**Good practice guidelines**  

- **Use clear, consistent file names**  
  Include the project, topic and status (for example, “L3-Curriculum-Plan_v1.2_Approved”). Consistent naming conventions help colleagues quickly identify the correct file and reduce the chance of editing obsolete or draft versions by mistake.  

- **Agree a single “source of truth”**  
  As a team, decide where the live version of each key document will be stored (such as a specific shared drive or folder). Avoid keeping local copies on desktops or relying on attachments in email chains. A single authoritative location prevents version conflicts and confusion.  

- **Make your edits transparent**  
  Use track changes, “suggesting” mode or equivalent tools so that others can see exactly what you have altered. Transparent editing speeds up review, supports accountability and makes it straightforward to accept, reject or reverse changes.  

- **Use comments to explain your thinking**  
  Rather than silently rewriting sections, add brief comments to explain why you propose a change, highlight issues or pose questions. This respects the original author’s intent, reduces misunderstandings and turns the document into a record of shared reasoning and decisions.  

- **Check history before and after editing**  
  Review the version history or recent activity before you begin so you understand what has changed since you last viewed the document. When you finish, leave a short note (for example, in comments, or a simple change log) summarising what you did and any follow-up actions needed from others.  

**Summary and quick checklist**  
Effective document sharing is about clarity, consistency and transparency. When everyone follows these simple practices, teams save time, reduce errors and maintain a reliable record of their work and decisions.  

**Checklist before you close a shared document:**  
- Is the file stored in the agreed “source of truth” location?  
- Is the file name clear, consistent and up to date?  
- Are your edits visible (track changes/suggestions) rather than hidden?  
- Have you added comments where explanation is needed?  
- Have you checked and updated the version history or change log if required?
`.trim();


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
  didCopyEditedToStep4 = true;
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
      const refined = `
### How to Share Documents Effectively  

**Introduction and rationale**  
FEthink is a multi-site organisation, with teams working across the UK and overseas, often asynchronously. Shared documents are one of our main tools for thinking, drafting and deciding together. When they are well managed, they reduce duplication, speed up projects and make our work more transparent. When they are not, the impact can be serious: staff may act on outdated information, effort is wasted re-doing or reconciling competing versions, and important decisions can be hard to evidence. Fragmented files also create avoidable risks for data protection, audit and quality assurance.  

Effective document-sharing is therefore not just a technical habit; it is part of how we work professionally and how we demonstrate accountability to colleagues, partners and regulators.  

**Good practice guidelines**  

- **Use clear, consistent file names and locations**  
  Include project, topic, version and status (for example, “L2-Maths-Scheme_v1.3_Draft”). Agree team naming rules and store documents in the correct shared area from the outset. This makes files easy to locate, reduces accidental use of old versions and helps new colleagues understand the structure quickly.  

- **Agree a single “source of truth” for each document**  
  Decide which file is the live version and where it lives. Avoid downloading and editing local copies unless absolutely necessary; if you must, upload changes back into the agreed file promptly. A clearly identified source of truth prevents parallel documents and conflicting edits.  

- **Make edits transparent and reversible**  
  Use track changes, “suggesting” mode or equivalent so that others can see what has been altered, by whom and when. Where possible, group related edits and label them in comments. This supports quicker approval, clearer accountability and safer rollback if something needs to be undone.  

- **Use comments and tagging to communicate**  
  Use comments to explain why you are changing something, raise questions or flag uncertainties. Tag colleagues (for example, with “@Name”) when you need a specific response. This keeps discussion attached to the relevant text and reduces long email chains.  

- **Manage access and confidentiality appropriately**  
  Before sharing, check who can see and edit the document. Use view-only or comment-only access when appropriate, and avoid storing sensitive information in general-access folders. Correct permissions protect data and prevent unintended changes.  

- **Plan for versioning and milestones**  
  For longer projects, agree when to “lock” a version (for example, at submission or sign-off) and how to label it (such as “_Approved” or “_Archived”). This provides a clear record of what was agreed at each stage and avoids overwriting final copies.  

- **Check history and leave a trace of your work**  
  Before editing, scan recent activity or version history to understand what’s changed. When you finish, add a brief note (in comments, a header, or a change log) summarising your key edits and any actions needed from others. This helps colleagues pick up where you left off.  

**Summary**  
Thoughtful document-sharing helps FEthink work as one organisation rather than many separate sites. Clarity, transparency and appropriate access are the foundations of good practice.  

**Extended checklist before you close a shared document**  
- Is the document saved in the correct shared folder and agreed “source of truth” location?  
- Does the file name follow team conventions (project/topic + version + status)?  
- Have you avoided creating duplicate local or email-only versions?  
- Are your edits visible through track changes or suggestion mode?  
- Have you explained significant changes or queries in comments?  
- Have you tagged colleagues who need to review or respond?  
- Are the sharing permissions (view/edit/comment) appropriate and safe?  
- Have you checked recent activity or version history before and after editing?  
- If this is a milestone version, have you clearly labelled it (for example, “_Approved”)?  
- Would a new team member be able to understand what changed and why from the document alone?  

---

## What the AI improved and why

**The refined guide made four main changes:**

### Tone and depth  
- The draft guide is functional and concise; it reads like a quick “how-to” note.  
- The refined guide has a more professional, coaching tone. It explains why practices matter (risks, accountability, audit, data protection), not just what to do.

### Structure and signposting  
- The draft guide has a short intro, a list, and a brief summary.  
- The refined guide adds clearer sections (introduction and rationale, guidelines, summary, extended checklist), so it reads more like a short internal guidance document than a memo.

### Quality and richness of explanations  
- In the draft guide, bullets are single sentences focused on behaviour.  
- In the refined guide, each bullet is expanded into a short sub-section: it names the principle, gives a concrete example, and spells out the practical benefits (e.g. avoiding obsolete versions, easing onboarding, enabling rollback, cutting email traffic).

### Practical detail and safeguards  
- The draft guide focuses on collaboration basics (naming, comments, version history).  
- The refined guide adds: access/permissions and confidentiality, tagging colleagues, local vs source-of-truth copies, milestone versions, and a longer checklist that prompts the reader to think about safety, clarity and future readers as well as immediate collaborators.
`.trim();

      finalDraftEl.value = refined;
didRefine = true;
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
    const workflowEvidence = {
  prompt2WordCount: prompt2TextEl ? wc(prompt2TextEl.value) : null,
  similarityPct: (() => {
    try {
      const orig = String(draftOriginalHiddenEl?.value || "");
      const edited = String(editedDraftToRefineEl?.value || "");
      if (!orig.trim() || !edited.trim()) return null;
      return Math.round(similarity(edited, orig) * 100);
    } catch {
      return null;
    }
  })(),
  didRefine,
  didCopyEditedToStep4
};

const data = await api("/api/mark", {
  answerText,
  finalGuideText: finalGuideTextEl.value,
  workflowEvidence
});


    const r = data.result;

    if (r.gated) {
      feedbackBox.textContent = r.message || "Please add to your answer.";
      return;
    }

    scoreBig.textContent = `${r.score}/10`;

// ✅ Hard gate message for final guide (<300 words)
if (r.guideGated) {
  if (guideScoreWrap) guideScoreWrap.style.display = "none";

  const existing = String(feedbackBox.textContent || "").trim();
  const msg = r.guideMessage || "Final guide must be at least 300 words.";
  feedbackBox.textContent = existing
    ? `${existing}\n\nFINAL GUIDE: ${msg}`
    : `FINAL GUIDE: ${msg}`;

  finalGuideTextEl?.focus();

  // Optional: remove alert if you prefer a quieter UX
  alert("Your final guide must be at least 300 words before you can submit for feedback.");

  return;
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
