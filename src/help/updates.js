// @ts-check
// Is there a newer release? One request to GitHub's "latest release" API, which lists only
// published, non-prerelease releases. Sends nothing about the user beyond what any web request
// does; a failure of any kind is silent, since this is only a notice.

/** "v1.2.3" or "1.2.3" as [1, 2, 3], or null for anything else (a prerelease, a typo). */
function parseVersion(text) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(text || '').trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True when `latest` is a later version than `current`. */
function isNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

/**
 * @param {{ current: string, url: string, fetchImpl: typeof fetch, timeoutMs?: number }} options
 * @returns {Promise<{ version: string } | null>} the newer version, or null
 */
async function checkForUpdate({ current, url, fetchImpl, timeoutMs = 8000 }) {
  try {
    const res = await fetchImpl(url, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Onscreenly' },
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!res.ok) return null;
    /** @type {{ draft?: boolean, prerelease?: boolean, tag_name?: string } | null} */
    const release = await res.json();
    if (!release || release.draft || release.prerelease) return null;
    const tag = String(release.tag_name || '');
    return isNewer(tag, current) ? { version: tag.replace(/^v/, '') } : null;
  } catch (_) {
    return null;
  }
}

module.exports = { parseVersion, isNewer, checkForUpdate };
