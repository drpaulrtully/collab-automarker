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

  <p>Then add <strong>2–4 lines</strong> explaining what evidence you would submit (e.g., final document + screenshots or copy/paste of prompts and AI responses).</p>

  <h3>Output constraint</h3>
  <ul>
    <li><strong>Keep your response to one page (max 400 words).</strong></li>
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

EVIDENCE I WOULD SUBMIT (2–4 lines)
• Final one-page guide (Word/PDF) 
• Screenshots or copy/paste of my prompts and the AI responses for Task 1 and Task 2
• Highlighted edits showing what I changed and which AI suggestions I adopted
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

// Evidence/reflection signals
const EVIDENCE_HITS = [
  "upload", "uploaded",
  "screenshot", "screenshots",
  "copy", "copy/paste", "paste",
  "prompts", "ai responses", "responses",
  "final document", "word", "google doc", "pdf",
  "highlight", "highlighted", "tracked changes"
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
function markPrioritisationPrompt(answerText) {
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

  if (mentionsTwoPrompts && mentionsReviewDimensions && collabCount >= 8) {
    collabLevel = 2;
    collabPts = 10;
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

  // Category D: Evidence / reflection (0–10)
  const evidenceCount = countAny(t, EVIDENCE_HITS);
  const mentionsEvidenceLines =
    hasAny(t, ["evidence", "submit", "submission", "upload"]) || evidenceCount >= 3;

  let evidenceLevel = 0;
  let evidencePts = 0;

  if (mentionsEvidenceLines && evidenceCount >= 6) {
    evidenceLevel = 2;
    evidencePts = 10;
  } else if (mentionsEvidenceLines) {
    evidenceLevel = 1;
    evidencePts = 7;
    notes.push(
      "Evidence: Add 2–4 lines stating what you would submit (final doc + screenshots or copy/paste of prompts and AI responses)."
    );
  } else {
    evidenceLevel = 0;
    evidencePts = 3;
    notes.push(
      "Evidence: Include a short note on what you would upload/attach as proof (final guide + prompt/response evidence)."
    );
  }

  // Total /40 averaged to /10
  const total40 = structurePts + collabPts + qualityPts + evidencePts;
  let score = Math.round(total40 / 4);
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
  if (evidenceLevel >= 1)
    strengths.push(
      "You considered evidence (final document + prompt/response proof), supporting accountability and reflection."
    );

  const tags = [
    { name: "FEthink prompt structure", status: tagStatus(structureLevel) },
    { name: "Iterative AI collaboration", status: tagStatus(collabLevel) },
    { name: "Clear output constraints", status: tagStatus(qualityLevel) },
    { name: "Evidence & reflection", status: tagStatus(evidenceLevel) },
    { name: "Workplace relevance", status: tagStatus(hasCollabContent ? 2 : 1) }
  ];

  // Grid IDs must not change in the front-end
  const grid = {
    ethical: statusFromLevel(structureLevel), // prompt structure
    impact: statusFromLevel(collabLevel), // collaboration
    legal: statusFromLevel(qualityLevel), // output quality
    recs: statusFromLevel(evidenceLevel), // evidence
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
  const result = markPrioritisationPrompt(answerText);
  res.json({ ok: true, result });
});

app.post("/api/logout", (_req, res) => {
  res.clearCookie(COOKIE_NAME);
  res.json({ ok: true });
});

app.get("/health", (_req, res) => res.status(200).send("ok"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FEthink automarker running on ${PORT}`));
