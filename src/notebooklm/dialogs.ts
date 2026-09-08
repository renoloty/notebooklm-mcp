/**
 * Dismissal of blocking modals that are not part of any workflow.
 *
 * A Google account that has never opened Gemini Notebook gets a first-run
 * "👋 Welcome to Gemini Notebook!" `legal-notice-dialog` on its first notebook
 * load. It is a normal Material modal, so its backdrop swallows every click
 * underneath it: `add_source` cannot reach the sidebar button, `ask_question`
 * cannot reach the submit button, and the failures surface as generic
 * "selector not found" timeouts with no hint about the cause.
 *
 * Because the dialog only ever appears once per account, it never showed up in
 * testing against an already-onboarded profile — which is exactly why it needs
 * to be handled explicitly rather than waited out.
 *
 * The dialog also carries a marketing opt-in checkbox. We acknowledge the
 * notice; we never tick that box on the user's behalf.
 */

import type { Page } from "patchright";
import { Selectors, joinAlt } from "./selectors.js";
import { log } from "../utils/logger.js";

/**
 * Dismiss the first-run welcome / legal-notice dialog if it is on screen.
 *
 * Safe to call on every navigation: it returns immediately when no such
 * dialog is present, and never throws — a failure to dismiss is reported to
 * the log and left for the caller's own selector waits to surface.
 *
 * @returns `true` when a dialog was found and dismissed.
 */
export async function dismissWelcomeDialog(page: Page): Promise<boolean> {
  try {
    const dialog = page.locator(joinAlt(Selectors.dialogs.welcome)).first();
    const present = await dialog.isVisible({ timeout: 1_000 }).catch(() => false);
    if (!present) return false;

    log.info("  👋 First-run welcome dialog detected — acknowledging");

    // Never opt the user into marketing email. The box ships unchecked; this
    // only guards against a future build that pre-ticks it.
    const optIn = page.locator(Selectors.dialogs.welcomeMarketingOptIn).first();
    if (await optIn.isChecked().catch(() => false)) {
      await optIn.uncheck().catch(() => undefined);
      log.info("  ✅ Left marketing opt-in unchecked");
    }

    for (const sel of Selectors.dialogs.welcomeDismiss) {
      const btn = page.locator(sel).first();
      if (!(await btn.isVisible({ timeout: 500 }).catch(() => false))) continue;
      await btn.click({ timeout: 3_000 }).catch(() => undefined);
      const gone = await dialog
        .waitFor({ state: "hidden", timeout: 5_000 })
        .then(() => true)
        .catch(() => false);
      if (gone) {
        log.success("  ✅ Welcome dialog dismissed");
        return true;
      }
    }

    log.warning("  ⚠️  Welcome dialog is open but no acknowledge button matched");
    return false;
  } catch {
    return false;
  }
}

/**
 * Close any *unexpected* Material modal that is sitting on top of the app.
 *
 * Used as a recovery step before click-driven flows. Workflow dialogs the
 * caller opened on purpose (add-source, customise-audio) are left alone — pass
 * their selector via `keep` so they are not closed out from under the caller.
 */
export async function dismissBlockingDialogs(page: Page, keep?: string): Promise<void> {
  await dismissWelcomeDialog(page);

  try {
    const dialogs = page.locator(Selectors.sources.overlayPane);
    const count = await dialogs.count();
    for (let i = 0; i < count; i++) {
      const dialog = dialogs.nth(i);
      if (!(await dialog.isVisible({ timeout: 300 }).catch(() => false))) continue;
      if (
        keep &&
        (await dialog
          .locator(keep)
          .count()
          .catch(() => 0)) > 0
      )
        continue;

      for (const sel of Selectors.dialogs.closeButton) {
        const btn = dialog.locator(sel).first();
        if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
          await btn.click({ timeout: 2_000 }).catch(() => undefined);
          break;
        }
      }
    }
  } catch {
    /* best-effort cleanup — never fail the caller's flow over this */
  }
}
