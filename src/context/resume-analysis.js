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

// Common acronyms in job ads that are not skills.
const GENERIC_ACRONYMS = new Set(
  'pto usa eu uk hr ceo cto cfo coo vp faq eeo gmt cet utc est pst ote e.g i.e etc'.split(' ')
);

// Tool, language and practice names recognised even when written once at the
// start of a sentence ("Python and SQL."). Lower-case keys.
const KNOWN_SKILLS = new Set(
  (
    'python java javascript typescript kotlin scala ruby php perl golang go rust swift elixir erlang haskell clojure ' +
    'c++ c# .net dotnet sql nosql graphql rest grpc html css sass react angular vue svelte next.js node node.js ' +
    'express django flask fastapi spring rails laravel android ios flutter xamarin unity unreal ' +
    'aws azure gcp s3 ec2 ecs eks lambda dynamodb cloudformation cloudfront sqs sns kinesis redshift athena ' +
    'bigquery snowflake databricks spark hadoop airflow dbt kafka rabbitmq redis memcached elasticsearch ' +
    'opensearch postgres postgresql mysql mariadb mongodb cassandra sqlite oracle docker kubernetes helm terraform ' +
    'ansible pulumi jenkins circleci github gitlab bitbucket git linux unix bash powershell nginx prometheus grafana ' +
    'datadog splunk sentry jira confluence figma sketch tableau looker excel salesforce sap pandas numpy pytorch ' +
    'tensorflow keras scikit-learn llm llms nlp ml ai mlops devops devsecops sre microservices serverless ' +
    'agile scrum kanban tdd bdd oauth saml sso jwt ci/cd a/b etl elt api apis sdk'
  ).split(' ')
);

// Skill names that are also everyday words: they count only when capitalised.
const AMBIGUOUS_SKILLS = new Set(['go', 'rust', 'swift', 'spring', 'rails', 'express', 'flask', 'unity', 'spark']);

// A term may contain + # . / - inside (C++, Node.js, CI/CD); bounded so a long
// run of punctuation cannot make the regex backtrack.
const TERM_RE = /[A-Za-z0-9][A-Za-z0-9+#./-]{0,60}[A-Za-z0-9+#]|[A-Za-z0-9]/g;

/** @param {string} term */
function normalize(term) {
  let t = term.toLowerCase().replace(/[./-]+$/, '');
  if (t.length > 4 && t.endsWith('ies')) t = t.slice(0, -3) + 'y';
  else if (t.length > 3 && t.endsWith('s') && !t.endsWith('ss') && !/[+#.]/.test(t)) t = t.slice(0, -1);
  return t;
}

/**
 * "Python/Go" lists two skills; "CI/CD" and "A/B" are one term.
 * @param {string} raw
 */
function splitSlashed(raw) {
  if (!raw.includes('/')) return [raw];
  const parts = raw.split('/').filter(Boolean);
  return parts.every((part) => part.length <= 2) ? [raw] : parts;
}

/**
 * Normalized keys of every term in a text, slash lists split into their parts.
 * @param {string} text
 */
function termKeys(text) {
  const keys = new Set();
  for (const raw of String(text || '').match(TERM_RE) || []) {
    keys.add(normalize(raw));
    for (const part of splitSlashed(raw)) keys.add(normalize(part));
  }
  return keys;
}

/**
 * A tool or skill name: a known one (Python, Kafka), or spelled like one:
 * AWS, APIs, PostgreSQL, Node.js, C++, S3.
 * @param {string} raw
 * @param {string} key
 */
function looksTechnical(raw, key) {
  if (KNOWN_SKILLS.has(key) || KNOWN_SKILLS.has(raw.toLowerCase())) {
    return !AMBIGUOUS_SKILLS.has(key) || /^[A-Z]/.test(raw);
  }
  return /[+#.\d]/.test(raw) || /^[A-Z]{2,}s?$/.test(raw) || /[a-z][A-Z]/.test(raw);
}

/**
 * The job description's keywords: tool and skill names, plus ordinary words
 * the ad repeats, so the company, the city and the perks do not crowd out the
 * skills. Tool names first, then by frequency, capped so the score stays
 * meaningful.
 * @param {string} jobDescription
 * @param {number} [limit]
 */
function extractKeywords(jobDescription, limit = 30) {
  // "You'll", "we're": drop the contraction so "ll" and "re" never count.
  const text = String(jobDescription || '').replace(/['’][A-Za-z]{1,3}\b/g, '');
  /** @type {Map<string, { label: string, count: number, technical: boolean, lower: boolean, first: number }>} */
  const found = new Map();
  for (const match of text.matchAll(TERM_RE)) {
    const at = match.index || 0;
    for (const raw of splitSlashed(match[0])) {
      const key = normalize(raw);
      // Numbers and amounts ("5+", "2026", "24/7") are not keywords.
      if (/^\d/.test(key) || (key.length < 2 && !/[+#]/.test(key) && !KNOWN_SKILLS.has(key))) continue;
      if (GENERIC.has(key) || GENERIC.has(raw.toLowerCase()) || GENERIC_ACRONYMS.has(key)) continue;
      if (AMBIGUOUS_SKILLS.has(key) && !/^[A-Z]/.test(raw)) continue;
      const technical = looksTechnical(raw, key);
      const lower = raw === raw.toLowerCase();
      const entry = found.get(key);
      if (entry) {
        entry.count++;
        entry.technical = entry.technical || technical;
        entry.lower = entry.lower || lower;
      } else {
        found.set(key, { label: raw.replace(/[./-]+$/, ''), count: 1, technical, lower, first: at });
      }
    }
  }
  return (
    [...found.entries()]
      // Other words need to repeat, and to appear in lower case at least once:
      // a word only ever capitalised is a name (the company, the city, a perk).
      .filter(([, e]) => e.technical || (e.count >= 2 && e.lower))
      .sort(
        (a, b) => Number(b[1].technical) - Number(a[1].technical) || b[1].count - a[1].count || a[1].first - b[1].first
      )
      .slice(0, limit)
      .map(([key, e]) => ({ key, label: e.label }))
  );
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
  const resumeTerms = termKeys(resumeText);
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
