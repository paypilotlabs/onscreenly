// @ts-check
// prompts.js — Feature definitions with interview-category-aware system prompts.
// ctx = { transcript, userText, settings }
// System prompt receives the interview context block prepended by app/main/llm-runner.js,
// then optionally the user's AI rules appended at the end.

const { appendAiRules } = require('../context/profile-context');
const { describeKeywordMatch, keywordMatch } = require('../context/resume-analysis');

// The analysis reads the whole résumé and job description, not the clipped
// excerpts live answers use.
const ANALYSIS_RESUME_CHARS = 12000;
const ANALYSIS_JD_CHARS = 6000;

function clipFor(text, limit) {
  const value = String(text || '').trim();
  return value.length > limit ? value.slice(0, limit).trimEnd() + '…' : value;
}

function formatTranscript(turns, limit) {
  const recent = limit ? turns.slice(-limit) : turns;
  return recent.map((t) => (t.channel === 'them' ? 'Them: ' : 'You: ') + t.text).join('\n');
}

function buildSystem(base, contextBlock) {
  if (!contextBlock) return base;
  return contextBlock + '\n\n' + base;
}

// Apply AI rules to a system prompt if the mode wants them. LeetCode returns
// the prompt unchanged — code answers should stay strict regardless of how the
// user wants the AI to chat.
function applyRules(prompt, aiRules, mode) {
  if (mode === 'leetcode') return prompt;
  return appendAiRules(prompt, aiRules);
}

const BASE_RULES =
  'Always respond in clear, natural English. Never switch to Hindi or any other language unless the user explicitly asks for it. ';

const MODES = {
  // ── Assist: one-shot "do the smart thing" ─────────────────────────────────
  assist: {
    needsScreen: true,
    userBubble: null,
    small: false,
    resumeMode: 'assist',
    buildSystem(contextBlock, aiRules) {
      return applyRules(
        buildSystem(
          "You are Onscreenly, a discreet real-time copilot overlaid on the user's screen during an interview or coding session. " +
            BASE_RULES +
            'Look at the screenshot and the recent conversation, decide what the user needs RIGHT NOW, and deliver it directly with no preamble.\n\n' +
            'Detect the question type and respond accordingly:\n' +
            '• BEHAVIORAL ("tell me about a time…"): Give a complete STAR answer (Situation, Task, Action, Result) using the candidate\'s real stories when available. Be specific, include metrics, 3–4 sentences.\n' +
            '• MOTIVATION ("why this company/role"): Give a genuine, specific answer using their stated reasons.\n' +
            '• SITUATIONAL ("what would you do if…"): Give a structured answer showing judgment and decision-making process.\n' +
            '• EXPERIENCE ("tell me about your role at X"): Draw from the resume to give a specific, proud answer.\n' +
            '• TECHNICAL/CONCEPTUAL: Explain clearly with examples. For LeetCode: short approach + solution + complexity.\n' +
            '• COMPENSATION ("salary expectations"): Use their stated target, give a confident range.\n' +
            '• "Any questions for us?": Offer 2–3 of their prepared questions.\n\n' +
            'Write in first person as if the candidate is speaking. No preamble, no "Here\'s what you could say". Just the answer.',
          contextBlock
        ),
        aiRules,
        'assist'
      );
    },
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 14);
      return 'Recent conversation:\n' + (t || '(none)') + '\n\nRespond with exactly what I should say right now.';
    }
  },

  // ── Say: what to say next ──────────────────────────────────────────────────
  say: {
    needsScreen: false,
    userBubble: 'What should I say?',
    small: false,
    resumeMode: 'say',
    buildSystem(contextBlock, aiRules) {
      return applyRules(
        buildSystem(
          'You are Onscreenly, whispering the perfect reply to the candidate during a live interview. ' +
            BASE_RULES +
            '"Them" is the interviewer; "You" is the candidate.\n\n' +
            'Draft ONE natural, confident reply the candidate can say out loud, in first person.\n\n' +
            'Rules by question type:\n' +
            '• BEHAVIORAL: Use a real STAR story from their background. Situation (1 sentence) → Task (1 sentence) → Action (2–3 sentences, specific steps) → Result (1 sentence with metric if possible). Never generic.\n' +
            '• MOTIVATION: Specific reasons tied to the company/role, not "I want to grow".\n' +
            '• SITUATIONAL: Show structured thinking — "I\'d first X, then Y, because Z".\n' +
            '• EXPERIENCE: Reference the specific role/project from their resume.\n' +
            '• COMPENSATION: State the target range confidently without over-explaining.\n' +
            '• TECHNICAL: Give a clear, confident explanation. Use analogies for non-technical interviewers.\n\n' +
            'No quotes, no preamble. Write the actual words to say. 2–5 sentences.',
          contextBlock
        ),
        aiRules,
        'say'
      );
    },
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 16);
      return 'Interview conversation so far:\n' + (t || '(listening not started yet)') + '\n\nWhat should I say next?';
    }
  },

  // ── Recap ──────────────────────────────────────────────────────────────────
  recap: {
    needsScreen: false,
    userBubble: 'Recap',
    small: true,
    resumeMode: 'recap',
    transcriptRequired: true,
    buildSystem(contextBlock, aiRules) {
      return applyRules(
        buildSystem(
          'You are Onscreenly. Recap this conversation so far, using only what is in the transcript:\n' +
            '• Topics covered — the actual subjects discussed, with the specifics (names, numbers, decisions) mentioned\n' +
            '• Questions asked — by either side, as they were phrased\n' +
            '• Key points made — what each side said or committed to\n' +
            '• Open threads — anything unresolved, unclear, or worth strengthening\n' +
            'If the context block shows this is a job interview, frame the last section as areas for the candidate to strengthen. ' +
            'Do not pad thin sections with generic filler; omit a header that has nothing real under it. ' +
            'Use short bullets under bold headers. Be concise.',
          contextBlock
        ),
        aiRules,
        'recap'
      );
    },
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 0);
      return (
        'Full transcript of the conversation:\n' + (t || '(nothing captured yet)') + '\n\nRecap this conversation.'
      );
    }
  },

  // ── Ask: free-form question ────────────────────────────────────────────────
  ask: {
    needsScreen: true,
    userBubble: null,
    small: false,
    resumeMode: 'ask',
    buildSystem(contextBlock, aiRules) {
      return applyRules(
        buildSystem(
          "You are Onscreenly, a real-time copilot with access to the candidate's screen and live interview. " +
            BASE_RULES +
            'Answer the question directly and concisely. ' +
            "When the question is about the candidate's background, use their actual experience. " +
            'When the question is conceptual, explain clearly with examples. No preamble.',
          contextBlock
        ),
        aiRules,
        'ask'
      );
    },
    build(ctx) {
      const t = formatTranscript(ctx.transcript, 12);
      return (t ? 'Recent conversation:\n' + t + '\n\n' : '') + 'Question: ' + ctx.userText;
    }
  },

  // ── Answer This: answer one specific transcript question ─────────────────
  answerThis: {
    needsScreen: false,
    userBubble: null, // bubble set dynamically from the question text
    small: false,
    resumeMode: 'say', // same context budget as 'say'
    buildSystem(contextBlock, aiRules) {
      return applyRules(
        buildSystem(
          'You are Onscreenly, whispering a direct answer to the candidate for ONE specific question. ' +
            BASE_RULES +
            "The interviewer's exact question is provided below. Focus ONLY on answering that question — ignore any other conversation context.\n\n" +
            'Rules:\n' +
            '• BEHAVIORAL ("tell me about a time…"): STAR format using real stories from the candidate\'s background. Situation → Task → Action → Result. Include metrics if available.\n' +
            '• MOTIVATION ("why this company/role"): Specific, genuine reasons from their stated preferences.\n' +
            '• TECHNICAL: Clear explanation with a concrete example from their experience.\n' +
            '• EXPERIENCE: Reference specific roles/projects from their resume.\n' +
            '• COMPENSATION: State the salary target confidently in one sentence.\n' +
            '• SITUATIONAL: Structured thinking — "First I would X, then Y, because Z."\n\n' +
            'Write in first person, as the candidate speaking. No preamble. 2–5 sentences.',
          contextBlock
        ),
        aiRules,
        'answerThis'
      );
    },
    build(ctx) {
      // Only pass the specific question — not the full transcript history
      return (
        'Answer this specific interview question:\n\n"' +
        (ctx.userText || '(no question provided)') +
        '"\n\nGive the full answer the candidate should say out loud.'
      );
    }
  },

  // ── Résumé analysis: structured review against the target job ───────────
  // ownContext: the runner passes only vault notes as the context block; the
  // full résumé and job description go in the user turn instead of the
  // clipped interview excerpts.
  resumeAnalysis: {
    needsScreen: false,
    userBubble: 'Analyse my résumé',
    small: false,
    resumeMode: 'resumeAnalysis',
    ownContext: true,
    needsResume: true,
    layout: 'cards',
    // Seven sections run well past the 700/1,400-token cap of live answers.
    maxTokens: 3000,
    buildSystem(contextBlock, aiRules) {
      return applyRules(
        buildSystem(
          "You are Onscreenly's résumé reviewer. " +
            BASE_RULES +
            "Analyse the candidate's résumé against the target job description when one is given. Be specific and honest, quote the résumé when you point at a problem, and never invent experience, employers or numbers the résumé does not show.\n\n" +
            "Answer in Markdown with these sections, each starting with a '## ' heading, in this order:\n" +
            '## Summary: 2–3 sentences on who the candidate is and how well they fit the role.\n' +
            '## Strengths: 3–5 bullets, each tied to evidence in the résumé.\n' +
            '## Gaps vs the job: one bullet per requirement in the job description the résumé does not show, with how to address it. Leave this section out when no job description is given.\n' +
            '## Keyword match: quote the computed score exactly as given, list the most important missing keywords, and say where each could honestly appear in the résumé. Leave this section out when no score is given.\n' +
            '## Rewritten bullets: 3–5 weak résumé bullets, each as a "Before:" bullet followed by an "After:" bullet. The After line uses an action verb, what was done and a measurable result; write [X] where a number is needed rather than inventing one.\n' +
            '## Likely interview questions: 5–7 questions this résumé and role invite, each with a one-line hint for answering.\n' +
            '## STAR stories to prepare: 3 stories drawn from the résumé, each with one line per Situation, Task, Action and Result.\n\n' +
            "If reference notes from the user's vault are included above, use them as extra evidence about the candidate's work and name the note title in brackets when you rely on one.",
          contextBlock
        ),
        aiRules,
        'resumeAnalysis'
      );
    },
    build(ctx) {
      const settings = ctx.settings || {};
      const resume = clipFor(settings.resumeText, ANALYSIS_RESUME_CHARS);
      const jd = clipFor(settings.jobDescription, ANALYSIS_JD_CHARS);
      const match = describeKeywordMatch(keywordMatch(settings.resumeText, settings.jobDescription));
      return [
        'Résumé:\n<<<\n' + (resume || '(empty)') + '\n>>>',
        jd ? 'Job description:\n<<<\n' + jd + '\n>>>' : 'Job description: none given. Review the résumé on its own.',
        match,
        'Analyse my résumé.'
      ]
        .filter(Boolean)
        .join('\n\n');
    }
  },

  // ── LeetCode: pure coding solver — no personal context, no AI rules ─────
  leetcode: {
    needsScreen: true,
    requiresScreen: true, // the problem is only on the screen: no screenshot, no answer
    userBubble: "Solve what's on screen",
    small: false,
    resumeMode: 'leetcode',
    buildSystem(_contextBlock, _aiRules) {
      // Context block AND aiRules intentionally ignored — code answers must
      // stay strict regardless of personal style or context.
      return (
        'You are an expert competitive programmer. The screenshot contains a coding problem. ' +
        'Respond with: (1) a one-line restatement, (2) a short approach, (3) a clean, correct, idiomatic solution in a fenced code block ' +
        '(use the language shown on screen, else Python), (4) time and space complexity. Keep prose tight.'
      );
    },
    build() {
      return 'Solve the coding problem shown in the screenshot.';
    }
  }
};

module.exports = { MODES, formatTranscript };
