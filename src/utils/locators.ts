/**
 * Locator helpers that work around a patchright defect.
 *
 * # The `.last()` single-match bug
 *
 * In patchright 1.56.0, `Locator.last()` resolves to **nothing** when the
 * locator matches exactly one element. Two or more elements behave correctly.
 * Reproduced against `channel: "chrome"`, headless:
 *
 * ```
 * 1 element : count=1  first="one"  nth(0)="one"  last=TIMEOUT
 * 2 elements: count=2  first="one"  nth(1)="two"  last="two"
 * ```
 *
 * Every action on the returned locator (`innerText`, `textContent`, `click`)
 * times out, and `.count()` on it returns 0.
 *
 * # Why it matters here
 *
 * Answer extraction targets the most recent `.to-user-container`. On the
 * **first question of a session** there is exactly one — so the single case
 * that triggers the bug is also the most common one. The failure is silent:
 * the extraction helper catches the timeout, returns `null`, and the polling
 * loop simply keeps going until the full answer timeout elapses, then reports
 * that no answer arrived — for an answer that was on screen the whole time.
 *
 * `nth(count - 1)` is equivalent and unaffected, so that is what we use.
 * Remove this module once patchright ships a fix.
 */

import type { Locator } from "patchright";

/**
 * Last element matched by `locator`, or `null` when nothing matches.
 *
 * Drop-in replacement for `locator.last()` — see the module comment for why
 * `.last()` itself cannot be used.
 */
export async function lastMatch(locator: Locator): Promise<Locator | null> {
  const total = await locator.count().catch(() => 0);
  if (total === 0) return null;
  return locator.nth(total - 1);
}
