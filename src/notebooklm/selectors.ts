/**
 * Central selector registry for the Gemini Notebook web UI
 * (formerly NotebookLM — see `urls.ts` for the 2026 domain move).
 *
 * # Multilingual strategy
 *
 * Google ships the product in dozens of locales. Anchor priority:
 *
 *   1. **Angular component tags** (`add-sources-dialog`, `artifact-library-item`,
 *      `thinking-chain-view`, `project-button`, …) — the most stable anchor
 *      available and identical in every locale. Preferred since the 2026
 *      rewrite, which moved most semantic classes onto custom elements.
 *
 *   2. **Class names** (`.single-source-container`, `.submit-button`,
 *      `.create-artifact-button-container`, …) — Angular component classes,
 *      also locale-independent.
 *
 *   3. **Material-Symbols icon names** (`audio_magic_eraser`, `content_paste`,
 *      `link`, `upload`, `sync`, …) — Google ships them as the literal text
 *      node of `<mat-icon>` in every locale, so they are 100 % language-
 *      agnostic. Most stable anchor for icon-driven controls.
 *
 *   4. **Locale-bound aria-labels and visible text** — last resort. Each list
 *      below covers the eight major locales: EN, DE, FR, ES, PT, IT, NL, JA.
 *      Adding more is mechanical; nothing breaks if a locale is missing
 *      because the tag/class/icon anchors fire first.
 *
 * # 2026 layout changes verified against the live DOM
 *
 * - Buttons are wrapped in `nb-button` / `nb-icon-button` custom elements and
 *   the semantic class now sits on the **wrapper**, not the inner `<button>`.
 *   `button.add-source-button` therefore matches nothing; `.add-source-button
 *   button` is the correct anchor.
 * - `[role="dialog"]` alone is no longer safe: the notebook cover's emoji
 *   picker mounts a permanently-present, 0×0, invisible `div[role="dialog"]`
 *   that precedes real modals in document order. Anchoring on
 *   `mat-dialog-container` is required — see `overlayPane`.
 * - Answers now embed a `thinking-chain-view` reasoning block ahead of the
 *   prose. `answerBody` targets the prose only.
 *
 * Last verified: 2026-09 against the live notebook.google.com layout
 * (EN locale, signed-in account).
 */

export const Selectors = {
  chat: {
    answerContainer: ".to-user-container",
    answerText: ".to-user-container .message-text-content",
    latestAnswerText: ".to-user-container:last-child .message-text-content",
    /**
     * Same node as `answerText`, but **relative** to an `answerContainer`
     * locator. Scoping the absolute form inside a container searches for a
     * *nested* `.to-user-container`, which never exists — the lookup just
     * burns its timeout and yields nothing.
     */
    answerTextInContainer: ".message-text-content",
    /**
     * The answer prose only.
     *
     * Since 2026 the model streams a visible chain-of-thought block into the
     * same `.message-text-content` node:
     *
     * ```
     * div.message-text-content
     *   labs-tailwind-doc-viewer > element-list-renderer
     *     thinking-chain-view                       ← "Thoughts / Defining X… expand_more"
     *     labs-tailwind-structural-element-view-v2  ← the actual answer
     * ```
     *
     * Reading the container wholesale prepends reasoning noise (and a glued-on
     * `expand_more` icon label) to every response, so extraction targets this
     * element and falls back to the container only when it is absent.
     */
    answerBody: "labs-tailwind-structural-element-view-v2",
    /** Reasoning block to strip from extracted answers. */
    thinkingBlock: "thinking-chain-view",
    /**
     * Chat textarea. The class is shared across locales; aria-labels are a
     * fallback for older builds where the class was different.
     */
    queryInput: [
      "textarea.query-box-input",
      'textarea[aria-label*="query" i]',
      'textarea[aria-label*="anfrag" i]',
      'textarea[aria-label*="requete" i]',
      'textarea[aria-label*="zone de requete" i]',
      'textarea[aria-label*="consulta" i]',
      'textarea[aria-label*="domanda" i]',
      'textarea[aria-label*="vraag" i]',
      'textarea[aria-label*="質問" i]',
      'textarea[aria-label*="pergunta" i]',
    ],
    /**
     * The chat submit button has the *language-bound* aria-label
     * (Send / Senden / Envoyer / Enviar / Invia / Verzenden / 送信). It also
     * has the stable class `.submit-button`. The sources web-search overlay
     * uses `.actions-enter-button` with the SAME aria-label, so we MUST
     * anchor on `.submit-button` to avoid distractor matches.
     */
    submitButton: [
      "button.submit-button",
      'button.submit-button[aria-label*="send" i]',
      'button.submit-button[aria-label*="senden" i]',
      'button.submit-button[aria-label*="envoyer" i]',
      'button.submit-button[aria-label*="enviar" i]',
      'button.submit-button[aria-label*="invia" i]',
      'button.submit-button[aria-label*="verzend" i]',
      'button.submit-button[aria-label*="送信" i]',
    ],
  },

  /**
   * Blocking modals that are not part of any workflow but sit on top of the
   * app until dismissed. A fresh Google account always gets the welcome /
   * legal-notice dialog on first notebook open, which silently breaks every
   * click-driven flow (the Material backdrop swallows the click).
   */
  dialogs: {
    /** First-run "Welcome to Gemini Notebook" legal notice. */
    welcome: ["legal-notice-dialog", "mat-dialog-container:has(legal-notice-dialog)"],
    /**
     * Its acknowledge button. Text-anchored because the dialog ships no
     * stable class on the action; covers the eight major locales.
     */
    welcomeDismiss: [
      'legal-notice-dialog button:has-text("Okay")',
      'legal-notice-dialog button:has-text("OK")',
      'legal-notice-dialog button:has-text("Got it")',
      'legal-notice-dialog button:has-text("Verstanden")',
      'legal-notice-dialog button:has-text("Ok, verstanden")',
      'legal-notice-dialog button:has-text("J\'ai compris")',
      'legal-notice-dialog button:has-text("D\'accord")',
      'legal-notice-dialog button:has-text("Entendido")',
      'legal-notice-dialog button:has-text("De acuerdo")',
      'legal-notice-dialog button:has-text("Ho capito")',
      'legal-notice-dialog button:has-text("Entendi")',
      'legal-notice-dialog button:has-text("Begrepen")',
      'legal-notice-dialog button:has-text("OK")',
      'legal-notice-dialog button:has-text("確認")',
      "legal-notice-dialog mat-dialog-actions button",
    ],
    /**
     * Marketing opt-in checkbox inside the welcome dialog. Listed so the
     * dismissal helper can assert it is left **unchecked** — we acknowledge
     * the notice, we do not opt the user into email on their behalf.
     */
    welcomeMarketingOptIn: 'legal-notice-dialog input[type="checkbox"]',
    /**
     * Generic close affordance on a Material dialog. Written **relative** to
     * the dialog root so callers can scope it with
     * `page.locator(overlayPane).locator(sel)`.
     */
    closeButton: [
      'button[aria-label="Close"]',
      'button[aria-label="Close dialog"]',
      'button[aria-label*="close" i]',
      'button[aria-label*="schließen" i]',
      'button[aria-label*="fermer" i]',
      'button[aria-label*="cerrar" i]',
      'button[aria-label*="chiudi" i]',
      'button[aria-label*="fechar" i]',
      'button[aria-label*="sluiten" i]',
      'button[aria-label*="閉じる" i]',
    ],
  },

  /**
   * The product removed tabs in favour of a three-pane sidebar.
   * These selectors are kept only for the rare legacy layouts.
   */
  tabs: {
    discussion: [
      '[role="tab"]:has-text("Discussion")',
      '[role="tab"]:has-text("Diskussion")',
      '[role="tab"]:has-text("Diskussionen")',
      '[role="tab"]:has-text("Discusión")',
      '[role="tab"]:has-text("Discussione")',
      '[role="tab"]:has-text("Discussão")',
      '[role="tab"]:has-text("ディスカッション")',
    ],
    sources: [
      '[role="tab"]:has-text("Sources")',
      '[role="tab"]:has-text("Quellen")',
      '[role="tab"]:has-text("Fuentes")',
      '[role="tab"]:has-text("Fonti")',
      '[role="tab"]:has-text("Fontes")',
      '[role="tab"]:has-text("Bronnen")',
      '[role="tab"]:has-text("ソース")',
    ],
    activeTabClass: "mdc-tab--active",
    tabList: ".mat-mdc-tab-list .mdc-tab",
  },

  citations: {
    button: [
      "button.citation-marker",
      "button.xap-inline-dialog.citation-marker",
      "button[data-citation]",
    ],
    label: "span[aria-label]",
    highlight: ".highlighted",
    paragraph: ".paragraph",
    paragraphHighlight: ".paragraph .highlighted",
  },

  sources: {
    /**
     * Per-source row in the sidebar (language-agnostic). Stable Angular
     * class — verified across all observed locales.
     */
    sourceContainer: ".single-source-container",
    /**
     * "X Quellen" / "X sources" header text. Numeric so we read the count
     * via regex on the visible text. Independent of sidebar collapse state.
     */
    sourceCountIndicator: ".cover-subtitle-source-count",
    /**
     * Sidebar "Add source" button.
     *
     * 2026: the control is `nb-button.add-source-button > button`. The class
     * moved to the `nb-button` wrapper, so the pre-2026 `button.add-source-button`
     * matches nothing — the descendant form below covers both layouts.
     */
    addButton: [
      ".add-source-button button",
      "nb-button.add-source-button button",
      "button.add-source-button",
      'button[aria-label="Add source"]',
      '[aria-label="Add source"] button',
      'button[aria-label*="add source" i]',
      'button[aria-label*="quelle hinzu" i]',
      'button[aria-label*="ajouter une source" i]',
      'button[aria-label*="añadir fuente" i]',
      'button[aria-label*="agregar fuente" i]',
      'button[aria-label*="aggiungi fonte" i]',
      'button[aria-label*="adicionar fonte" i]',
      'button[aria-label*="bron toevoegen" i]',
      'button[aria-label*="ソースを追加" i]',
    ],
    /**
     * Real Material modal.
     *
     * CRITICAL: do **not** loosen this to a bare `[role="dialog"]`. The
     * notebook cover mounts `xap-emoji-picker`, whose emoji palette is a
     * permanently-present `div[role="dialog"]` — 0×0, invisible, and *earlier
     * in document order* than any real modal. A bare `[role="dialog"]` with
     * `.first()` therefore resolves to the emoji palette: waits for
     * `state: "visible"` time out, waits for `state: "hidden"` return
     * instantly, and every overlay-scoped lookup searches the wrong subtree.
     * `mat-dialog-container` is mounted by Angular Material only for genuine
     * modals, and (like `[role="dialog"]`) is set synchronously on mount, so
     * it stays race-free against the `.mdc-dialog--open` animation class.
     */
    overlayPane: "mat-dialog-container",
    /** The add-source modal specifically, when we need to disambiguate. */
    addSourceDialog: "mat-dialog-container:has(add-sources-dialog)",
    /**
     * URL / text entry field inside the add-source modal.
     *
     * 2026: the URL step renders a **textarea** inside
     * `mat-form-field.urls-input` (it accepts several newline-separated URLs).
     * The pre-2026 `input[type="text"]` no longer exists in that step.
     *
     * Written **relative** to the dialog root.
     */
    overlayTextarea: ".urls-input textarea, textarea",
    overlayInput: 'input[type="text"]:not([readonly])',
    /**
     * Source-type buttons in the Add-source overlay. Google ships them
     * *without* aria-labels — the only stable, language-agnostic anchor is
     * the Material-Symbols icon name baked into a `<mat-icon>` text node.
     */
    sourceTypeUrl: [
      // Icon-anchored (language-free) — primary path. The "Websites" tile
      // carries both a `link` and a `video_youtube` glyph.
      'button.drop-zone-icon-button:has(mat-icon:text-is("link"))',
      "button.drop-zone-icon-button:has(mat-icon.youtube-icon)",
      'button.drop-zone-icon-button:has(mat-icon:text-is("video_youtube"))',
      // Visible-text fallbacks for the eight major locales.
      'button.drop-zone-icon-button:has-text("Websites")',
      'button.drop-zone-icon-button:has-text("Website")',
      'button.drop-zone-icon-button:has-text("Sites Web")',
      'button.drop-zone-icon-button:has-text("Sitio web")',
      'button.drop-zone-icon-button:has-text("Sito web")',
      'button.drop-zone-icon-button:has-text("Sites")',
      'button.drop-zone-icon-button:has-text("ウェブサイト")',
    ],
    sourceTypeText: [
      // Icon-anchored (language-free) — primary path.
      'button.drop-zone-icon-button:has(mat-icon:text-is("content_paste"))',
      // Visible-text fallbacks for major locales.
      'button.drop-zone-icon-button:has-text("Kopierter Text")',
      'button.drop-zone-icon-button:has-text("Copied text")',
      'button.drop-zone-icon-button:has-text("Pasted text")',
      'button.drop-zone-icon-button:has-text("Texte copié")',
      'button.drop-zone-icon-button:has-text("Texto copiado")',
      'button.drop-zone-icon-button:has-text("Testo copiato")',
      'button.drop-zone-icon-button:has-text("Gekopieerde tekst")',
      'button.drop-zone-icon-button:has-text("コピーしたテキスト")',
    ],
    sourceTypeYoutube: [
      'button.drop-zone-icon-button:has(mat-icon:text-is("video_youtube"))',
      "button.drop-zone-icon-button:has(mat-icon.youtube-icon)",
    ],
    sourceTypeFile: [
      'input[type="file"]',
      'button.drop-zone-icon-button:has(mat-icon:text-is("upload"))',
      'button.drop-zone-icon-button:has-text("Dateien hochladen")',
      'button.drop-zone-icon-button:has-text("Upload sources")',
      'button.drop-zone-icon-button:has-text("Upload files")',
      'button.drop-zone-icon-button:has-text("Importer")',
      'button.drop-zone-icon-button:has-text("Subir")',
      'button.drop-zone-icon-button:has-text("Carica")',
      'button.drop-zone-icon-button:has-text("Uploaden")',
      'button.drop-zone-icon-button:has-text("アップロード")',
    ],
    /**
     * Primary submit button in the add-source dialog.
     *
     * 2026 ships it as `.mdc-button--unelevated` / `.mat-mdc-unelevated-button`;
     * older builds used `--raised`. Both class anchors are listed ahead of the
     * per-locale visible-text variants. The button starts **disabled** and
     * only enables once the field validates, so callers must re-check
     * `isDisabled()` rather than clicking the first match blindly.
     *
     * Written **relative** to the dialog root — callers scope these with
     * `page.locator(overlayPane).locator(sel)`.
     */
    insertConfirm: [
      // Class-anchored (language-free).
      "button.mat-mdc-unelevated-button:not([disabled])",
      "button.mdc-button--unelevated:not([disabled])",
      "button.mdc-button--raised:not([disabled])",
      "button.mat-flat-button:not([disabled])",
      // Visible-text fallbacks for major locales.
      'button:has-text("Insert")',
      'button:has-text("Einfügen")',
      'button:has-text("Hinzufügen")',
      'button:has-text("Insérer")',
      'button:has-text("Ajouter")',
      'button:has-text("Insertar")',
      'button:has-text("Añadir")',
      'button:has-text("Agregar")',
      'button:has-text("Inserisci")',
      'button:has-text("Aggiungi")',
      'button:has-text("Inserir")',
      'button:has-text("Adicionar")',
      'button:has-text("Invoegen")',
      'button:has-text("Toevoegen")',
      'button:has-text("挿入")',
      'button:has-text("追加")',
      'button:has-text("Add")',
      'button:has-text("Submit")',
      'button[type="submit"]',
    ],
  },

  studio: {
    /** The Studio pane itself — tag and class both exist in the 2026 layout. */
    panel: "studio-panel, .studio-panel",
    /**
     * "Audio Overview" entry control. It is a `<div role="button">` inside a
     * `basic-create-artifact-button`, NOT a real `<button>`.
     *
     * The Studio now offers nine artifact types (Audio Overview, Slide Deck,
     * Video Overview, Mind Map, Reports, Flashcards, Quiz, Infographic, Data
     * Table), so a generic `.create-artifact-button-container` match is
     * ambiguous — every selector below pins the Audio one specifically via
     * its `audio_magic_eraser` glyph or its localised label.
     */
    audioOverviewButton: [
      // Icon-anchored (language-free) — primary path.
      '.create-artifact-button-container:has(mat-icon:text-is("audio_magic_eraser"))',
      '[role="button"]:has(mat-icon:text-is("audio_magic_eraser"))',
      // Locale-bound aria-labels for the eight major locales.
      '[role="button"][aria-label*="audio overview" i]',
      '[role="button"][aria-label*="audio-zusammenfassung" i]',
      '[role="button"][aria-label*="aperçu audio" i]',
      '[role="button"][aria-label*="resumen de audio" i]',
      '[role="button"][aria-label*="panoramica audio" i]',
      '[role="button"][aria-label*="visão geral de áudio" i]',
      '[role="button"][aria-label*="audio-overzicht" i]',
      '[role="button"][aria-label*="音声の概要" i]',
      // Legacy <button> fallbacks for older builds.
      'button:has(mat-icon:text-is("audio_magic_eraser"))',
      'button[aria-label*="audio overview" i]',
      'button[aria-label*="audio-zusammenfassung" i]',
      'button[aria-label*="podcast" i]',
    ],
    /**
     * Clicking the Audio Overview card opens a `configurable-form-dialog`
     * ("Customize Audio Overview") — generation only starts after its
     * Generate button is pressed.
     */
    customizeDialog: "mat-dialog-container:has(configurable-form-dialog)",
    generateButton: [
      'mat-dialog-container button:has-text("Generate")',
      'mat-dialog-container button:has-text("Generieren")',
      'mat-dialog-container button:has-text("Générer")',
      'mat-dialog-container button:has-text("Generar")',
      'mat-dialog-container button:has-text("Genera")',
      'mat-dialog-container button:has-text("Gerar")',
      'mat-dialog-container button:has-text("Genereren")',
      'mat-dialog-container button:has-text("生成")',
      'button:has-text("Generate")',
      'button:has-text("Generieren")',
      'button:has-text("Générer")',
      'button:has-text("Generar")',
      'button:has-text("Genera")',
      'button:has-text("Gerar")',
      'button:has-text("Genereren")',
      'button:has-text("生成")',
    ],
    /**
     * Length presets in the customise dialog (Short / Default / Long).
     * Locale-bound visible text — optional, so a miss is not fatal.
     */
    audioLengthOption: {
      short: [
        'button:has-text("Short")',
        'button:has-text("Kurz")',
        'button:has-text("Court")',
        'button:has-text("Corto")',
        'button:has-text("Breve")',
        'button:has-text("Kort")',
        'button:has-text("短い")',
      ],
      default: [
        'button:has-text("Default")',
        'button:has-text("Standard")',
        'button:has-text("Par défaut")',
        'button:has-text("Predeterminado")',
        'button:has-text("Predefinito")',
        'button:has-text("Padrão")',
        'button:has-text("デフォルト")',
      ],
      long: [
        'button:has-text("Long")',
        'button:has-text("Lang")',
        'button:has-text("Largo")',
        'button:has-text("Lungo")',
        'button:has-text("Longo")',
        'button:has-text("長い")',
      ],
    },
    /** Container that holds every generated artifact tile. */
    artifactLibrary: "artifact-library, .artifact-library-container",
    /** Any artifact tile, ready or not. */
    artifactItem: "artifact-library-item",
    /**
     * A tile that is still rendering.
     *
     * `.shimmer-blue` is the loading-shimmer class, and it held steady across
     * the whole generation window when measured against the live UI.
     *
     * The tile's `mat-icon` is deliberately **not** used: it alternates between
     * `sync` and `audio_magic_eraser` while the placeholder animates, so a
     * single icon probe reports the wrong state at random intervals. Locales
     * that somehow lack the shimmer class are still covered by the localised
     * "come back in a few minutes" phrase list in `audio.ts`.
     *
     * Structurally the in-progress tile is otherwise identical to a finished
     * one, which is why the pre-2026 "any tile means ready" logic reported
     * success the instant generation started.
     */
    artifactGenerating: [
      "artifact-library-item:has(.shimmer-blue)",
      "artifact-library-item:has(.artifact-item-button--entering)",
    ],
    /**
     * A finished Audio Overview tile: an artifact tile that is *not* showing
     * the loading shimmer. Callers must combine this with a check that at
     * least one tile exists, since `:not(:has(…))` matches nothing when the
     * library is empty.
     */
    audioPlayer: [
      "artifact-library-item:not(:has(.shimmer-blue)):not(:has(.artifact-item-button--entering))",
      // Legacy layouts.
      "artifact-library-item:has(button.artifact-action-button)",
      "audio",
    ],
    /** Clickable surface of an artifact tile (opens the player). */
    artifactOpenButton: [
      "artifact-library-item button.artifact-stretched-button",
      "artifact-library-item button.artifact-action-button",
    ],
    /**
     * Download trigger. The Studio panel uses an icon-only button with a
     * `download` Material-Symbols glyph; aria-label is locale-bound.
     */
    downloadButton: [
      // Icon-anchored (language-free) — primary path.
      'button:has(mat-icon:text-is("download"))',
      // Locale-bound aria-labels.
      'button[aria-label*="download" i]',
      'button[aria-label*="herunterladen" i]',
      'button[aria-label*="télécharger" i]',
      'button[aria-label*="descargar" i]',
      'button[aria-label*="scarica" i]',
      'button[aria-label*="baixar" i]',
      'button[aria-label*="downloaden" i]',
      'button[aria-label*="ダウンロード" i]',
    ],
    /**
     * Per-tile "More"/"Mehr"/"Plus"/… three-dot button. Opens the menu that
     * contains the Download item.
     */
    audioMoreMenuButton: [
      'artifact-library-item button:has(mat-icon:text-is("more_vert"))',
      'artifact-library-item [aria-label*="more" i] button',
      'artifact-library-item button[aria-label*="mehr" i]',
      'artifact-library-item button[aria-label*="more" i]',
      'artifact-library-item button[aria-label*="plus" i]',
      'artifact-library-item button[aria-label*="más" i]',
      'artifact-library-item button[aria-label*="altro" i]',
      'artifact-library-item button[aria-label*="mais" i]',
      'artifact-library-item button[aria-label*="meer" i]',
      'artifact-library-item button[aria-label*="その他" i]',
    ],
    /**
     * Download menu-item that surfaces after clicking the three-dot menu.
     */
    audioDownloadMenuItem: [
      '[role="menuitem"]:has(mat-icon:text-is("download"))',
      '[role="menuitem"]:has-text("Download")',
      '[role="menuitem"]:has-text("Herunterladen")',
      '[role="menuitem"]:has-text("Télécharger")',
      '[role="menuitem"]:has-text("Descargar")',
      '[role="menuitem"]:has-text("Scarica")',
      '[role="menuitem"]:has-text("Baixar")',
      '[role="menuitem"]:has-text("Downloaden")',
      '[role="menuitem"]:has-text("ダウンロード")',
    ],
  },

  notebooks: {
    /**
     * Notebook card on the home page.
     *
     * 2026: each card is a `project-button` custom element wrapping a
     * `mat-card`; the clickable surface is `a.primary-action-button[role="link"]`.
     * The pre-2026 `button[aria-labelledby*="project-"]` matches nothing.
     */
    projectCard: "project-button",
    projectCardLink: "project-button a.primary-action-button",
    projectGrid: "project-grid",
    cardMenuButton: [
      "project-action-button button",
      'project-button button[aria-label*="menu" i]',
      'button[aria-label*="menu" i]',
      'button[aria-label*="options" i]',
      'button[aria-label*="more" i]',
      'button[aria-label*="optionen" i]',
      'button[aria-label*="opzioni" i]',
      'button[aria-label*="opciones" i]',
      'button[aria-label*="opções" i]',
      'button[aria-label*="メニュー" i]',
    ],
    deleteButton: [
      '[role="menuitem"]:has-text("Delete")',
      '[role="menuitem"]:has-text("Löschen")',
      '[role="menuitem"]:has-text("Supprimer")',
      '[role="menuitem"]:has-text("Eliminar")',
      '[role="menuitem"]:has-text("Borrar")',
      '[role="menuitem"]:has-text("Elimina")',
      '[role="menuitem"]:has-text("Excluir")',
      '[role="menuitem"]:has-text("Verwijderen")',
      '[role="menuitem"]:has-text("削除")',
    ],
    confirmDelete: [
      'button:has-text("Delete")',
      'button:has-text("Löschen")',
      'button:has-text("Supprimer")',
      'button:has-text("Eliminar")',
      'button:has-text("Borrar")',
      'button:has-text("Elimina")',
      'button:has-text("Excluir")',
      'button:has-text("Verwijderen")',
      'button:has-text("削除")',
    ],
  },

  /**
   * Material Icon labels that leak into extracted answer text as isolated
   * lines. Stripped from the response before delivery to the client.
   *
   * `expand_more` and `sync` were added in 2026: the thinking-chain block ends
   * with an `expand_more` toggle and the Studio spinner renders `sync`.
   */
  uiControlLabels: new Set([
    "more_horiz",
    "more_vert",
    "open_in_new",
    "content_copy",
    "bookmark_border",
    "expand_more",
    "expand_less",
    "chevron_forward",
    "thumb_up",
    "thumb_down",
    "share",
    "keep",
    "keep_pin",
    "copy_all",
    "arrow_forward",
    "sync",
    "edit_fix_auto",
    "sticky_note_2",
  ]),
} as const;

/**
 * Joins a list of selector candidates into a comma-separated string.
 * Patchright/Playwright accepts this as a CSS locator (comma = OR).
 *
 * Example: `joinAlt(Selectors.chat.queryInput)` → `"textarea.query-box-input, textarea[aria-label*=\"query\" i], ..."`
 */
export function joinAlt(selectors: readonly string[]): string {
  return selectors.join(", ");
}
