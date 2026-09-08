/**
 * Canonical NotebookLM / Gemini Notebook URL handling.
 *
 * # Why this module exists
 *
 * In 2026 Google renamed the product to **Gemini Notebook** and moved it from
 * `notebooklm.google.com` to `notebook.google.com`. The old host now answers
 * with a **301 permanent redirect**:
 *
 * ```
 * $ curl -I https://notebooklm.google.com/
 * HTTP/2 301
 * location: https://notebook.google.com/
 * ```
 *
 * That single change broke every
 * `url.startsWith("https://notebooklm.google.com/")`
 * check in the codebase: after the redirect the browser is on the *new* host,
 * so login detection never fired and `sessionStorage` restore silently
 * skipped (its origin guard compared against the stale host).
 *
 * Everything that touches a notebook URL now goes through here, so the
 * host lives in exactly one place the next time Google renames the product.
 *
 * The path layout is unchanged: `/notebook/<uuid>`.
 */

/** Canonical origin for the current (2026) Gemini Notebook deployment. */
export const NOTEBOOK_ORIGIN = "https://notebook.google.com";

/** Canonical host, without scheme. */
export const NOTEBOOK_HOST = "notebook.google.com";

/** The pre-2026 host. Still resolves, via a 301 to `NOTEBOOK_HOST`. */
export const LEGACY_NOTEBOOK_HOST = "notebooklm.google.com";

/**
 * Hosts that are or were valid entry points. Saved library entries and user
 * input using the legacy host must keep working.
 */
export const NOTEBOOK_HOSTS: readonly string[] = [NOTEBOOK_HOST, LEGACY_NOTEBOOK_HOST];

/** Google sign-in host — used to recognise "still authenticating" states. */
export const GOOGLE_ACCOUNTS_HOST = "accounts.google.com";

/**
 * Google login entry point that lands on the notebook home page once the
 * user is authenticated. Used by `setup_auth` / `re_auth`.
 */
export const NOTEBOOK_AUTH_URL =
  `https://${GOOGLE_ACCOUNTS_HOST}/v3/signin/identifier` +
  `?continue=${encodeURIComponent(NOTEBOOK_ORIGIN + "/")}` +
  `&flowName=GlifWebSignIn&flowEntry=ServiceLogin`;

/** Parse a URL without throwing. */
function parse(url: string | null | undefined): URL | null {
  if (!url) return null;
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * `true` when the URL points at the notebook app on either the current or the
 * legacy host. Host-based rather than prefix-based so the 301 to
 * `notebook.google.com` no longer invalidates the check.
 */
export function isNotebookUrl(url: string | null | undefined): boolean {
  const parsed = parse(url);
  return parsed !== null && NOTEBOOK_HOSTS.includes(parsed.hostname);
}

/** `true` while the browser still sits on a Google sign-in screen. */
export function isGoogleLoginUrl(url: string | null | undefined): boolean {
  return parse(url)?.hostname === GOOGLE_ACCOUNTS_HOST;
}

/**
 * Extract the notebook UUID from a notebook URL, or `null` when the URL is
 * the notebook *home* page (no specific notebook selected).
 */
export function extractNotebookId(url: string | null | undefined): string | null {
  const parsed = parse(url);
  if (!parsed) return null;
  return parsed.pathname.match(/\/notebook\/([a-zA-Z0-9-]+)/)?.[1] ?? null;
}

/**
 * Rewrite a notebook URL onto the canonical origin.
 *
 * - legacy host → `notebook.google.com` (avoids a redirect round-trip *and*
 *   keeps origin-sensitive code such as the `sessionStorage` restore working)
 * - `/u/<n>/` multi-account prefixes are preserved — they select which signed-in
 *   Google account the notebook opens under
 * - `?authuser=` is preserved for the same reason. It is the other way Google
 *   selects an account, and dropping it silently reopens the notebook as the
 *   browser's *default* account — which, for a notebook owned by a secondary
 *   account, lands on an "Access Request" page instead of the notebook
 * - every other query parameter is dropped: `?addSource=true` and friends
 *   change what the page does on load
 *
 * Non-notebook URLs are returned untouched so callers can pass anything.
 */
export function normalizeNotebookUrl(url: string | null | undefined): string {
  const parsed = parse(url);
  if (!parsed || !NOTEBOOK_HOSTS.includes(parsed.hostname)) {
    return (url ?? "").trim();
  }

  const authUser = parsed.searchParams.get("authuser");

  parsed.protocol = "https:";
  parsed.hostname = NOTEBOOK_HOST;
  parsed.port = "";
  parsed.search = "";
  parsed.hash = "";
  if (authUser) parsed.searchParams.set("authuser", authUser);
  // Trailing slashes make otherwise-identical URLs miss session cache lookups.
  if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
    parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  }

  return parsed.toString();
}

/**
 * Same-origin comparison that treats the legacy and current hosts as one.
 * Used by the `sessionStorage` restore guard, which would otherwise refuse to
 * write after the 301 moved the page off the configured host.
 */
export function isSameNotebookOrigin(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const left = parse(a);
  const right = parse(b);
  if (!left || !right) return false;
  if (NOTEBOOK_HOSTS.includes(left.hostname) && NOTEBOOK_HOSTS.includes(right.hostname)) {
    return true;
  }
  return left.origin === right.origin;
}

/** Build the URL that opens a notebook by id on the canonical origin. */
export function notebookUrlFromId(id: string): string {
  return `${NOTEBOOK_ORIGIN}/notebook/${id}`;
}
