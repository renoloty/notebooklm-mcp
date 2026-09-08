/**
 * NotebookLM Audio Overview generation + download (issue #11).
 *
 * 2026-05 Studio UX (verified live in DE/EN locales):
 *   - The "Audio Overview" entry is a `<div role="button">` with a Material-
 *     Symbols `audio_magic_eraser` icon. *One click* on it kicks off
 *     generation; there is no separate "Generate" step unless the user
 *     opens the per-card "Anpassen" sub-dialog first.
 *   - While generating, NotebookLM shows a "Audio-Zusammenfassung wird … —
 *     Kommen Sie in ein paar Minuten wieder" tile with a spinner.
 *   - When generation completes, NotebookLM mounts an `artifact-library-item`
 *     tile with a Play button (`button.artifact-action-button`, locale-bound
 *     aria-label "Wiedergeben"/"Play"/…) and a three-dot menu containing
 *     "Download" / "Herunterladen" / "Télécharger" / …. There is *no real*
 *     `<audio>` element in the DOM.
 *
 * Two operations:
 *   - `generateAudioOverview(page, opts)` — async by default: returns
 *     immediately with `status: "started"` after triggering the generation,
 *     so the caller doesn't block for the 5–10 minute render. Pass
 *     `waitForCompletion: true` for the legacy synchronous behaviour.
 *   - `downloadAudioOverview(page, destDir)` — opens the three-dot menu on
 *     the completed audio tile, clicks the "Download" item, and persists
 *     the file via Patchright's `download` event.
 *
 * Companion: `getAudioStatus(page)` — non-blocking status probe for callers
 * that want to poll without holding open a long-running RPC.
 */

import type { Page } from "patchright";
import path from "path";
import { Selectors, joinAlt } from "./selectors.js";
import { safeSleep, isRecoverable } from "../browser/watchdog.js";
import { log } from "../utils/logger.js";

export type AudioStatus = "ready" | "in_progress" | "not_started";

export interface GenerateAudioOptions {
  /** Optional focus prompt fed into the customise dialog before generation. */
  customPrompt?: string;
  /**
   * If `true`, block until the audio tile is ready (legacy behaviour). If
   * `false` (default), return immediately after triggering generation —
   * callers poll via `get_audio_status`.
   */
  waitForCompletion?: boolean;
  /** How long to wait when `waitForCompletion=true`. Default 10 min. */
  timeoutMs?: number;
}

export interface AudioGenerationResult {
  status: AudioStatus | "started" | "error";
  /** True when an Audio Overview already existed before this call. */
  alreadyExisted?: boolean;
  message?: string;
}

export async function generateAudioOverview(
  page: Page,
  options: GenerateAudioOptions = {}
): Promise<AudioGenerationResult> {
  const { customPrompt, waitForCompletion = false, timeoutMs = 600_000 } = options;

  try {
    // 1. Idempotency: if the completed audio tile is already mounted, the
    //    user already has an Audio Overview — report ready and do nothing.
    if (await audioIsReady(page)) {
      log.info("  ✅ Audio Overview already generated, skipping click");
      return { status: "ready", alreadyExisted: true };
    }

    // 2. Generation may already be running. Detect the spinner tile and
    //    skip clicking again — duplicate clicks would either be no-ops or
    //    spawn a parallel generation we'd then have to clean up.
    if (await audioGenerationInProgress(page)) {
      log.info("  ⏳ Audio Overview generation already running");
      if (waitForCompletion) {
        return await waitForAudioReady(page, timeoutMs);
      }
      return {
        status: "in_progress",
        message:
          "Audio Overview generation is already running. Poll `get_audio_status` " +
          "every ~30 s — the audio tile usually appears in 2–10 minutes.",
      };
    }

    // 3. The Studio panel can be collapsed by the user — expand it before
    //    we hunt for the card.
    await ensureStudioPanelExpanded(page);

    // 4. Trigger generation.
    //
    //    Clicking the Studio card no longer starts a render: since 2026 it
    //    opens a "Customize Audio Overview" (`configurable-form-dialog`) modal
    //    and nothing happens until its Generate button is pressed. The old
    //    no-prompt path stopped after the card click and still reported
    //    "started", leaving the modal open and no audio ever being produced —
    //    so both paths now go through the dialog.
    await clickFirstVisible(page, Selectors.studio.audioOverviewButton, "Audio overview entry");

    const customise = page.locator(Selectors.studio.customizeDialog).first();
    const customiseOpen = await customise.isVisible({ timeout: 5_000 }).catch(() => false);

    if (customiseOpen) {
      if (customPrompt) {
        const promptField = customise.locator("textarea, input[type='text']").first();
        if (await promptField.isVisible({ timeout: 1_500 }).catch(() => false)) {
          await promptField.fill(customPrompt);
          await safeSleep(page, 200);
        } else {
          log.warning("  ⚠️  Customise dialog has no prompt field — generating with defaults");
        }
      }
      await clickFirstVisible(page, Selectors.studio.generateButton, "Generate button");
      // The modal closes as the render is queued; if it lingers the click did
      // not take, and the caller should not be told generation started.
      await customise
        .waitFor({ state: "hidden", timeout: 15_000 })
        .catch(() => log.warning("  ⚠️  Customise dialog still open after Generate"));
    } else if (customPrompt) {
      log.warning("  ⚠️  Customise dialog did not open — custom prompt ignored");
    }

    log.info("  🎙️  Audio Overview generation triggered");

    // 5. Either return immediately (default async mode) or block until ready.
    if (!waitForCompletion) {
      return {
        status: "started",
        message:
          "Audio Overview generation started. It typically takes 2–10 minutes. " +
          "Poll `get_audio_status` to check completion, then call `download_audio`.",
      };
    }

    return await waitForAudioReady(page, timeoutMs);
  } catch (err) {
    if (isRecoverable(err)) throw err;
    log.warning(`  ⚠️  Audio generation failed: ${err}`);
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function waitForAudioReady(page: Page, timeoutMs: number): Promise<AudioGenerationResult> {
  // Polls `audioIsReady` rather than waiting on the tile selector directly:
  // the in-progress and finished tiles are the same element, so "visible"
  // fires while the shimmer is still running.
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await audioIsReady(page)) return { status: "ready" };
    await safeSleep(page, 5_000);
  }
  return {
    status: "in_progress",
    message: `Audio Overview was still generating after ${Math.round(timeoutMs / 1000)} s. Poll \`get_audio_status\`.`,
  };
}

/**
 * Non-blocking status probe used by the `get_audio_status` MCP tool.
 */
export async function getAudioStatusOnPage(page: Page): Promise<AudioGenerationResult> {
  try {
    if (await audioIsReady(page)) {
      return { status: "ready" };
    }
    if (await audioGenerationInProgress(page)) {
      return {
        status: "in_progress",
        message: "Audio Overview is still being generated.",
      };
    }
    return {
      status: "not_started",
      message: "No Audio Overview exists yet for this notebook.",
    };
  } catch (err) {
    if (isRecoverable(err)) throw err;
    return {
      status: "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * `true` only when a *finished* artifact tile is on screen.
 *
 * The in-progress and finished tiles are the same `artifact-library-item`
 * element — generation swaps a shimmer class and the label, it does not mount
 * a different node. Treating "a tile exists" as "audio is ready" (the pre-2026
 * behaviour) made `get_audio_status` report `ready` the moment generation
 * started, so `download_audio` then ran against a placeholder.
 */
async function audioIsReady(page: Page): Promise<boolean> {
  // A tile that is still shimmering means not ready, regardless of what any
  // other tile in the library is doing.
  if (await audioGenerationInProgress(page)) return false;

  const tiles = page.locator(Selectors.studio.artifactItem);
  const count = await tiles.count().catch(() => 0);
  if (count === 0) return false;

  return page
    .locator(joinAlt(Selectors.studio.audioPlayer))
    .first()
    .isVisible({ timeout: 500 })
    .catch(() => false);
}

/**
 * Detect a generation-in-progress tile. NotebookLM renders a tile with a
 * spinner and a localised "come back in a few minutes" message while it
 * works. Coverage spans EN, DE, FR, ES, IT, PT, NL, JA.
 */
const GENERATION_IN_PROGRESS_PHRASES = [
  // English — "Generating Audio Overview..." / "Come back in a few minutes"
  // are the two strings the live in-progress tile renders.
  "check back in a few minutes",
  "come back in a few minutes",
  "audio overview is being generated",
  "generating audio overview",
  "generating your audio",
  // German
  "kommen sie in ein paar minuten wieder",
  "audio-zusammenfassung wird erstellt",
  "audio-zusammenfassung wird gener",
  // French
  "revenez dans quelques minutes",
  "génération de l'aperçu audio",
  // Spanish
  "vuelve en unos minutos",
  "generando el resumen de audio",
  // Italian
  "torna tra qualche minuto",
  "generazione della panoramica audio",
  // Portuguese
  "volte em alguns minutos",
  "gerando a visão geral de áudio",
  // Dutch
  "kom over een paar minuten terug",
  "audio-overzicht wordt gegenereerd",
  // Japanese
  "数分後にもう一度ご確認ください",
  "音声の概要を生成しています",
];

async function audioGenerationInProgress(page: Page): Promise<boolean> {
  try {
    // Primary, language-free signal: the tile still carries the loading
    // shimmer. Checked first so a locale outside the phrase list below still
    // gets a correct answer.
    const shimmering = await page
      .locator(joinAlt(Selectors.studio.artifactGenerating))
      .first()
      .isVisible({ timeout: 500 })
      .catch(() => false);
    if (shimmering) return true;

    const studioText = await page
      .locator(Selectors.studio.panel)
      .first()
      .textContent({ timeout: 500 })
      .catch(() => null);
    if (!studioText) return false;
    const lower = studioText.toLowerCase();
    return GENERATION_IN_PROGRESS_PHRASES.some((p) => lower.includes(p));
  } catch {
    return false;
  }
}

/**
 * The Studio panel can be collapsed via the dock-arrow icon. When collapsed
 * the cards aren't in the DOM at all; click the expand-arrow first.
 */
async function ensureStudioPanelExpanded(page: Page): Promise<void> {
  const cardVisible = await page
    .locator(joinAlt(Selectors.studio.audioOverviewButton))
    .first()
    .isVisible({ timeout: 500 })
    .catch(() => false);
  if (cardVisible) return;

  const expandSelectors = [
    'button:has(mat-icon:text-is("dock_to_left"))',
    'button[aria-label*="erweitern" i][aria-label*="studio" i]',
    'button[aria-label*="expand" i][aria-label*="studio" i]',
    'button[aria-label*="ouvrir" i][aria-label*="studio" i]',
    'button[aria-label*="abrir" i][aria-label*="studio" i]',
    'button[aria-label*="aprire" i][aria-label*="studio" i]',
  ];
  for (const sel of expandSelectors) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible({ timeout: 500 }).catch(() => false)) {
      await btn.click().catch(() => undefined);
      await safeSleep(page, 400);
      return;
    }
  }
}

// `openAudioCustomiseDialog()` used to hunt for a separate "Customise audio"
// control. That control is gone: the Studio card itself opens the customise
// dialog now, so `generateAudioOverview` goes straight through it.

export interface DownloadAudioResult {
  success: boolean;
  filePath?: string;
  message?: string;
}

/**
 * Download the completed Audio Overview. Strategy:
 *   1. Verify the audio tile exists (else surface a clear error).
 *   2. Click the per-tile three-dot "Mehr"/"More" button to open the menu.
 *   3. Click the "Download" / "Herunterladen" / … menu item.
 *   4. Capture the resulting `download` event and save to `destinationDir`.
 */
export async function downloadAudioOverview(
  page: Page,
  destinationDir: string,
  preferredFileName: string = "notebooklm-audio.wav"
): Promise<DownloadAudioResult> {
  try {
    if (!(await audioIsReady(page))) {
      return {
        success: false,
        message:
          "No completed Audio Overview found. Trigger `generate_audio` first " +
          "and wait for `get_audio_status` to report `ready`.",
      };
    }

    // Open the three-dot menu on the audio tile.
    await clickFirstVisible(page, Selectors.studio.audioMoreMenuButton, "Audio more-menu button");
    await safeSleep(page, 250);

    // Now race the download event against the menu-item click.
    const downloadPromise = page.waitForEvent("download", { timeout: 60_000 });
    await clickFirstVisible(
      page,
      Selectors.studio.audioDownloadMenuItem,
      "Audio download menu item"
    );
    const download = await downloadPromise;

    const suggested = download.suggestedFilename();
    const targetPath = path.join(destinationDir, suggested || preferredFileName);
    await download.saveAs(targetPath);

    return { success: true, filePath: targetPath };
  } catch (err) {
    if (isRecoverable(err)) throw err;
    log.warning(`  ⚠️  Audio download failed: ${err}`);
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function clickFirstVisible(
  page: Page,
  selectors: readonly string[],
  label: string
): Promise<void> {
  for (const sel of selectors) {
    const candidate = page.locator(sel).first();
    if (await candidate.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await candidate.click();
      await safeSleep(page, 300);
      return;
    }
  }
  throw new Error(
    `Could not find ${label} — selectors: ${selectors.join(" | ")}. ` +
      "NotebookLM Studio UI may have changed."
  );
}
