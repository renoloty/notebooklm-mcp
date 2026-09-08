/**
 * NotebookLM chat extraction with streaming-stability detection.
 *
 * Replaces the legacy `waitForLatestAnswer()` (issue #43). Old logic gated on
 * `div.thinking-message`, which Google removed; calls timed out even though
 * the answer was visible. New logic only relies on the answer container itself
 * and treats text as final once it has been *stable* across N consecutive
 * polls (default 3). That makes the wait robust to UI churn and Material-icon
 * leaks (`more_vert`, `more_horiz`, …) which would otherwise destabilise the
 * extracted text.
 *
 * Companion fixes:
 * - issue #14 / #27 — timeout is fully configurable per call
 * - issue #16    — bounded polls + sleep fallback to defuse zombie pages
 * - issue #28    — sanitisation strips UI-control labels before delivery
 */

import type { Locator, Page } from "patchright";
import { Selectors } from "./selectors.js";
import { isRecoverable, pageIsAlive, safeSleep } from "../browser/watchdog.js";
import { lastMatch } from "../utils/locators.js";

/**
 * Loading-state phrases NotebookLM streams into the answer container before
 * the real response arrives. The stability detector would otherwise lock
 * onto these (they're "stable" while Gemini still thinks). Coverage spans
 * the eight major NotebookLM locales (EN, DE, FR, ES, PT, IT, NL, JA).
 */
const PLACEHOLDER_SNIPPETS = [
  // English
  "answer is being created",
  "answer is being generated",
  "creating answer",
  "generating answer",
  "getting the context",
  "getting the gist",
  "loading",
  "please wait",
  "looking for clues",
  "reading full chapters",
  "examining the specifics",
  "checking the scope",
  "opening your notes",
  "analyzing your files",
  "searching your docs",
  "scanning sources",
  "reviewing content",
  "processing request",
  "parsing the data",
  "gathering the facts",
  "thinking",
  "searching",
  // German
  "antwort wird erstellt",
  "antwort wird generiert",
  "wird erstellt",
  "wird generiert",
  "lädt",
  "wird geladen",
  "bitte warten",
  "quellen werden gescannt",
  "kontext wird abgerufen",
  "denke nach",
  // French
  "analyse en cours",
  "génération en cours",
  "réponse en cours",
  "chargement en cours",
  "veuillez patienter",
  "recherche en cours",
  // Spanish
  "generando respuesta",
  "creando respuesta",
  "cargando",
  "espere por favor",
  "buscando",
  "analizando",
  // Italian
  "generazione della risposta",
  "creazione della risposta",
  "caricamento",
  "attendere",
  "ricerca in corso",
  "analisi in corso",
  // Portuguese
  "gerando resposta",
  "criando resposta",
  "carregando",
  "por favor aguarde",
  "procurando",
  "analisando",
  // Dutch
  "antwoord wordt gegenereerd",
  "antwoord wordt gemaakt",
  "laden",
  "even geduld",
  "zoeken",
  "analyseren",
  // Japanese
  "回答を生成しています",
  "読み込み中",
  "お待ちください",
  "検索中",
  "分析中",
];

const ERROR_SNIPPETS = [
  // English
  "the system could not respond",
  "the system failed",
  "an error occurred",
  "try again later",
  // German
  "das system konnte keine antwort erstellen",
  "das system konnte nicht antworten",
  "es ist ein fehler aufgetreten",
  "versuche es später erneut",
  "versuchen sie es später erneut",
  // French
  "le système n'a pas pu répondre",
  "le système n'a pas réussi",
  "une erreur est survenue",
  "réessayez plus tard",
  // Spanish
  "el sistema no pudo responder",
  "ha ocurrido un error",
  "vuelve a intentarlo más tarde",
  "inténtalo de nuevo más tarde",
  // Italian
  "il sistema non è riuscito a rispondere",
  "si è verificato un errore",
  "riprova più tardi",
  // Portuguese
  "o sistema não pôde responder",
  "ocorreu um erro",
  "tente novamente mais tarde",
  // Dutch
  "het systeem kon niet reageren",
  "er is een fout opgetreden",
  "probeer het later opnieuw",
  // Japanese
  "システムが応答できませんでした",
  "エラーが発生しました",
  "後でもう一度お試しください",
];

const RATE_LIMIT_MESSAGES = [
  // English
  "daily discussion limit",
  "daily limit reached",
  "query limit reached",
  "rate limit exceeded",
  // German
  "tägliches diskussionslimit",
  "tageslimit erreicht",
  "ratenlimit überschritten",
  // French
  "vous avez atteint la limite quotidienne",
  "limite quotidienne de discussions",
  "limite quotidienne atteinte",
  // Spanish
  "límite diario alcanzado",
  "has alcanzado el límite diario",
  // Italian
  "limite giornaliero raggiunto",
  "hai raggiunto il limite giornaliero",
  // Portuguese
  "limite diário atingido",
  "você atingiu o limite diário",
  // Dutch
  "daglimiet bereikt",
  // Japanese
  "1日あたりの上限に達しました",
];

/**
 * Longest a loading indicator ever gets. Beyond this the substring test is
 * skipped: a real answer that happens to contain "searching", "loading" or
 * "thinking" would otherwise be rejected on every poll, and `waitForStableAnswer`
 * would burn its full timeout and return `null` for a response that was
 * on screen the whole time.
 */
const MAX_PLACEHOLDER_LENGTH = 120;

function isPlaceholder(text: string): boolean {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (
    trimmed.length <= MAX_PLACEHOLDER_LENGTH &&
    PLACEHOLDER_SNIPPETS.some((s) => lower.includes(s))
  ) {
    return true;
  }
  // Short text ending with "..." is almost certainly a loading indicator;
  // real responses run well past 50 chars.
  if (trimmed.length < 50 && trimmed.endsWith("...")) return true;
  return false;
}

function isErrorMessage(text: string): boolean {
  const lower = text.toLowerCase();
  return ERROR_SNIPPETS.some((s) => lower.includes(s));
}

function isRateLimitText(text: string): boolean {
  const lower = text.toLowerCase();
  return RATE_LIMIT_MESSAGES.some((s) => lower.includes(s));
}

export interface AskOptions {
  /** The question text — used to skip echo lines that NotebookLM mirrors back. */
  question?: string;
  /** Hard ceiling on the wait. Default 600 000 ms (10 min) — overridable per call. */
  timeoutMs?: number;
  /** Poll cadence. Default 750 ms. Lower values increase load without much benefit. */
  pollIntervalMs?: number;
  /** Texts known *before* the question was submitted. Used to skip prior answers. */
  ignoreTexts?: string[];
  /** How many consecutive identical polls count as "answer settled". Default 3. */
  stablePolls?: number;
}

/**
 * Snapshot every visible assistant answer text *before* a new question is
 * submitted. Pass the result into `waitForStableAnswer({ ignoreTexts })` so
 * the new turn isn't confused with prior turns in the same session.
 */
export async function snapshotPriorAnswers(page: Page): Promise<string[]> {
  try {
    const containers = page.locator(Selectors.chat.answerContainer);
    const count = await containers.count();
    const texts: string[] = [];
    for (let i = 0; i < count; i++) {
      // Same extraction path as `readLatestAnswer`, so the strings recorded
      // here actually match the ones the poller compares against. Reading the
      // raw container here (and the thinking-stripped body there) used to make
      // every `ignoreTexts` entry a guaranteed miss.
      const text = await extractAnswerText(containers.nth(i));
      if (text) texts.push(text);
    }
    return texts;
  } catch {
    return [];
  }
}

/**
 * Wait for the *latest* answer text to appear and stabilise.
 *
 * Returns the sanitised final text, or `null` on timeout. The function never
 * throws on UI hiccups — failure surfaces as `null` so the caller can decide
 * how to recover (retry vs. report error to the user).
 */
export async function waitForStableAnswer(
  page: Page,
  options: AskOptions = {}
): Promise<string | null> {
  const {
    question = "",
    timeoutMs = 600_000,
    pollIntervalMs = 750,
    ignoreTexts = [],
    stablePolls = 3,
  } = options;

  const deadline = Date.now() + timeoutMs;
  const echoLower = question.trim().toLowerCase();
  const ignoreSet = new Set(ignoreTexts.map((t) => t.trim()).filter(Boolean));
  // Hard ceiling on poll iterations defends against pathological
  // pollIntervalMs values combined with zombie-page sleep returns (issue #16).
  const maxPolls = Math.max(8, Math.ceil(timeoutMs / Math.max(50, pollIntervalMs)) + 4);

  let lastSeen: string | null = null;
  let stableStreak = 0;
  let pollCount = 0;

  while (Date.now() < deadline && pollCount < maxPolls) {
    pollCount++;

    // Every 10th poll we make sure the renderer still answers — bounded so a
    // wedged tab can't keep us spinning until the deadline (issue #16).
    if (pollCount % 10 === 0 && !(await pageIsAlive(page))) {
      throw new Error("Browser page unresponsive: health check timed out");
    }

    let candidate: string | null = null;
    try {
      candidate = await readLatestAnswer(page);
    } catch (err) {
      if (isRecoverable(err)) throw err;
      // Non-fatal extraction blip — try again next tick.
    }

    if (candidate) {
      const isEcho = candidate.toLowerCase() === echoLower;
      const isPrior = ignoreSet.has(candidate);

      if (!isEcho && !isPrior) {
        // Loading placeholders ("Parsing the data…", "Thinking…", …) are
        // stable while Gemini is still working — the old code locked on to
        // them and returned them as the final answer. Filter them out.
        if (isPlaceholder(candidate)) {
          stableStreak = 0;
          lastSeen = null;
          await safeSleep(page, Math.min(pollIntervalMs, 400));
          continue;
        }

        // Hard errors and rate-limit messages can be returned immediately —
        // there is no "stable" follow-up text coming.
        if (isErrorMessage(candidate) || isRateLimitText(candidate)) {
          return candidate;
        }

        if (candidate === lastSeen) {
          stableStreak++;
          if (stableStreak >= stablePolls) {
            return candidate;
          }
        } else {
          lastSeen = candidate;
          stableStreak = 1;
        }
      }
    }

    await safeSleep(page, pollIntervalMs);
  }

  return null;
}

/**
 * Read the latest answer container's text and strip UI-control leakage.
 *
 * Uses `lastMatch` rather than `.last()`: patchright's `.last()` resolves to
 * nothing when the locator matches exactly one element, which is precisely the
 * state on the first question of a session. See `utils/locators.ts`.
 */
async function readLatestAnswer(page: Page): Promise<string | null> {
  try {
    const container = await lastMatch(page.locator(Selectors.chat.answerContainer));
    if (!container) return null;
    return await extractAnswerText(container);
  } catch {
    return null;
  }
}

/**
 * Pull the prose out of one answer container, leaving the reasoning block
 * behind.
 *
 * Since 2026 the model streams a visible chain-of-thought into the same
 * `.message-text-content` node as the answer:
 *
 * ```
 * Thoughts
 * Defining MCP...
 * Clarifying MCP Definition...
 * expand_moreThe Model Context Protocol (MCP) is an open standard…
 * ```
 *
 * Reading the container wholesale returns all of that. The reasoning lives in
 * its own `thinking-chain-view` sibling, so we read the answer element(s)
 * directly and only fall back to the container — minus the reasoning text —
 * when the layout does not match.
 */
async function extractAnswerText(container: Locator): Promise<string | null> {
  const body = container.locator(Selectors.chat.answerBody);

  // Preferred path: read the answer element(s) only. A long answer can render
  // as several structural elements, so join rather than taking the first.
  const bodyTexts = await body.allInnerTexts().catch(() => [] as string[]);
  const joined = bodyTexts
    .map((t) => t.trim())
    .filter(Boolean)
    .join("\n");
  if (joined) {
    const cleaned = sanitizeAnswer(joined);
    if (cleaned.length > 0) return cleaned;
  }

  // Fallback for layouts without the 2026 answer element: take the whole
  // container and subtract the reasoning block's text if one is present.
  let raw: string;
  try {
    const textNode = await lastMatch(container.locator(Selectors.chat.answerTextInContainer));
    if (!textNode) return null;
    raw = await textNode.innerText({ timeout: 2_000 });
  } catch {
    return null;
  }

  const thinking = await container
    .locator(Selectors.chat.thinkingBlock)
    .first()
    .innerText({ timeout: 500 })
    .catch(() => "");

  const withoutThinking = thinking.trim() ? stripLeadingBlock(raw, thinking) : raw;
  const cleaned = sanitizeAnswer(withoutThinking);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Remove `block` from the front of `text` when it is there.
 *
 * `innerText` collapses whitespace differently inside and outside the nested
 * element, so the comparison is done on whitespace-normalised copies and the
 * cut is applied by walking the original string.
 */
function stripLeadingBlock(text: string, block: string): string {
  const norm = (s: string) => s.replace(/\s+/g, " ").trim();
  const normBlock = norm(block);
  if (!normBlock) return text;
  if (!norm(text).startsWith(normBlock)) return text;

  // Walk the original text until we've consumed as many non-space characters
  // as the block contains, then drop everything up to that point.
  const targetChars = normBlock.replace(/ /g, "").length;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i])) seen++;
    if (seen >= targetChars) return text.slice(i + 1);
  }
  return "";
}

/**
 * Strip Material-icon labels (`more_vert`, `more_horiz`, …) and orphaned
 * citation markers that NotebookLM occasionally leaks into `innerText`.
 * Only isolated lines are removed — never inline content — so legitimate
 * answer prose with the same words ("more horizontal") is not touched.
 */
export function sanitizeAnswer(text: string): string {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim());

  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (!line) continue;

    if (Selectors.uiControlLabels.has(line)) continue;

    // Icon glyphs are text nodes, so a collapsed layout can weld one onto the
    // following sentence with no separator ("expand_moreThe Model Context…").
    // Only strip when the label is followed by something that cannot continue
    // a snake_case identifier, so prose is never mangled.
    line = stripGluedControlLabel(line);
    if (!line) continue;

    // Drop lone digits or punctuation flanking a UI-control label
    // (typical citation-marker leak: ["1", "more_vert"]).
    const next = lines[i + 1] ?? "";
    const prev = lines[i - 1] ?? "";
    const nextIsControl = Selectors.uiControlLabels.has(next);
    const prevIsControl = Selectors.uiControlLabels.has(prev);
    if (/^\d+$/.test(line) && nextIsControl) continue;
    if (/^[.,;:!?]+$/.test(line) && (nextIsControl || prevIsControl)) continue;

    kept.push(line);
  }

  return kept
    .join("\n")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .trim();
}

/**
 * Drop a Material-icon label welded to the start of a line.
 *
 * Stripping only happens when the label is *welded* to what follows — the next
 * character continues a word but cannot continue the identifier (an uppercase
 * letter or a digit). Two cases are deliberately left alone:
 *
 *   - `"share this document…"` — followed by whitespace, so this is ordinary
 *     prose that happens to start with the same word, not a leaked glyph.
 *   - `"expand_more_button_label"` — followed by `_`/lowercase, so the label is
 *     just a prefix of a longer identifier.
 */
function stripGluedControlLabel(line: string): string {
  for (const label of Selectors.uiControlLabels) {
    if (!line.startsWith(label) || line.length === label.length) continue;
    const next = line[label.length];
    if (/[a-z_\s]/.test(next)) continue;
    return line.slice(label.length).trim();
  }
  return line;
}
