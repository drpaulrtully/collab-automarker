import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));

// ✅ Static files must live in /public
app.use(express.static("public"));

/* =========================================================
   FEthink — Collaboration & Editing Automarker (Shared Documents)
   - Access code gate -> signed httpOnly cookie session
   - Deterministic marker (no LLM calls)
   - <20 words: show only “Please add…” (no score/tags/grid/learn more/model)
   - >=20 words: full feedback + learn more + model answer available
   ========================================================= */

const ACCESS_CODE = process.env.ACCESS_CODE || "FETHINK-COLLAB-01";
const COOKIE_SECRET =
  process.env.COOKIE_SECRET || crypto.randomBytes(32).toString("hex");
const SESSION_MINUTES = parseInt(process.env.SESSION_MINUTES || "120", 10);

const COURSE_BACK_URL = process.env.COURSE_BACK_URL || "";
const NEXT_LESSON_URL = process.env.NEXT_LESSON_URL || "";

// Signed cookie parser
app.use(cookieParser(COOKIE_SECRET));

/* ---------------- Session cookie helpers ---------------- */
const COOKIE_NAME = "fethink_session";

function setSessionCookie(res) {
  const expires = new Date(Date.now() + SESSION_MINUTES * 60 * 1000);
  res.cookie(COOKIE_NAME, "ok", {
    httpOnly: true,
    sameSite: "lax",
    signed: true,
    secure: true,
    expires
  });
}

function requireSession(req, res, next) {
  const ok = req.signedCookies && req.signedCookies[COOKIE_NAME] === "ok";
  if (!ok) return res.status(401).json({ ok: false, error: "locked" });
  next();
}

function clampStr(v, max) {
  const s = String(v || "");
  return s.length > max ? s.slice(0, max) : s;
}

function wordCount(s) {
  const t = String(s || "").trim();
  if (!t) return 0;
  return t.split(/\s+/).filter(Boolean).length;
}

function hasAny(t, needles) {
  return needles.some((n) => t.includes(n));
}

function countAny(t, needles) {
  let c = 0;
  for (const n of needles) if (t.includes(n)) c += 1;
  return c;
}
function toNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function markFinalGuide(text) {
  const wc = wordCount(text);
  // ✅ HARD GATE: final guide must be at least 300 words
  if (wc < 300) {
    return {
      guideGated: true,
      guideMessage: "Final guide is too short. Minimum 300 words required before it can be scored.",
      guideScore: null,
      guideStrengths: [],
      guideImprovements: ["Expand your guide to at least 300 words, then resubmit."],
      guideWarnings: [`Current word count: ${wc}. Minimum required: 300.`]
    };
  }

  const s = String(text || "");
  const hasIntro = wc > 50;

  const hasTitle = /^.+\n/.test(s.trim());
  const bulletCount = (s.match(/•|\-|\*/g) || []).length;
  const hasClosing = /summary|in summary|to conclude|overall/i.test(s);
  const hasPersonal = /i\s|my\s|personal example:/i.test(s);
  const inRange = wc >= 300 && wc <= 400;

  let score = 0;
  if (hasTitle) score += 2;
  if (hasIntro) score += 2;
  if (bulletCount >= 4) score += 2;
  if (hasClosing) score += 2;
  if (hasPersonal) score += 2;

  const strengths = [];
  if (hasTitle) strengths.push("Clear title provided.");
  if (bulletCount >= 4) strengths.push("Practical bullet tips included.");
  if (hasPersonal) strengths.push("Personal example included.");

  const improvements = [];
  if (!hasClosing) improvements.push("Add a one-sentence closing summary.");
  if (!inRange) improvements.push("Keep the final guide to one page (300–400 words).");
  if (!hasPersonal) improvements.push("Add one short personal example.");

  const warnings = [];
  if (!inRange) warnings.push("Word count outside the 300–400 one-page limit.");
// Optional minor penalty if over the 400-word guidance (hard fail only applies <300)
if (wc > 400) score = Math.max(0, score - 1);


return {
  guideGated: false,
  guideMessage: null,

  guideScore: Math.max(0, Math.min(10, score)),
  guideStrengths: strengths.slice(0, 3),
  guideImprovements: improvements.slice(0, 3),
  guideWarnings: warnings
};
} // <-- closes markFinalGuide properly

/* ---------------- Task content ---------------- */
const TEMPLATE_TEXT = `Role:
Task:
Context:
Format:`;

const QUESTION_TEXT = `
<div class="taskText">
  <h3>Task overview</h3>
  <p>You are a new team member in a busy office. Your team is creating a one-page internal guide titled <strong>“How to Use Shared Documents Effectively”</strong> for new staff. You will use <strong>AI as a collaborative partner</strong> while keeping control of the final wording.</p>

  <h3>Scenario</h3>
  <p>This activity simulates real workplace collaboration on documents like reports or guides. Follow the process from the video: <strong>draft → edit in your voice → refine with AI → review</strong>.</p>

  <h3>Your tasks</h3>

  <h4>Task 1 (Basic) — Draft + personal edit</h4>
  <ul>
    <li>Use AI to generate a <strong>first draft</strong> of the guide (short introduction + <strong>4–5 bullet tips</strong>).</li>
    <li>Edit <strong>one section in your own words</strong> to add a personal example from office life.</li>
  </ul>

  <h4>Task 2 (Advanced) — Editing focus</h4>
  <ul>
    <li>Paste your edited draft back into AI.</li>
    <li>Ask the AI to review for <strong>clarity, consistency, tone, and flow</strong> (without changing meaning).</li>
    <li>Incorporate <strong>2–3 specific AI suggestions</strong>, then ask the AI to <strong>tighten</strong> the final version (remove repetition; add a short summary).</li>
    <li>Final output should be <strong>~300–400 words</strong> (one page).</li>
  </ul>

  <h3>What you must write here</h3>
  <p>Write <strong>two FEthink prompts</strong> using the four-step structure:</p>
  <p><strong>Role → Task → Context → Format</strong></p>

  <ol>
    <li><strong>Prompt 1:</strong> for Task 1 (draft the guide)</li>
    <li><strong>Prompt 2:</strong> for Task 2 (review + improve the edited draft)</li>
  </ol>

  <h3>Output constraint</h3>
  <ul>
    <li><strong>Keep your final guide to one page (max 400 words).</strong></li>
  </ul>
</div>
`;

const MODEL_ANSWER =
`EXEMPLARY FEthink RESPONSE (two prompts)

PROMPT 1 — Task 1 (Draft)
Role: You are a professional business writer who specialises in short staff training guides.
Task: Draft a one-page internal guide titled “How to Use Shared Documents Effectively” with (1) a brief introduction and (2) 4–5 practical bullet tips for new staff.
Context: This is for new office staff. Use simple, professional language. Focus on collaboration behaviours such as version control, comments, track changes/suggestions, naming conventions, and avoiding duplication.
Format: Title, intro paragraph (3–4 sentences), bullet list (4–5 bullets with bolded lead phrase), and a one-sentence closing summary.

PROMPT 2 — Task 2 (Edit + refine)
Role: You are a neutral editor collaborating on team documents.
Task: Review the draft I paste below for clarity, consistency, tone, and logical flow. Suggest 3–4 specific improvements WITHOUT changing meaning. Then provide a tightened final version (~300–400 words) that removes repetition and ends with a short summary sentence.
Context: Internal guide for beginners. Keep the tone professional but approachable. Preserve my personal example and keep it realistic for a busy office environment.
Format:
1) Numbered list of suggestions (Original → Revised → Reason).
2) Then “Final polished version” with the finished guide.
`;


/* ---------------- Learn more (4 tabs; IDs fixed) ---------------- */
const FRAMEWORK = {
 gdpr: {
    expectation:
      "Treat AI as a colleague: don’t accept the first draft. Critique it, ask for alternatives, and request reasoning so you can choose the best option.",
    case:
      "Try: “Give me 2 alternative versions with different tones (formal vs friendly). Explain which is best for new starters and why.”"
  },
  unesco: {
    expectation:
      "Communicate precisely: specify role, audience, and constraints. Then iterate with clarifying questions to improve accuracy and usefulness.",
    case:
      "Try: “Ask me 5 questions to clarify the audience, tools (Word/Google Docs), and house style before you write the guide.”"
  },
  ofsted: {
    expectation:
      "Always human-review: check facts, tone, and clarity. Your judgement is the quality filter — AI is a drafting and editing assistant.",
    case:
      "Try: “List 5 risks in this draft (ambiguity, jargon, wrong assumptions). Suggest fixes while keeping the meaning the same.”"
  },
  jisc: {
    expectation:
      "Combine strengths: use AI for speed (drafts/reviews) and use your expertise for context, examples, and final decisions.",
    case:
      "Try: “Tighten this text by removing repetition and shortening sentences, but keep my personal example unchanged.”"
  }
};

/* ---------------- Deterministic rubric targets ---------------- */
const STRUCTURE_HITS = [["role:"], ["task:"], ["context"], ["format"]];

// Signals the learner is using an iterative, collaborative workflow
const COLLAB_HITS = [
  "draft", "first draft", "initial draft",
  "edit", "edited", "in my own words", "my own words", "personal example", "example",
  "review", "clarity", "consistency", "tone", "flow",
  "suggest", "suggestions", "incorporate", "adopt", "revision", "revise",
  "tighten", "remove repetition", "summary"
];

// Quality/format signals for the requested guide output
const OUTPUT_QUALITY_HITS = [
  "how to use shared documents effectively",
  "introduction", "intro",
  "bullet", "bullets",
  "version control", "track changes", "suggesting", "suggestions", "comments",
  "naming", "file name", "naming convention",
  "one page", "one-page",
  "300", "350", "400", "300–400", "300-400"
];

/* ---------------- Status helpers ---------------- */
function statusFromLevel(level) {
  if (level >= 2) return "✓ Secure";
  if (level === 1) return "◐ Developing";
  return "✗ Missing";
}

function tagStatus(level) {
  if (level >= 2) return "ok";
  if (level === 1) return "mid";
  return "bad";
}

/* ---------------- Marker ---------------- */
function markPrioritisationPrompt(answerText, workflowEvidence = null) {
  const wc = wordCount(answerText);

  // ✅ HARD GATE
  if (wc < 20) {
    return {
      gated: true,
      wordCount: wc,
      message:
        "Please add to your answer.\n" +
        "This response is too short to demonstrate two complete FEthink prompts.\n" +
        "Aim for 20+ words and include Role, Task, Context, and Format for BOTH Task 1 and Task 2.",
      score: null,
      feedback: null,
      strengths: null,
      tags: null,
      grid: null,
      framework: null,
      modelAnswer: null
    };
  }

  const t = String(answerText || "").toLowerCase();

  // Category A: Prompt structure (0–10)
  let structHits = 0;
  for (const hits of STRUCTURE_HITS) if (hasAny(t, hits)) structHits += 1;

  let structureLevel = 0;
  let structurePts = 0;
  const notes = [];

  if (structHits >= 4) {
    structureLevel = 2;
    structurePts = 10;
  } else if (structHits >= 2) {
    structureLevel = 1;
    structurePts = 7;
    notes.push(
      "Prompt structure: Use all four labelled parts (Role, Task, Context, Format). Include them for BOTH prompts."
    );
  } else {
    structureLevel = 0;
    structurePts = 3;
    notes.push(
      "Prompt structure: Rewrite using the FEthink structure (Role / Task / Context / Format) rather than a single paragraph."
    );
  }

// Category B: AI collaboration & iteration (0–10)
const collabCount = countAny(t, COLLAB_HITS);
const mentionsTwoPrompts =
  hasAny(t, ["prompt 1", "prompt one", "task 1"]) &&
  hasAny(t, ["prompt 2", "prompt two", "task 2"]);
const mentionsReviewDimensions = hasAny(t, ["clarity", "consistency", "tone", "flow"]);

let collabLevel = 0;
let collabPts = 0;

// Prefer behavioural evidence (sent from client). If it's missing, only score what we can *infer* from the text.
const we = (workflowEvidence && typeof workflowEvidence === "object") ? workflowEvidence : null;
const similarityPct = we ? toNum(we.similarityPct, null) : null;
const prompt2WordCount = we ? toNum(we.prompt2WordCount, null) : null;
const didRefine = we ? !!we.didRefine : false;
const didCopyEditedToStep4 = we ? !!we.didCopyEditedToStep4 : false;

const hasAnyWorkflowSignal =
  similarityPct !== null ||
  prompt2WordCount !== null ||
  didRefine ||
  didCopyEditedToStep4;

if (hasAnyWorkflowSignal) {
  const hasPrompt2 = (prompt2WordCount !== null) ? (prompt2WordCount >= 20) : mentionsTwoPrompts;
  const meaningfulEdit = (similarityPct !== null) ? (similarityPct <= 90) : false; // ≤90% similarity => ≥10% change
  const carriedForward = didRefine || didCopyEditedToStep4;

  const evidenceHits = [hasPrompt2, meaningfulEdit, carriedForward].filter(Boolean).length;

  if (evidenceHits >= 3) {
    collabLevel = 2;
    collabPts = 10;
  } else if (evidenceHits === 2) {
    collabLevel = 1;
    collabPts = 7;
    notes.push("Collaboration: You showed some workflow evidence, but complete the full cycle (draft → meaningful edit → refine) for a top score.");
  } else {
    collabLevel = 0;
    collabPts = 3;
    notes.push("Collaboration: Evidence suggests the full workflow wasn’t completed (draft → meaningful edit (≥10%) → refine). Complete all steps, then resubmit.");
  }
} else {
  // Text-only fallback (honest): cap at 'Developing' because we can't verify real collaboration actions
  if (mentionsTwoPrompts && mentionsReviewDimensions && collabCount >= 8) {
    collabLevel = 1;
    collabPts = 7;
    notes.push("Collaboration: Your prompts describe the workflow well. To score higher, the system needs workflow evidence (edit/refine actions).");
  } else if (mentionsTwoPrompts && (collabCount >= 5 || mentionsReviewDimensions)) {
    collabLevel = 1;
    collabPts = 7;
    notes.push(
      "AI collaboration: Show the full workflow — draft, human edit (personal example), AI review (clarity/tone/flow), then tighten the final version."
    );
  } else {
    collabLevel = 0;
    collabPts = 3;
    notes.push(
      "AI collaboration: Include TWO prompts and make Task 2 an editing review prompt (clarity, consistency, tone, flow) with 2–3 incorporated suggestions."
    );
  }
}

  // Category C: Output quality & constraints (0–10)
  const qualityCount = countAny(t, OUTPUT_QUALITY_HITS);
  const hasTitle = hasAny(t, ["how to use shared documents effectively"]);
  const hasBullets = hasAny(t, ["bullet", "bullets"]);
  const hasLength = hasAny(t, [
    "300", "350", "400", "300–400", "300-400",
    "~300", "~350", "~400", "one page", "one-page"
  ]);
  const hasCollabContent = hasAny(t, [
    "comments", "commenting", "track changes", "suggest",
    "version control", "naming convention", "version"
  ]);

  const qualityChecks = [hasTitle, hasBullets, hasLength, hasCollabContent].filter(Boolean)
    .length;

  let qualityLevel = 0;
  let qualityPts = 0;

  if (qualityChecks >= 4 && qualityCount >= 8) {
    qualityLevel = 2;
    qualityPts = 10;
  } else if (qualityChecks >= 2) {
    qualityLevel = 1;
    qualityPts = 7;
    notes.push(
      "Output quality: Constrain the AI output (title, intro + 4–5 bullets + closing summary) and specify ~300–400 words (one page)."
    );
  } else {
    qualityLevel = 0;
    qualityPts = 3;
    notes.push(
      "Output quality: Specify the guide structure (title, intro, 4–5 bullets, closing summary) and include shared-document behaviours (comments, version control, track changes)."
    );
  }

    // Total /30 averaged to /10
  const total30 = structurePts + collabPts + qualityPts;
  let score = Math.round(total30 / 3);
  score = Math.max(0, Math.min(10, score));

  // Banding
  let band = "Vague";
  if (score >= 8) band = "Excellent";
  else if (score >= 6) band = "Good";
  else if (score >= 3) band = "Fair";

  const strengths = [];
  if (structureLevel >= 1)
    strengths.push(
      "You used the FEthink structure (Role, Task, Context, Format), which makes AI outputs more reliable."
    );
  if (collabLevel >= 1)
    strengths.push(
      "You showed an iterative workflow (draft → human edit → AI review → tighten), which is how AI collaboration works in real workplaces."
    );
  if (qualityLevel >= 1)
    strengths.push(
      "You constrained the output to a one-page guide with a clear structure and practical shared-document tips."
    );
 
  const tags = [
    { name: "FEthink prompt structure", status: tagStatus(structureLevel) },
    { name: "Iterative AI collaboration", status: tagStatus(collabLevel) },
    { name: "Clear output constraints", status: tagStatus(qualityLevel) },
    { name: "Workplace relevance", status: tagStatus(hasCollabContent ? 2 : 1) }
  ];

  // Grid IDs must not change in the front-end
  const grid = {
    ethical: statusFromLevel(structureLevel), // prompt structure
    impact: statusFromLevel(collabLevel), // collaboration
    legal: statusFromLevel(qualityLevel), // output quality
    structure: statusFromLevel(hasLength ? 2 : 1) // constraints/length
  };

  const feedback =
    notes.length === 0
      ? `Strong submission plan — your prompts should produce a clear one-page guide. Band: ${band} (${score}/10).`
      : `To improve (Band: ${band} • ${score}/10):\n- ` + notes.join("\n- ");

  return {
    gated: false,
    wordCount: wc,
    score,
    strengths: strengths.slice(0, 3),
    tags,
    grid,
    framework: FRAMEWORK,
    feedback,
    modelAnswer: MODEL_ANSWER
  };
}

/* ---------------- Routes ---------------- */
app.get("/api/config", (_req, res) => {
  res.json({
    ok: true,
    courseBackUrl: COURSE_BACK_URL,
    nextLessonUrl: NEXT_LESSON_URL,
    questionText: QUESTION_TEXT,
    templateText: TEMPLATE_TEXT,
    targetWords: "300–400",
    minWordsGate: 20
  });
});

app.post("/api/unlock", (req, res) => {
  const code = String(req.body?.code || "").trim();
  if (!code) return res.status(400).json({ ok: false, error: "missing_code" });

  const a = Buffer.from(code);
  const b = Buffer.from(ACCESS_CODE);

  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ ok: false, error: "incorrect_code" });
  }

  setSessionCookie(res);
  res.json({ ok: true });
});

app.post("/api/mark", requireSession, (req, res) => {
  const answerText = clampStr(req.body?.answerText, 6000);
  const finalGuide = clampStr(req.body?.finalGuideText, 8000);

  const workflowEvidence = req.body?.workflowEvidence || null;
const promptResult = markPrioritisationPrompt(answerText, workflowEvidence);
  const guideResult = markFinalGuide(finalGuide);

  res.json({
    ok: true,
    result: {
      ...promptResult,
      ...guideResult
    }
  });
});

app.post("/api/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get("/health", (_req, res) => res.status(200).send("ok"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FEthink automarker running on ${PORT}`));
