// LinkedIn link rules (F02, PRD "LinkedIn duplicate check"). Shared by the browser and the
// server, so the form and the database agree on what counts as the same person.

export const SALES_NAV_REFUSED = "Paste the public profile link (linkedin.com/in/…)";
const NOT_A_PROFILE = "Paste a LinkedIn profile link (linkedin.com/in/…)";

type Result = { ok: true; normalised: string } | { ok: false; error: string };

/** Lowercased, without protocol, query, fragment or trailing slash ("www." etc. kept). */
function bare(raw: string): string {
  let s = raw.trim().toLowerCase();
  s = s.replace(/^[a-z]+:\/\//, "");
  s = s.split(/[?#]/)[0];
  return s.replace(/\/+$/, "");
}

/**
 * The PRD's normalising rule: lowercase; strip http(s)://, www. and m.; drop query strings,
 * fragments and the trailing slash. Also (F02): country subdomains like "in." count as the
 * same profile, and anything after the profile name (/details/…) is dropped.
 * e.g. "https://www.LinkedIn.com/in/Priya-S/?utm_source=x" → "linkedin.com/in/priya-s".
 */
export function normaliseLinkedInUrl(raw: string): Result {
  if (!raw.trim()) return { ok: false, error: "Paste the person's LinkedIn profile link." };
  const s = bare(raw);
  const host = s.split("/")[0];
  const hostOk = /^((www|m|[a-z]{2})\.)?linkedin\.com$/.test(host);
  const path = s.slice(host.length);

  if (hostOk && path.startsWith("/sales/")) return { ok: false, error: SALES_NAV_REFUSED };
  const match = hostOk ? /^\/in\/([^/]+)/.exec(path) : null;
  if (!match) return { ok: false, error: NOT_A_PROFILE };

  let slug = match[1];
  try {
    slug = decodeURIComponent(slug).toLowerCase();
  } catch {
    // Not valid percent-encoding: keep it as typed (still lowercased).
  }
  if (!slug || slug.length > 100) return { ok: false, error: NOT_A_PROFILE };
  return { ok: true, normalised: `linkedin.com/in/${slug}` };
}

/** The optional Sales Navigator field only takes Sales Navigator links. */
export function checkSalesNavUrl(raw: string): { ok: true } | { ok: false; error: string } {
  if (!raw.trim()) return { ok: true };
  const s = bare(raw);
  return /^((www|m)\.)?linkedin\.com\/sales\//.test(s)
    ? { ok: true }
    : { ok: false, error: "Sales Navigator links look like linkedin.com/sales/…" };
}

/** A clickable https link for a stored profile link (stored as typed). */
export function profileHref(url: string): string {
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
}
