// @ts-check
// Keyword match between a résumé and a job description, computed locally so
// the résumé analysis quotes a real score instead of one the model guesses.

// Job-ad boilerplate that says nothing about the skills being asked for.
const GENERIC = new Set(
  (
    'a an and are as at be been but by can could did do does for from had has have he her his how i if in into is it ' +
    'its me my of on or our she so than that the their them then there these they this those to too us was we were ' +
    'what when where which while who why will with would you your about also any some such no not only very all ' +
    'experience experiences years year team teams work working role roles skill skills ability abilities strong ' +
    'excellent good great responsibilities responsibility requirement requirements required preferred qualification ' +
    'qualifications including include includes etc knowledge plus bonus company business environment opportunity ' +
    'opportunities job jobs candidate candidates position using use used build building help helping new across ' +
    'within level senior junior mid lead ideal ideally must should may might well like looking join day days ' +
    'equal employer gender race religion disability veteran status national origin sexual orientation identity age ' +
    'applicants application apply eeo benefits salary compensation range per hour based location remote hybrid ' +
    'office full time part one two three four five more most other others way ways make makes making ensure ' +
    'support supporting provide providing within world people customers customer product products part'
  ).split(' ')
);

const TERM_RE = /[A-Za-z0-9][A-Za-z0-9+#./-]*[A-Za-z0-9+#]|[A-Za-z0-9]/g;

/** @param {string} term */
function normalize(term) {
  let t = term.toLowerCase().replace(/[./-]+$/, '');
  if (t.length > 4 && t.endsWith('ies')) t = t.slice(0, -3) + 'y';
  else if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !/[+#.]/.test(t)) t = t.slice(0, -1);
  return t;
}

/**
 * Spelled like a tool or skill name: AWS, APIs, PostgreSQL, Node.js, CI/CD,
 * C++, S3, or a capitalised word in mid-sentence such as Lambda or Kafka.
 * @param {string} raw
 * @param {boolean} sentenceStart
 */
function looksTechnical(raw, sentenceStart) {
  return (
    /[+#./\d]/.test(raw) ||
    /^[A-Z]{2,}s?$/.test(raw) ||
    /[a-z][A-Z]/.test(raw) ||
    (!sentenceStart && /^[A-Z][a-z]/.test(raw))
  );
}

/** @param {string} text */
function termsOf(text) {
  return String(text || '').match(TERM_RE) || [];
}

/**
 * @param {string} text
 * @param {number} index
 */
function isSentenceStart(text, index) {
  let i = index - 1;
  while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
  return i < 0 || /[.!?:;\n\-*•]/.test(text[i]);
}

/**
 * The job description's keywords: tool-like names, plus any other word the ad
 * repeats. Tool names first, then by frequency, capped so the score stays
 * meaningful.
 * @param {string} jobDescription
 * @param {number} [limit]
 */
function extractKeywords(jobDescription, limit = 30) {
  const text = String(jobDescription || '');
  /** @type {Map<string, { label: string, count: number, technical: boolean, first: number }>} */
  const found = new Map();
  for (const match of text.matchAll(TERM_RE)) {
    const raw = match[0];
    const key = normalize(raw);
    // Numbers and amounts ("5+", "2026", "24/7") are not keywords.
    if (/^\d/.test(key) || (key.length < 2 && !/[+#]/.test(key))) continue;
    if (GENERIC.has(key) || GENERIC.has(raw.toLowerCase())) continue;
    const technical = looksTechnical(raw, isSentenceStart(text, match.index || 0));
    const entry = found.get(key);
    if (entry) {
      entry.count++;
      entry.technical = entry.technical || technical;
    } else {
      found.set(key, { label: raw.replace(/[./-]+$/, ''), count: 1, technical, first: match.index || 0 });
    }
  }
  return [...found.entries()]
    .filter(([, e]) => e.technical || e.count >= 2)
    .sort(
      (a, b) => Number(b[1].technical) - Number(a[1].technical) || b[1].count - a[1].count || a[1].first - b[1].first
    )
    .slice(0, limit)
    .map(([key, e]) => ({ key, label: e.label }));
}

/**
 * @param {string} resumeText
 * @param {string} jobDescription
 * @returns {{ score: number, total: number, matched: string[], missing: string[] } | null}
 */
function keywordMatch(resumeText, jobDescription) {
  if (!String(jobDescription || '').trim() || !String(resumeText || '').trim()) return null;
  const keywords = extractKeywords(jobDescription);
  if (!keywords.length) return null;
  const resumeTerms = new Set(termsOf(resumeText).map(normalize));
  const matched = [];
  const missing = [];
  for (const { key, label } of keywords) (resumeTerms.has(key) ? matched : missing).push(label);
  return { score: Math.round((matched.length / keywords.length) * 100), total: keywords.length, matched, missing };
}

/**
 * The match as plain lines for the prompt, or '' when there is no job description.
 * @param {ReturnType<typeof keywordMatch>} match
 */
function describeKeywordMatch(match) {
  if (!match) return '';
  return [
    `Keyword match computed by Onscreenly (quote these numbers exactly): ${match.score}% — ${match.matched.length} of ${match.total} job keywords appear in the résumé.`,
    `Found: ${match.matched.join(', ') || 'none'}`,
    `Missing: ${match.missing.join(', ') || 'none'}`
  ].join('\n');
}

module.exports = { describeKeywordMatch, extractKeywords, keywordMatch };
