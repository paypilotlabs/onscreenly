# Onscreenly design

This folder holds the redesign that PR 9 builds into the app: a quiet dark overlay over your screen, and a light workspace for Settings, onboarding, consent and the permissions window. The look follows the Cluely style source (below): Geist everywhere, one Signal Blue accent, hairline Bone borders, no drop shadows on surfaces.

> **Changed in 0.2.5:** the guide (onboarding, and Help in the toolbar) is no longer a light workspace dialog. It is part of the dark overlay: it opens in the answer panel's place under the toolbar, at the panel's width. Nothing is dimmed or blurred, only the guide takes the mouse, and a toolbar click closes it; the publik disclosure and card, which must be answered, keep a dimming scrim. The welcome step drops the hero band and the EB Garamond headline, so item 11, the EB Garamond line under Type, and the onboarding entries under the light workspace below now apply only to this prototype. Settings, consent and the permissions window stay light.

| File | What it is |
|---|---|
| [`prototype.html`](prototype.html) | The interactive prototype the decisions below were made on. One self-contained file: fonts, styles and scripts are inline, and it makes no network requests. |
| [`pr9-spec.md`](pr9-spec.md) | The full specification: tokens, every screen and state, copy, accessibility, the commit plan and the tests. |
| `README.md` | This file: the decisions, where the tokens come from, the contrast rules and their one exception. |

## Open the prototype

Download `prototype.html` (or use your checkout) and open it in a current Chrome, Edge, Safari or Firefox. It needs nothing else. The page shows:

- **Stage A:** the 1300×600 overlay window, scaled to fit (switch to 1:1 under the stage), over a choice of desktops: a Zoom call, a white document, VS Code, a gradient, white or black.
- **Stage B:** the 500×540 permissions window.
- **Scenes 1–12:** a live call, Settings over a call, first run on each platform, the onboarding detour to Settings, publik, consent, the permissions window, interview prep, a meeting with notes, no speech-to-text, and macOS with Meeting audio off. Back and Next step through each one.
- **The rail:** the Decisions list, every state of every control (session, empty states, thinking, answers, errors, composer, banner, toasts, sidebar, collapse, Settings, onboarding, permissions), and the accessibility simulations (reduced motion, increased contrast, forced colours, reduced transparency).
- **Sheets:** the tokens, a live contrast matrix, and every control in both themes.

Platform, desktop and opacity are under Stage A. Links such as `prototype.html#scene-3` or `#tokens` open a scene or a sheet directly.

The production stylesheets inside it are the files in `renderer/css/`, copied verbatim; the prototype adds only its own page chrome, in a last `proto` layer. One value differs: the app's onboarding frame is 504px tall, not 502px. The publik disclosure step needs 1px more than 502px leaves it, which the prototype's screenshots never showed because headless Chromium hides scrollbars; in the app the 10px scrollbar appeared, the text rewrapped, and the terms sentence dropped out of view.

## Decisions

The prototype put 14 items up for approval, each with a default and an alternative. All 14 were approved at their defaults. Two more decisions came from the review of the prototype.

| # | Item | Decision | What it means in the app |
|---|---|---|---|
| 1 | CTA fill | Exact Signal Blue `#3c83f6` (`--accent-fill`) | The white label is 3.64:1: the one documented contrast exception (below). |
| 2 | Opacity | As today | `--onscreenly-opacity` fades `#app` and all three dialog scrims together. |
| 3 | Opacity popover | Opens upward as one 36px row | While it is open, `#app.opacity-open` moves the content down 44px (top padding 58px), instantly. |
| 4 | Live dot | Inside Start/End session, plus an unread dot on Hide | An 8px dot beside "End session"; Hide shows a blue dot when an answer arrives while collapsed. |
| 5 | Assist label | "Assist" | "Smart assist" becomes "Assist" in the action row, the empty state, onboarding and titles. |
| 6 | Question | A quiet line | The question is a caption above its answer: `--text-2`, with a 2px rule on its left. |
| 7 | Live speech | Ghost text in the composer | What the other side says shows once, as one line of ghost text in the composer. |
| 8 | Composer Settings button | Hidden | `#more-btn` stays in the DOM with `.hidden`; Settings lives in the toolbar. |
| 9 | Toast | Centred under the toolbar | Up to 560px with an ellipsis; the panel moves down while a toast shows. |
| 10 | Status tones | Achromatic, plus one muted green | Green only for ok and live (`#8fc4a3` overlay, `#3f6b4f` workspace). Warnings and errors use strong text and a hairline, no tint. |
| 11 | Hero gradient | Linear `#0544a9` → `#022c70` | Behind the whole welcome band in onboarding. |
| 12 | Settings "Done" | Neutral secondary | Each Settings pane keeps a single blue button. |
| 13 | Send | Signal Blue, always | A Signal Blue pill reading "Send ↵"; neutral only while no AI provider is set up. Empty, it runs Assist, and its title says so. |
| 14 | AA role substitutions | Steel instead of Fog and Mist | Captions, placeholders, eyebrows and timestamps use Steel (6.16:1 on Chalk) in the workspace. |
| – | No icons | Text labels everywhere | Every control is a word: Opacity, Help, Settings, Quit, Close, Dismiss, "Send ↵". Shortcuts are text: ⌘ ⇧ ↵ on macOS; Ctrl, Shift, Enter on Windows and Linux. Status dots and the spinner stay, as do the marks form controls draw (a select's caret, a checkbox's tick). |
| – | Session shortcut | ⌘⇧L (Ctrl+Shift+L on Windows and Linux) | A new global shortcut starts and ends a session. The toolbar reads "Start session ⌘⇧L" / "End session ⌘⇧L" and "Hide ⌘⇧/" (Quit shows none). It is listed first in the Ready empty state and in onboarding step 4. |

Had an item gone the other way, these tests would change: item 1 the CTA contrast test in `test/renderer/design-system.test.js`; items 2, 3, 4, 7, 9 and 13 the overlay e2e checks (opacity, popover bounds, live and unread dots, ghost text, toast bounds, Send labels); items 10 and 14 the role and contrast tests; items 11 and 12 the onboarding and Settings theme checks.

## Tokens

`renderer/css/tokens.css` is the single source of colour, type, spacing, radius, shadow and motion values. No other stylesheet may contain a colour literal.

**Provenance.** Section 1 is the Cluely token set, all 87 declarations, copied verbatim from the user's style source:
Source: https://styles.refero.design/style/72da35d5-1cfd-41a3-94f6-cb6b8c07a670 (Cluely). Section 2 is its 52 DTCG type steps (`--ts-<step>` and `--ts-<step>-track`). Neon (`#00ff26`) and cyan-veil (`#7df0f8`) are declared and never referenced; the guideline calls them decorative.

**Four source quirks.** In each case the token wins:

1. The `--tracking-*` values are in px and near zero (only `-0.96px`, −0.012em at 80px, is right). The type roles use the guideline's em values, and the px tokens stay unused.
2. The elevation prose names `#0544a9`, but `--shadow-subtle` uses `rgb(12, 68, 161)`. The CTA hover uses `var(--shadow-subtle)` as it is.
3. `--radius-full: 110.25px` coexists with `--radius-pills: 9999px`. Pills use `--radius-pills`.
4. The second layer of `--shadow-subtle-2` has no `inset`, though the prose says it should. It is used only for the prototype's mockup frame.

**Type.** Geist for everything; EB Garamond only for the welcome headline in onboarding (`--type-display`, 500 48/1.02, the 80px step scaled). `--type-help` uses −0.01em tracking where its step says 0, because the guideline's body rule wins. Keycaps and code use the system monospace stack, since Geist has no ⌘ ⇧ ↵.

**New literals.** Section 5 of `tokens.css` holds the colours the style source does not have. They were listed for approval and are now approved:

| Token | Value | Used for |
|---|---|---|
| `--lit-ok-overlay` | `#8fc4a3` | `--ok` in the overlay: the live dot, "Listening", ok toasts |
| `--lit-ok-workspace` | `#3f6b4f` | `--ok` in the workspace: "Allowed" tags, saved status |
| `--lit-accent-alt` | `#2c70de` | Approval 1's alternative fill (4.69:1). Declared, not referenced. |
| `--lit-warn-overlay`, `--lit-danger-overlay` | `#d4b679`, `#e09a9a` | Approval 10's alternative inks. Declared, not referenced. |
| `--lit-warn-workspace`, `--lit-danger-workspace` | `#7a5c1e`, `#a33a3a` | The same, for the workspace. Declared, not referenced. |

The hero gradient's two literals (`--gradient-hero`, and `--gradient-hero-alt` for approval 11's alternative) come from the guideline text, not from the token set.

## Contrast

Every text role is checked from the token values by `test/renderer/design-system.test.js`:

- **Workspace:** `--text-1` (Carbon) 17.72 / 16.60 / 15.28 on Chalk, Frost and Vapor; `--text-nav` (Slate) 13.16 / 12.33 / 11.35; `--text-2` and `--text-3` (Steel) 6.16 / 5.77 / 5.31. Fog (4.27:1 on Chalk) is disabled text only. `--ok` is 6.13:1 on Chalk.
- **Overlay:** the panel is translucent, so its text is judged on the surface composited over a white and a black desktop. `--text-1` is 14.57 / 15.35, `--text-2` (Mist) 8.10 / 8.53, the answer text 15.83 / 16.68 and `--ok` 8.52 / 8.98.
- **Hero:** Chalk on `#0544a9` 8.73, on `#022c70` 13.15; Frost on `#0544a9` 8.18.
- **Focus ring:** Signal Blue at 3.64:1 on Chalk and 4.87:1 on Carbon (3:1 needed for a non-text indicator).
- Informative text is always `--text-2` or stronger.

### Contrast exceptions

- **The primary button label: white on Signal Blue is 3.64:1.** Approval item 1 keeps the exact Signal Blue CTA (`--accent-fill: var(--color-signal-blue)`) because it is the brand mark. The label is 14px at weight 500, so it does not count as large text, and this is below AA's 4.5:1. It is the only known exception. The design-system test allows exactly this ratio with exactly this fill; any other fill under 4.5:1 fails it. The approved alternatives were `#2c70de` (4.69:1) and azure-crest `#0544a5` (8.84:1).
- **Bone hairlines are 1.27:1 on Chalk,** below the 3:1 that WCAG 1.4.11 asks of component edges. Controls never depend on the edge alone: fields have visible labels and an inset shadow, focus adds a Signal Blue border and halo, and under `prefers-contrast: more` workspace lines turn Steel (6.16:1).

## Why two themes

The overlay floats over whatever you are doing: a video call, a document, an editor. It has to stay quiet over all of them and keep its text legible over a white page as well as a dark one, so it is dark glass: Carbon at 98% (fully opaque under increased contrast or reduced transparency), Vapor and Frost text, hairlines in Bone at low alpha.

Settings, onboarding, consent and the permissions window are where you read and fill in forms. They use Cluely's own light workspace: Chalk surfaces, Carbon text, Bone hairlines, Frost and Vapor fills. This is also how the style source presents a product: a dark app inside a light frame.

The two meet through the scrims. A dialog opens over a 45% ink scrim that dims and blurs the overlay behind it, so a light dialog sits over a dimmed dark overlay. Theme classes are static markup: `.theme-overlay` on `#app`, `.theme-workspace` on `#settings`, `#onboard`, `#consent` and `.perm-card`. Themes never nest, and both declare the same set of properties (a test checks this).

## What the app adopts from the prototype build

The prototype was built, reviewed and fixed before approval. These changes from the specification came out of that work and are part of the design the app implements:

- **Surface:** the overlay `--bg-surface` is Carbon at 98%, not 92%: at 92% a white document stayed legible through the answer text. It is fully opaque under `prefers-contrast: more` and `prefers-reduced-transparency`.
- **New tokens:** `--scrim-dim` (the scrim's 45% as a brightness filter), `--delay-label` (150ms before a thinking label fades in), and `--type-code` / `--type-code-answer` with their tracks (code at 13px in body text, 17px inside a 20px answer; nothing below 12px).
- **Checkboxes:** a shared `.check` control in `controls.css` replaces native checkboxes.
- **Disabled secondary buttons** keep their surface and hairline and only lose their text colour.
- **Toast:** while a toast shows, the panel moves down by the toast's height and gaps, so the toast never covers the question line.
- **Sidebar and scrims:** a dialog's scrim stops at the open transcript sidebar's edge, and the sidebar dims itself with `--scrim-dim`, so it is never dimmed twice.
- **Panel height:** with the sidebar open the panel is at least 240px tall, so the two always match; the composer stays at the bottom.
- **Runtime hooks:** `#panel[data-capture=off|on|no-stt]` picks the listening empty states; `.fade-top` and `.fade-bottom` on `#messages` and `.ts-list` fade the edge a scroll cuts through; `#action-row.drop-assist-hint` and `.drop-hints` drop the shortcut hints when the row would overflow (Windows key names).
- **Scrolling:** the log follows a new answer until its question reaches the top, then stops. A finished answer that only just overflows, or one that ends in an error, shows its end, so its fix button or card actions stay in view.
- **Composer:** "Ready · ↵ to answer" sits in the bottom row, left of Send. Ghost text has a breathing live dot, and its ellipsis falls at the start so the newest words stay visible. The dimmed state dims only the text, so Send stays crisp.
- **Send** is neutral while no AI provider is set up, so "Open settings" is the one accent (a carve-out from item 13's "always").
- **Onboarding:** one fixed frame for all four steps (504px, see above), so Next never moves; the progress ("Step n of 4" and the dots) sits beside Skip.
- **Settings** keeps one height (552px) on every tab.
- **Copy:** typographic apostrophes in UI text; key fields are labelled "API key" (the chip names the provider); step 2's in-row buttons read "Open settings" with a full `aria-label`; the publik terms link is the last words of main's sentence rather than a repeated label.
- **Clear transcript** is disabled while the transcript is empty.
- **Windows permissions window:** "Continue without microphone" is a secondary button while the microphone is off and becomes primary once it is allowed.
- **`permissions.css`** imports the `workspace` layer as well, because the card's styles live there.

The prototype's own focus behaviour (Tab leaves the stage for the page) is prototype-only; the app traps focus in its dialogs.
