const test = require('node:test');
const assert = require('node:assert/strict');
const { describeKeywordMatch, extractKeywords, keywordMatch } = require('../../src/context/resume-analysis');
const { MODES } = require('../../src/llm/prompts');

const JD = `Senior Backend Engineer

We are looking for an engineer with 5+ years of experience building APIs in Node.js and TypeScript.
You will own services on AWS (Lambda, S3) and PostgreSQL, run CI/CD with GitHub Actions, and mentor engineers.
Experience with Kafka is a plus. Strong communication skills. Kafka streaming experience preferred.
We are an equal opportunity employer.`;

const RESUME = `Jane Doe
Backend engineer, 7 years.
Experience
- Built Node.js and TypeScript APIs serving 2M requests a day.
- Moved the ledger to PostgreSQL on AWS with zero downtime.
- Mentored 4 engineers.`;

test('job keywords are tool names and repeated words, not ad boilerplate', () => {
  const labels = extractKeywords(JD).map((k) => k.label);
  for (const expected of ['Node.js', 'TypeScript', 'AWS', 'S3', 'PostgreSQL', 'CI/CD', 'GitHub', 'Kafka', 'APIs']) {
    assert.ok(labels.includes(expected), `${expected} in ${labels.join(', ')}`);
  }
  for (const boilerplate of ['experience', 'years', 'equal', 'employer', 'Strong', 'We', '5+']) {
    assert.ok(!labels.map((l) => l.toLowerCase()).includes(boilerplate.toLowerCase()), boilerplate);
  }
});

test('the score counts which job keywords appear in the résumé', () => {
  const match = keywordMatch(RESUME, JD);
  assert.ok(match);
  for (const found of ['Node.js', 'TypeScript', 'AWS', 'PostgreSQL', 'APIs']) assert.ok(match.matched.includes(found));
  for (const missing of ['Kafka', 'CI/CD', 'Lambda', 'S3', 'GitHub']) assert.ok(match.missing.includes(missing));
  assert.equal(match.total, match.matched.length + match.missing.length);
  assert.equal(match.score, Math.round((match.matched.length / match.total) * 100));
});

test('no job description or no résumé means no score', () => {
  assert.equal(keywordMatch(RESUME, ''), null);
  assert.equal(keywordMatch('', JD), null);
  assert.equal(describeKeywordMatch(null), '');
});

test('the analysis prompt carries the full résumé, the job description and the computed score', () => {
  const longResume = RESUME + '\n' + 'Led the payments migration. '.repeat(200);
  const turn = MODES.resumeAnalysis.build({
    transcript: [],
    userText: '',
    settings: { resumeText: longResume, jobDescription: JD }
  });
  assert.ok(turn.includes(longResume.trim()), 'the analysis is not limited to the live-answer excerpt');
  assert.match(turn, /Job description:\n<<<\nSenior Backend Engineer/);
  const match = keywordMatch(longResume, JD);
  assert.match(turn, new RegExp(`${match.score}% — ${match.matched.length} of ${match.total} job keywords`));
  const system = MODES.resumeAnalysis.buildSystem('NOTES BLOCK', '');
  for (const heading of [
    'Summary',
    'Strengths',
    'Gaps vs the job',
    'Keyword match',
    'Rewritten bullets',
    'Likely interview questions',
    'STAR stories to prepare'
  ]) {
    assert.ok(system.includes('## ' + heading), heading);
  }
  assert.match(system, /never invent/i);
  assert.ok(system.startsWith('NOTES BLOCK'));
});

test('without a job description the analysis reviews the résumé on its own', () => {
  const turn = MODES.resumeAnalysis.build({ transcript: [], userText: '', settings: { resumeText: RESUME } });
  assert.match(turn, /Job description: none given/);
  assert.doesNotMatch(turn, /Keyword match computed/);
  assert.equal(MODES.resumeAnalysis.needsResume, true);
  assert.ok(MODES.resumeAnalysis.maxTokens >= 2000, 'room for all seven sections');
  assert.equal(MODES.resumeAnalysis.needsScreen, false);
});
