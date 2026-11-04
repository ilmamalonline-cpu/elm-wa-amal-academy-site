const ALLOWED_HOST = /^(?:meet\.google\.com|teams\.microsoft\.com|teams\.live\.com|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)?zoom\.us)$/;
const ALLOWED_PATH_QUERY_FRAGMENT = /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+(?:\?[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?(?:#[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?$/;
const INVALID_PERCENT_ESCAPE = /%(?![0-9a-f]{2})/i;

/** Strict canonical HTTPS URL allowlist for externally hosted individual lessons. */
export function validMeetingUrl(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string" || value.length === 0 || value.length > 300) return false;
  const match = /^https:\/\/([^/]+)(\/.*)$/.exec(value);
  if (!match) return false;
  const [, host, path] = match;
  if (!ALLOWED_HOST.test(host) || !ALLOWED_PATH_QUERY_FRAGMENT.test(path) || INVALID_PERCENT_ESCAPE.test(value)) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.hostname === host && parsed.host === host &&
      parsed.username === "" && parsed.password === "" && parsed.port === "";
  } catch {
    return false;
  }
}
