/**
 * Selector-registry regression tests.
 *
 * Runs the real selector strings — with Playwright syntax (`:has-text()`,
 * `:text-is()`, `:has()`, `:not()`) intact — against a fixture that reproduces
 * the 2026 Gemini Notebook DOM. Console `querySelectorAll` cannot evaluate
 * those pseudo-classes, so a live-DOM spot check is not a substitute for this.
 *
 * Each 2026 breakage gets two assertions: the new selector resolves to the
 * right element, and the pre-2026 selector resolves to nothing. The second
 * half is what stops a future "cleanup" from quietly reinstating a dead
 * anchor.
 *
 * Run with `npm test`. Needs a local Chrome/Chromium — no network, no Google
 * account, no credentials.
 */

import { chromium, type Browser, type Page } from "patchright";
import { fileURLToPath } from "url";
import path from "path";
import { Selectors, joinAlt } from "../src/notebooklm/selectors.js";
import { sanitizeAnswer } from "../src/notebooklm/chat.js";
import { lastMatch } from "../src/utils/locators.js";
import {
  extractNotebookId,
  isNotebookUrl,
  isSameNotebookOrigin,
  normalizeNotebookUrl,
} from "../src/notebooklm/urls.js";

const FIXTURE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "notebook-page.html"
);

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail?: string): void {
  if (condition) {
    passed++;
    console.log(`  ✅ ${name}`);
  } else {
    failures.push(detail ? `${name} — ${detail}` : name);
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function count(page: Page, selector: string): Promise<number> {
  return page.locator(selector).count();
}

/**
 * Guards the `.last()` workaround in `utils/locators.ts`.
 *
 * patchright 1.56.0's `Locator.last()` resolves to nothing when the locator
 * matches exactly one element — which is the state on the first question of
 * every session. If a future patchright fixes it, the first assertion here
 * flips and the workaround can be retired.
 */
async function runLocatorTests(page: Page): Promise<void> {
  console.log("\n▶ patchright .last() workaround");

  await page.setContent('<div class="solo">only</div>');
  const solo = page.locator(".solo");
  check("single match: count is 1", (await solo.count()) === 1);
  check(
    "single match: .last() is broken upstream (workaround still needed)",
    (await solo.last().count()) === 0,
    "patchright appears fixed — lastMatch() can be replaced with .last()"
  );
  check(
    "single match: lastMatch() resolves it",
    (await (await lastMatch(solo))!.textContent()) === "only"
  );

  await page.setContent('<div class="multi">a</div><div class="multi">b</div>');
  const multi = page.locator(".multi");
  check(
    "multiple matches: lastMatch() returns the last one",
    (await (await lastMatch(multi))!.textContent()) === "b"
  );

  await page.setContent("<p>nothing here</p>");
  check("no match: lastMatch() returns null", (await lastMatch(page.locator(".absent"))) === null);
}

async function runDomTests(page: Page): Promise<void> {
  console.log("\n▶ URL handling (2026 domain move)");
  check(
    "legacy host normalises to notebook.google.com",
    normalizeNotebookUrl("https://notebooklm.google.com/notebook/abc-123") ===
      "https://notebook.google.com/notebook/abc-123"
  );
  check(
    "query noise is dropped",
    normalizeNotebookUrl("https://notebook.google.com/notebook/abc-123?addSource=true") ===
      "https://notebook.google.com/notebook/abc-123"
  );
  check(
    "multi-account /u/N/ prefix survives",
    normalizeNotebookUrl("https://notebook.google.com/u/1/notebook/abc-123") ===
      "https://notebook.google.com/u/1/notebook/abc-123"
  );
  check(
    "?authuser= survives (dropping it reopens as the default account)",
    normalizeNotebookUrl("https://notebook.google.com/notebook/abc-123?authuser=2") ===
      "https://notebook.google.com/notebook/abc-123?authuser=2"
  );
  check(
    "?authuser= is kept while other params are dropped",
    normalizeNotebookUrl(
      "https://notebooklm.google.com/notebook/abc-123?addSource=true&authuser=2&ref=x"
    ) === "https://notebook.google.com/notebook/abc-123?authuser=2"
  );
  check("legacy host still recognised", isNotebookUrl("https://notebooklm.google.com/notebook/x"));
  check("current host recognised", isNotebookUrl("https://notebook.google.com/notebook/x"));
  check("unrelated host rejected", !isNotebookUrl("https://evil.example.com/notebook/x"));
  check(
    "host lookalike rejected",
    !isNotebookUrl("https://notebook.google.com.evil.example/notebook/x")
  );
  check(
    "cross-host origins compare equal (301 tolerance)",
    isSameNotebookOrigin("https://notebooklm.google.com/notebook/x", "https://notebook.google.com")
  );
  check(
    "notebook id extracted",
    extractNotebookId("https://notebook.google.com/notebook/abc-123") === "abc-123"
  );
  check("home page has no id", extractNotebookId("https://notebook.google.com/") === null);

  console.log("\n▶ Overlay anchoring (emoji-picker distractor)");
  const bareDialogFirst = page.locator('[role="dialog"]').first();
  check(
    "a bare [role=dialog].first() still resolves to the invisible emoji palette",
    (await bareDialogFirst.getAttribute("aria-label")) === "Emoji characters palette",
    "fixture no longer reproduces the ordering this guard exists for"
  );
  check(
    "overlayPane skips it and is visible",
    await page.locator(Selectors.sources.overlayPane).first().isVisible()
  );
  check(
    "addSourceDialog resolves to exactly one modal",
    (await count(page, Selectors.sources.addSourceDialog)) === 1
  );

  console.log("\n▶ Sources");
  check(
    "addButton finds the nb-button-wrapped control",
    (await page
      .locator(joinAlt(Selectors.sources.addButton))
      .first()
      .getAttribute("aria-label")) === "Add source"
  );
  check(
    "pre-2026 button.add-source-button is dead",
    (await count(page, "button.add-source-button")) === 0
  );
  check(
    "sourceContainer counts rows",
    (await count(page, Selectors.sources.sourceContainer)) === 3
  );
  check(
    "sourceCountIndicator reads the header",
    (await page.locator(Selectors.sources.sourceCountIndicator).innerText()).includes("3")
  );

  const overlay = page.locator(Selectors.sources.addSourceDialog).first();
  const urlBtn = overlay.locator(joinAlt(Selectors.sources.sourceTypeUrl)).first();
  check("sourceTypeUrl picks the Websites tile", (await urlBtn.innerText()).includes("Websites"));
  const textBtn = overlay.locator(joinAlt(Selectors.sources.sourceTypeText)).first();
  check(
    "sourceTypeText picks the Copied-text tile",
    (await textBtn.innerText()).includes("Copied text")
  );
  const fileBtn = overlay.locator(joinAlt(Selectors.sources.sourceTypeFile)).first();
  check(
    "sourceTypeFile picks the Upload tile",
    (await fileBtn.innerText()).includes("Upload files")
  );

  check(
    "overlayTextarea finds the URL textarea",
    (await overlay
      .locator(Selectors.sources.overlayTextarea)
      .first()
      .getAttribute("aria-label")) === "Enter URLs"
  );
  check(
    "pre-2026 input[type=text] is gone from the URL step",
    (await overlay.locator(Selectors.sources.overlayInput).count()) === 0
  );
  const insert = overlay.locator(joinAlt(Selectors.sources.insertConfirm)).first();
  check("insertConfirm resolves to Insert", (await insert.innerText()).trim() === "Insert");
  check(
    "insertConfirm does not grab Back or Close",
    !["Back", "Close"].includes((await insert.getAttribute("aria-label")) ?? "")
  );

  console.log("\n▶ Chat");
  check("queryInput found", (await count(page, joinAlt(Selectors.chat.queryInput))) === 1);
  check("submitButton found", (await count(page, joinAlt(Selectors.chat.submitButton))) === 1);
  check("answerContainer found", (await count(page, Selectors.chat.answerContainer)) === 1);

  const answer = (await lastMatch(page.locator(Selectors.chat.answerContainer)))!;
  check(
    "answerText scoped INSIDE a container finds nothing (why answerTextInContainer exists)",
    (await answer.locator(Selectors.chat.answerText).count()) === 0
  );
  const bodyText = (await answer.locator(Selectors.chat.answerBody).allInnerTexts()).join("\n");
  check(
    "answerBody excludes the reasoning block",
    !bodyText.includes("Thoughts"),
    bodyText.slice(0, 80)
  );
  check("answerBody keeps the prose", bodyText.includes("Model Context Protocol"));
  const rawText = await (await lastMatch(
    answer.locator(Selectors.chat.answerTextInContainer)
  ))!.innerText();
  check(
    "reading the whole container WOULD leak reasoning (regression guard)",
    rawText.includes("Thoughts"),
    "fixture no longer reproduces the leak this guard exists for"
  );
  check(
    "citation marker survives inside the answer body",
    (await answer
      .locator(Selectors.chat.answerBody)
      .locator(joinAlt(Selectors.citations.button))
      .count()) === 1
  );

  console.log("\n▶ Studio");
  const audioEntry = page.locator(joinAlt(Selectors.studio.audioOverviewButton)).first();
  check(
    "audioOverviewButton picks Audio Overview, not another artifact type",
    (await audioEntry.getAttribute("aria-label")) === "Audio Overview"
  );
  check(
    "generating tile is detected",
    (await count(page, joinAlt(Selectors.studio.artifactGenerating))) === 1
  );
  check(
    "audioPlayer does NOT match while the shimmer is running",
    (await count(page, Selectors.studio.audioPlayer[0])) === 0
  );
  check(
    "pre-2026 'any tile means ready' selector WOULD have matched (regression guard)",
    (await count(page, "artifact-library-item")) === 1
  );

  // Flip the tile to its finished state: drop the shimmer classes and swap the
  // label. The `mat-icon` is left on `sync` on purpose — the readiness
  // selectors must not depend on the glyph, which alternates during generation
  // (see `artifactGenerating`). A tile that still reads `sync` but has stopped
  // shimmering must register as ready.
  await page.evaluate(() => {
    const btn = document.querySelector("#tile .artifact-item-button")!;
    btn.classList.remove("shimmer-blue", "artifact-item-button--entering");
    document.querySelector("#tile .artifact-title")!.textContent = "Deep Dive conversation";
    document.querySelector("#tile .artifact-detail")!.textContent = "12 min";
  });

  check(
    "audioPlayer matches once the shimmer clears",
    (await count(page, Selectors.studio.audioPlayer[0])) === 1
  );
  check(
    "generating tile no longer matches",
    (await count(page, joinAlt(Selectors.studio.artifactGenerating))) === 0
  );
}

function runPureTests(): void {
  console.log("\n▶ Answer sanitisation");
  check(
    "isolated icon-label lines are dropped",
    sanitizeAnswer("Real answer.\nmore_vert\nthumb_up") === "Real answer."
  );
  check(
    "an icon glyph welded to the next sentence is stripped",
    sanitizeAnswer("expand_moreThe answer begins here.") === "The answer begins here."
  );
  check(
    "prose starting with the same words is left alone",
    sanitizeAnswer("share this document with the team") === "share this document with the team"
  );
  check(
    "a longer identifier is not truncated",
    sanitizeAnswer("expand_more_button_label") === "expand_more_button_label"
  );
  check(
    "citation-marker leak (digit before an icon label) is dropped",
    sanitizeAnswer("Answer text.\n1\nmore_vert") === "Answer text."
  );
}

async function main(): Promise<void> {
  runPureTests();

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  } catch {
    console.log("  ℹ️  System Chrome unavailable, falling back to bundled Chromium");
    browser = await chromium.launch({ headless: true });
  }

  const page = await browser.newPage();
  try {
    await runLocatorTests(page);
    await page.goto(`file://${FIXTURE.replace(/\\/g, "/")}`);
    await runDomTests(page);
  } finally {
    await browser.close();
  }

  console.log(
    `\n${failures.length === 0 ? "✅" : "❌"} ${passed} passed, ${failures.length} failed`
  );
  if (failures.length > 0) {
    for (const f of failures) console.log(`   • ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
