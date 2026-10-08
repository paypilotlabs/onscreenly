# PR 9 specification

This is the specification the redesign was built from, kept as it was approved before the prototype review. The addendum below records what changed afterwards; where the two disagree, the addendum wins. [`README.md`](README.md) has the decisions table, the token provenance and the contrast exceptions, and [`prototype.html`](prototype.html) shows every screen and state.

## Addendum: decisions after the prototype

**All 14 approval items are at their defaults.** Exact Signal Blue CTA; opacity as today; the popover opens upward; the live dot inside `#stop-btn` and an unread dot on Hide; "Assist"; the question as a quiet line; ghost-text speech; `#more-btn` hidden; the toast centred; achromatic tones plus one muted green; the linear hero gradient; "Done" as a secondary button; a blue Send; the Steel substitutions. The alternatives and fallbacks below are no longer built.

**No icons.** Text labels everywhere, which supersedes every icon in this document:

- Icon-only buttons become words: Opacity, Help (`#logo-btn`), Settings, Quit, Close (sidebar), Dismiss (banner). Send is a Signal Blue pill reading "Send ↵", not a circle with an arrow.
- Keycaps and shortcut hints are text: ⌘ ⇧ ↵ on macOS; Ctrl, Shift, Enter on Windows and Linux. A shared `kbd()` and `modKey` in `renderer/js/core.js` render them.
- Status dots and the spinner stay, as do the marks form controls draw (a select's caret, a checkbox's tick). The error block, STT status, banner, tags, step tiles, permission rows and `.btn-danger` carry no icon; warn and danger read through their word, ink and hairline.
- `renderer/icons.js` is deleted with its `<script>` tags, the Lucide icon list and its NOTICE entry are dropped, and `icons.test` becomes a scan: no `<svg`, no `icon(` and no emoji under `renderer/`.

**Session shortcut ⌘⇧L.** A new global `CommandOrControl+Shift+L` starts and ends a session:

- `app/main/shortcuts.js` registers `DEFAULTS.listening` (already defined in `src/platform/shortcuts.js`) and sends `session:toggle`; `app/main/session.js` records it in `shortcutState`; `preload.js` adds `'session:toggle'` to the `on()` allowlist. This is one push channel and no new IPC handler, so the main-process edit list gains `shortcuts.js`, `session.js` and `preload.js`. `ipc.js` stays untouched.
- `renderer/js/toolbar.js` shares one toggle function between the button and the push.
- The toolbar reads "Start session ⌘⇧L" / "End session ⌘⇧L" and "Hide ⌘⇧/"; Quit shows no hint. The shortcut is listed first in the Ready empty state and in onboarding step 4, and in the README keyboard table.

**Deviations the app adopts** (from the prototype's build and fix passes; `README.md` explains each):

- the overlay `--bg-surface` is Carbon 98%, and opaque under `prefers-contrast: more` and `prefers-reduced-transparency`;
- new tokens `--scrim-dim`, `--delay-label`, `--type-code(-track)` and `--type-code-answer(-track)`;
- the shared `.check` control; disabled secondary buttons keep their surface and hairline;
- the toast pushes the panel down while it shows;
- a dialog's scrim stops at the open sidebar, which dims itself with `--scrim-dim`;
- with the sidebar open the panel is at least 240px tall;
- runtime hooks `#panel[data-capture=off|on|no-stt]`, `.fade-top` / `.fade-bottom`, `#action-row.drop-assist-hint` / `.drop-hints`;
- the log follows a new answer until its question reaches the top;
- the composer's "Ready · ↵ to answer" sits beside Send, the ghost text has a live dot and a leading ellipsis, and `.stt-dimmed` dims only the text;
- Send is neutral while no AI provider is set up;
- one fixed 536px onboarding frame, with the progress beside Skip; Settings keeps one 552px height;
- typographic apostrophes, "API key" field labels, "Open settings" step-2 row buttons, and the publik terms link on main's own words;
- Clear transcript is disabled while the transcript is empty;
- on Windows, "Continue without microphone" is secondary until the microphone is allowed;
- `permissions.css` also imports the `workspace` layer.

---

## PR 9: UX redesign (hybrid dark overlay + light Cluely workspace)

This is the final plan. It starts from the revised plan and applies all 30 verified problems (P1–P30). Where I changed a judge's fix, the line says why. The rule for defaults is: the guideline value or today's behaviour is the default. The one exception is item 14, explained there. Branch `jarvis/laughing-carson-wq4ijq`, one PR.

**How each verified problem is handled**
- **P1 Per-commit gate:** tests are split. Each assertion lands in the commit that makes it true (Step 2, commit sequence).
- **P2 Alias specificity:** the alias lists are dropped. Markup and JS set explicit `.btn .btn-primary` / `.btn-secondary` / `.btn-ghost` classes. Legacy classes stay only as JS hooks, with no visual rules.
- **P3 permissions.css:** it imports the `utilities` and `motion` layers. e2e (o) checks both the hidden and the shown state of each row.
- **P4 and P12 Fog/Mist:** role rules and their test assertions are written per theme. Under `prefers-contrast`, workspace lines turn Steel, not Fog.
- **P5 and P26 Toast:** approval 9's default is now centred under the toolbar, inside the main column, max-width 560px with ellipsis. All toast strings are in the copy index, and e2e checks the toast's bounds.
  - I did not keep it inside `#panel-wrap` as suggested: it would vanish while the panel is collapsed, which is when slide toasts arrive.
- **P6 Console timing:** `launch.cjs` records console and load errors in the main process from window creation onward. A unit test resolves every `@import`/`url()`, and e2e checks CSSImportRules and FontFace status. The claim that the smoke spec catches these is dropped.
- **P7 Handler override:** `removeHandler` before `handle`. The permissions window is created once, guarded by a flag.
- **P8 Popover:** the 58px shift is instant, with no transition.
- **P9 Error codes:** a missing `code` means no fix button; `ipc.js` is not edited. The `var()` check accepts references that carry a fallback.
- **P10 Status tones:** achromatic plus one muted green is the default. The coloured inks are the alternative, filed as new literals needing approval.
- **P11 and P27 Send:** a Signal Blue circle with a white arrow always (approval 13). The label says what an empty Send does.
  - The judges' monitor icon is only an option: it conflicts with the guideline's "white arrow".
- **P13 Frame:** workspace `--frame: none`. The missing `inset` in `--shadow-subtle-2` is recorded as quirk 4. e2e asserts `box-shadow: none`.
- **P14 Role substitutions:** new approval item 14.
- **P15 Radii:** error block, banner and `pre` use 12px, and the radius test covers them.
- **P16 Onboarding radius:** the dialog is 16px. The Welcome Frost card is the only 24px feature card.
- **P17 Type mapping:** `--type-meta` maps to xs-21. `--type-help` uses −0.01em (documented). `--type-heading` and `--type-kbd` are relabelled.
- **P18 Provider chips:** they stay on the Chalk pane, outside the Frost card. Chips on a Frost card use Chalk with a Bone border.
- **P19 Dots and scrollbar:** a visible "Step n of 4", with decorative dots in `--icon`. The scrollbar thumb uses `--icon`.
- **P20 Serif guard:** it checks `--type-display` against the hero selector itself.
- **P21 Compact buttons:** line-height 1 gives 30px. The Settings budget is recomputed.
- **P22 Listen readiness:** `#panel[data-listen]`, new empty-state variants, an STT status code from `capture.js`, a macOS meeting-audio action, and onboarding copy.
- **P23 First run across two windows:** per-platform sequences, specified below.
  - The suggested cross-window e2e "topmost" check is wrong: `elementFromPoint` is per document. It becomes a unit test of the main-process branch plus manual QA.
- **P24 Onboarding → Settings:** onboarding is suspended and resumed. On steps with a body action, the body action is primary. Step 4's buttons are specified, and step 3 has a "Connected" state.
- **P25 Fix-button mapping:** explicit code table. needs-session and needs-speech are split, and an `action` suppresses the fix button.
- **P28 Approval mechanics:** every item has a default and a fallback. The hash encodes all 14 items, and "Copy my decisions" exports them. Two journey scenes are added.
- **P29 Settings primary:** the primary button is chosen by state (résumé empty or present, vault connected or not).
- **P30 publik:** an `ONSCREENLY_E2E_PUBLIK` hook renders the disclosure, the card and the Keys-tab block with no network.

### Decisions and approval items (what the user approves in the prototype; defaults in bold)

1. **CTA fill.** One token, `--accent-fill`.
   - **Exact `#3c83f6`:** white label 3.64:1. A known AA exception for the 14px/500 label, documented.
   - A: `#2c70de`, 4.69:1 (a new hex).
   - B: azure-crest `#0544a5`, 8.84:1.
2. **Opacity.**
   - **A: as today.** `--onscreenly-opacity` multiplies `#app` and all three scrims.
   - B: only the background fades, with a .80 alpha floor on surfaces that carry text.
   - C: workspace dialogs ignore opacity.
   - B and C depart from hard constraint 5.
3. **Opacity popover.** **Opens upward as one 36px row; `#app.opacity-open` padding goes from 82px to 58px, applied instantly.** Alternative: opens downward with no shift.
4. **Live dot inside `#stop-btn` plus an unread dot on Hide: yes.** Fallback: `#live-dot` stays in the toolbar before `#stt-status` and there is no unread dot. e2e (e) then drops its "inside" and unread assertions.
5. **"Smart assist" becomes "Assist".** Fallback: keep "Smart assist"; the copy scan and the empty-state and onboarding strings revert.
6. **The question shows as a quiet line** (2px rule, `--text-2`). Fallback: a neutral `.user-bubble` (`--bg-layer`, no blue). Screenshots only.
7. **Live speech in one place:** ghost text in the composer, and the You/Them caption line is removed. Fallback: a one-line "Them: …" caption above the action row in `--text-2`; e2e (j) asserts the caption.
8. **`#more-btn` hidden** (`.hidden`, kept in the DOM). Fallback: a visible gear in the composer row. The handle test is the same either way.
9. **Toast centred under the toolbar** (absolute in `#toolbar`, `top: calc(100% + 6px)`, max-width 560px, ellipsis, full text in `title`). Alternative: right of the toolbar, max-width 420px, flipping to `right: calc(100% + 8px)` with `placeSidebar()`'s screen check.
10. **Status tones.**
    - **Achromatic, plus one muted green for ok/live only** (overlay `#8fc4a3`, workspace `#3f6b4f`). Warn and danger show as `--text-strong` with an icon and a word, a bordered tag or a hairline callout, and no tint.
    - Alternative: coloured warn/danger inks (overlay `#d4b679`/`#e09a9a`, workspace `#7a5c1e`/`#a33a3a`) with 8–10% tints.
11. **Hero gradient.** **Linear `#0544a9` → `#022c70`.** Alternative: radial `#1e82e0` → `#1c38ea`, with the headline only on the band.
12. **Settings "Done".** **Neutral secondary.** Alternative: Signal Blue.
13. **Send at rest.**
    - **Signal Blue circle, white arrow-up, always** (guideline and today).
    - Alternative: neutral (`--bg-pressed`) until there is text; sub-option: a monitor icon when empty.
    - Either way, the empty-state `title`/`aria-label` reads "Assist · looks at your screen (⌘⇧↵)", and with text it reads "Send (↵)".
14. **AA role substitutions.**
    - **Captions, placeholders, eyebrows and timestamps use Steel instead of Fog; icon-only strokes use Steel instead of Mist.**
    - Alternative: decision 1's exact roles (Fog captions 4.27:1, Mist icon-only strokes 2.09:1), recorded as exceptions.
    - Why this item defaults away from the exact roles when the CTA does not: the CTA is the brand mark the user named twice. Mist fails even the 3:1 non-text minimum, so exact icon-only strokes would be near-invisible controls.

**Approval mechanics**
- The hash carries all 14 items: `#s=<scene>&bg=<desktop>&platform=mac|win11|win10|linux&op=60&a1=exact|a|b&a2=A|B|C&a3=up|down&a4=1|0…&a14=sub|exact`.
- A "Copy my decisions" button produces a text block such as `a1=exact a2=A …` plus one line per item, for the user to paste back.
- The choices are recorded in a `docs/design/README.md` "Decisions" table, which lists the tests each flipped item affects.

### Design system

**`renderer/css/tokens.css`** (layer `tokens`), in this order:
1. **The verbatim Cluely `:root` block**: all 87 declarations, in order, with the header comment `Source: https://styles.refero.design/style/72da35d5-1cfd-41a3-94f6-cb6b8c07a670 (Cluely)`. Neon and cyan-veil are declared and never referenced. Four source quirks are recorded here and in the README; in each, the token wins:
   - `--tracking-*` values are in px and near zero (only `-0.96px` = −0.012em at 80px is right). The roles use the em values from the guidelines; the px tokens stay unused.
   - The elevation prose names `#0544a9`, but `--shadow-subtle` uses `rgb(12,68,161)`. The CTA uses `var(--shadow-subtle)`.
   - `--radius-full: 110.25px` coexists with `--radius-pills: 9999px`. Pills use `--radius-pills`.
   - `--shadow-subtle-2`'s second layer has no `inset`, though the prose says it should. It is used only for the prototype's mockup frame.
2. **52 DTCG steps:** `--ts-<step>: <wt> <size>/<lh> <family>` plus `--ts-<step>-track`. For example `--ts-xs-21: 500 12px/1.33 var(--font-geist); --ts-xs-21-track: -.025em`.
3. **Structure tokens:**
   - `--main-w: 700px`, `--side-w: 300px` (a test keeps them equal to `MAIN_W`/`SIDE_W`)
   - `--panel-w: 624px`, `--toolbar-h: 36px`, `--control-h: 28px`, `--field-h: 34px`, `--btn-h: 34px`, `--btn-h-compact: 30px`
   - z-index, duration and easing tokens
4. **Literals taken from the guideline text:** `--gradient-hero: linear-gradient(180deg,#0544a9 0%,#022c70 100%)` and `--gradient-hero-alt: radial-gradient(120% 90% at 50% 0%,#1e82e0 0%,#1c38ea 100%)`.
5. **New literals pending approval** (a commented block mirrored in the README): `#8fc4a3` and `#3f6b4f` (ok), the alt-10 inks, `#2c70de` (alt 1).
6. **Theme-independent semantics:**
   - `--accent` = signal-blue; `--accent-fill` (approval 1); `--accent-press` = azure-crest; `--accent-hover-shadow` = `var(--shadow-subtle)`; `--on-accent` = chalk
   - `--focus-ring: 2px solid var(--color-signal-blue)`; `--focus-halo` = signal-blue 18%
   - `--scrim` = ink-black 45% plus `blur(8px)`; `--selection` = blue 22%
   - Derived values use only `color-mix()` with `var()` arguments, and only in this file.
7. **Type roles** (table below).
8. **`.theme-overlay`** (on `#app`) and **`.theme-workspace`** (on `#settings`, `#onboard`, `#consent`, `.perm-card`). Both declare an identical property set (a parity test checks this). Theme classes never go on `html`, `body` or the scrims, and themes never nest.

**Semantic tokens (dark overlay | light workspace)**

| Token | `.theme-overlay` | `.theme-workspace` |
|---|---|---|
| `color-scheme` | dark (scoped to `#app`) | light (scoped to the dialog) |
| `--bg-surface` | carbon 92% (98% under `prefers-contrast: more` / `prefers-reduced-transparency`) | Chalk |
| `--bg-tint` | chalk 4% | Frost |
| `--bg-layer` | chalk 7% | Vapor |
| `--bg-pressed` | chalk 10% | `color-mix(in srgb, vapor, steel 8%)` (Bone is never a fill) |
| `--bg-well` | ink-black 28% | Chalk |
| `--bg-popover` | slate 98% | Chalk |
| `--line` | bone 10% | Bone |
| `--line-strong` | bone 18% (24% under prefers-contrast) | Bone (**Steel** under prefers-contrast, 6.16:1) |
| `--line-on-tint` | bone 6% | Ash (secondary dividers inside Frost/Vapor only) |
| `--text-strong` | Chalk | Carbon |
| `--text-1` | Vapor (15.3:1) | Carbon (17.7:1) |
| `--text-nav` | Vapor | Slate (13.2:1) |
| `--text-2` | **Mist** (8.5:1; 6.8:1 composited over white) | **Steel** (6.16:1) |
| `--text-disabled` | **Steel** | **Fog** |
| `--text-answer` | Frost | Carbon |
| `--icon` (beside a label) | **Fog** (4.15:1) | **Mist** (decorative) |
| `--icon-solo` (icon-only) | **Fog** (≥3.33:1 over white) | **Steel** |
| `--scroll-thumb` | `var(--icon)` | `var(--icon)` |
| `--field-shadow` | `inset 0 2px 20px -1px` ink 30% | `var(--shadow-lg)` |
| `--frame` | `0 0 0 1px` ink 40%, `inset 0 1px 0` chalk 6% | `none` |
| `--selected-bg` / `--selected-line` | blue 14% / 50% | Frost / Signal Blue |
| `--ok` / `--ok-line` | `#8fc4a3` / ok 45% | `#3f6b4f` / ok 40% |
| `--warn`, `--danger` | `var(--text-strong)` (alt 10: inks) | `var(--text-strong)` (alt 10: inks) |
| `--warn-bg`, `--danger-bg` | transparent (alt: 10%) | transparent (alt: 8%) |
| `--warn-line`, `--danger-line` | `var(--line-strong)` (alt: 30%) | `var(--line-strong)` (alt: 35%) |

**Role rules per theme** (enforced by tests)
- Workspace: Fog appears only in `--text-disabled`, Mist only in `--icon`, and Steel in `--text-2` and `--icon-solo`.
- Overlay: Mist in `--text-2`; Fog in `--icon` and `--icon-solo`; Steel in `--text-disabled`.

**Workspace contrast**
- Carbon on Chalk/Frost/Vapor: 17.72 / 16.60 / 15.28.
- Slate: 13.16 / 12.33 / 11.35.
- Steel: 6.16 / 5.77 / 5.31.
- Fog: 4.27 on Chalk, so disabled text only.
- `#3f6b4f`: 6.13 on Chalk, 5.74 on Frost.
- Hero: Chalk on `#0544a9` is 8.73, Chalk on `#022c70` is 13.15, Frost on `#0544a9` is 8.18.
- Bone edges are 1.27:1, below 1.4.11's 3:1. Mitigations: visible labels, the inset field shadow, a focus border plus halo, and Steel lines under `prefers-contrast`.

**Type roles** (`:root`; Geist unless noted)

| Role | Source | Value | Used for |
|---|---|---|---|
| `--type-display` | 5xl-3 scaled | EB Garamond 500 48/1.02, −0.012em | the hero `#ob-title` only |
| `--type-heading` | guideline −0.025em at 28px (closest step 2xl-2 is −0.018em) | 500 28/1.25 | step titles, permissions title, publik balance |
| `--type-answer` | xl | 400 20/1.38, −0.025em | overlay answers |
| `--type-title` | xl-2 | 500 20/1.38, −0.025em | Settings and consent titles |
| `--type-lede` | base-9 | 400 16/1.38, −0.025em | recap `.small`, hero lede |
| `--type-title-sm` | base-4 | 500 16/1.38, −0.025em | empty-state title |
| `--type-body` | sm-8 | 400 14/1.43, −0.025em | composer, cards, dialog body, field values |
| `--type-strong-sm` | sm-6 | 500 14/1.43, −0.025em | row names, section headings |
| `--type-button` | sm-7 | 500 14/1, −0.025em | every button: full 10px 20px = 34px; compact 8px 16px = 30px |
| `--type-control` | sm-3 | 500 13/1.38, −0.025em | toolbar labels, action row, tabs, chips, sidebar rows |
| `--type-label` | xs-17 | 500 12/1.38, −0.025em | field labels |
| `--type-meta` | xs-21 | 500 12/1.33, −0.025em | hints, timestamps, toast, status, tags |
| `--type-help` | xs-15, tracking adjusted | 400 12/1.6, −0.01em (the step says 0; the guideline's body rule wins; documented) | help, notes, footer status (workspace only) |
| `--type-eyebrow` | xs-20 | 600 12/1.33, +0.15em, uppercase | eyebrows, THEM/YOU, card h3 |
| `--type-kbd` | non-DTCG role (xs-2 family) | ui-monospace 500 12/1, 0 | keycaps (⌘ ⇧ ↵ are not in Geist's latin range) |

Type rules:
- `font-family: var(--font-geist)` with `font-synthesis: none`.
- No italics. Tabular numerals on times, percentages, counters and the balance.
- No 10px text. The overlay uses weight 500 or more below 14px.

**Spacing.** Verbatim `--spacing-*`, `--element-gap` 8, `--card-padding` 24.
- Overlay: toolbar padding 4 and gap 2; icon–label gap 6; panel padding 14/16; block gap 10; card padding 12/14.
- Workspace: dialog padding 24; inner cards 16; field gap 8; 20 between groups.

**Radii.**
- `--radius-buttons` 4: buttons, action row, keycaps.
- `--radius-inputs` 8: inputs, composer, select, textarea only.
- `--radius-cards` 12: `.ai-card`, k-result, publik and whisper cards, icon tiles, popover, **error block, banner, `pre`**.
- `--radius-product-mockup` 16: panel, sidebar, Settings, onboarding, consent, permissions card.
- `--radius-feature-cards` 24: the Welcome Frost feature card only.
- `--radius-pills`: toolbar and its controls, chips, tags, toast, Send, dots.

**Elevation.**
- CTA and Send hover: `--accent-hover-shadow`.
- Fields: `--field-shadow`.
- Overlay containers: `--frame` ring.
- Workspace surfaces: Bone 1px border only, no shadow.
- Focus: halo. `--shadow-lg-2` stays unused. No outer shadow anywhere has a blur.

**Motion.**
- Durations: press 80, fast 120, base 180, slow 240.
- Loops: breathe 2400, shimmer 1400, caret 1000 `steps(1)`, spinner 800.
- Easing: `--ease-out` (.22,1,.36,1), `--ease-in` (.4,0,1,1), `--ease-std` (.2,0,0,1).
- Only enter animations (a dialog fades in and rises 4px over 180ms). Hiding is instant via `.hidden`. The popover shift is instant.

**Layers.**
- z-index: sidebar 0, panel 1, app 2, panel-chrome 4, float 5, settings 20, onboard 30, consent 40, toolbar/toast 50, popover 60.
- The scrims cover `left: var(--side-w); width: var(--main-w)` above `#app`. That gives the hybrid look: a light dialog over a dimmed dark overlay.

**Fonts.**
- `fonts.css` declares `'Geist'` (latin + latin-ext, weight 100–900) and `'EB Garamond'` (latin, 400–800).
- Unmodified woff2 files from `@fontsource-variable/*@5.3.0`, unicode-ranges copied from the package CSS, `font-display: swap`. No italics, and the fontsource CSS is not imported.

### Screens and states

#### Overlay (`#app.theme-overlay`)

**Toolbar**
- A 36px pill: `--bg-surface`, `--line` plus `--frame`, padding 4, about 400px wide.
- Order: grip (2×3 dots, "Drag to move") · `#stop-btn` · `#hide-btn` │ `.tb-opacity-wrap` · `#logo-btn` · `#tb-settings-btn` (circle-help) │ `#quit-btn`.
- Icon buttons: 28px with 15px icons in `--icon-solo`. Hover `--bg-layer`; pressed `--bg-pressed`. **Quit hover is neutral** (`--bg-pressed`, `--text-strong` icon).
- **`#stop-btn`:**
  - A 12px `.tb-lead` slot holds `.ic` and `#live-dot`.
  - Idle: "Start session". `.is-pending`: spinner and "Starting…", with `aria-busy`.
  - Active: "End session" with an 8px dot. Idle is `--ok` breathing; speaking is `--ok` plus a 3px `--ok-line` ring; error is a hollow 1.5px `--text-1` ring.
  - On hover the dot swaps for a square icon on `--bg-pressed`. No red.
- `#hide-btn` reads "Hide"/"Show" (`.tb-hide-label`) with a rotating chevron. `.has-unread` adds a 6px `--accent` dot.
- Popover: opens upward as a 200px row ("Opacity" label, slider, value in `--type-meta` tabular), `--bg-popover`, radius 12, `--frame`.
- Toast: as in approval 9. `--bg-popover`, `--line` plus `--frame`, pills, `--type-meta`, `role=status`, `aria-atomic`. A tone adds a 6px dot (ok only).

**Panel**
- `#panel.glass`: radius 16, padding 14/16.
- Flex chain `#app → #panel-wrap → #panel → #panel-columns → #panel-main`, each with `min-height: 0`.
- `#messages` is `flex: 0 1 auto` with `max-height: 50vh`. Everything else is `flex-shrink: 0`. The composer's 22px bottom margin goes.

**Empty state** (static `#empty-state` after `#messages`, hidden by `#messages:not(:empty) + #empty-state`). The variant comes from `#panel[data-setup]` and `#panel[data-listen=none|mic-only|ready]`, checked in this order:
- **Setup** (no answer provider): "Connect an AI provider to get answers" and `#empty-setup` "Open settings".
- **Transcription setup** (`data-listen=none`): "Answers work, but Onscreenly can't transcribe yet" / "Add a speech-to-text key or download a local model to hear the conversation." and `#empty-audio` "Open Audio settings", which calls `openSettings('transcription')`.
- **Ready:** "Ready when you are" / "Start a session to listen, or ask anything below." plus keycap rows, with `modKey` giving Ctrl on Windows and Linux:
  - `⌘ ↵` What should I say?
  - `⌘ ⇧ ↵` Assist
  - `⌘ H` Solve the coding problem on screen
  - `⌘ ⇧ /` Hide or show
- **Listening:** "Listening. The interviewer's question will appear below; press ↵ to answer."
- **Listening, mic only** (macOS with Meeting audio off): "Listening to your microphone only. Turn on Meeting audio in Settings › Audio to hear the other side."

**Answer group (`.response-group`)**
- Meta row:
  - The question line: `--type-control`, `--text-2`, 2px `--line-strong` left rule, clamped to 2 lines.
  - `.category-pill`: `--type-meta` on `--bg-layer`.
  - `.response-sep`: tabular, `margin-left: auto`.
- `.ai-text`: `--type-answer` in `--text-answer`. Strong is 500 `--text-strong`. `pre`: `--bg-well`, hairline, radius 12, `--type-kbd` at 13/1.5. Older answers turn `--text-2` over 240ms.
- **Thinking:** `::before` shows `attr(data-label)` with a 150ms delay and a shimmer; after 8s it adds "· still working". Labels by mode:
  - say: "Reading the conversation…"
  - assist and ask: "Looking at your screen…"
  - leetcode: "Reading the problem on screen…"
  - answerThis: "Drafting an answer…"
  - recap: "Summarising the conversation…"
  - résumé: "Analysing your résumé…"
  - fallback: "Thinking…"
- **Streaming:** progressive markdown and a 2px `--accent` caret.
- **Error** (`.is-error`, `role=alert`): a 1px `--danger-line` border, radius 12, no tint. A circle-alert icon and a "Couldn't answer" eyebrow in `--danger`; the body is `--type-body` `--text-1`. Partial text is kept. Fix buttons by `code`:

| code (main) | When | `.ai-fix` |
|---|---|---|
| `no-provider` | `!llm.ready`, not publik | Open settings → `openSettings('keys')` |
| (has `action`) | publik not ready, or card | **none**; the banner/card owns the CTA (unchanged) |
| `needs-resume` | llm-runner.js:38 | Open Profile |
| `needs-session` | transcriptRequired, `!capturing` | Start session (clicks `#stop-btn` only if it is not `.active`) |
| `needs-speech` | transcriptRequired, capturing, nothing transcribed | Open Audio settings when `data-listen=none`, otherwise none |
| `provider-failed` / `interrupted` | stream or HTTP failure | Try again (re-runs `state.lastRun`) |
| none | `ipc.js` too-long, anything else | none |

- **Cards:** `.ai-card` uses `--bg-tint` plus `--line`, radius 12. The h3 is `--type-eyebrow` `--text-2`.
- **Card actions:** "Copy" and "Save as Markdown…" (exact), 26px, radius 4.
- **Sources:** "From your notes" plus `.ai-source` pill chips.

**Action row**
- No `.sep`. Three `.act` buttons, 28px, radius 4, `--type-control`. `.act-primary` adds `--bg-tint` plus `--line`.
- `#stt-status` moves here (`margin-left: auto`, a 6px dot). Labels:
  - "Starting…"
  - "Listening" (ok)
  - "Stopping…"
  - "Transcription error" (alert icon)
  - **"No speech-to-text"** (alert icon), shown when capture is active and `data-listen=none`, or on `status.code === 'stt-unavailable'`
- While busy, the buttons drop to .5 with `aria-disabled`.

**Composer**
- Radius 8, `--bg-well`, `--line-strong`, `--field-shadow`, padding 12. `:focus-within` gives a `--selected-line` border plus the halo.
- Placeholder: "Ask about your screen or the conversation".
- Bottom row: `#smart-toggle` "Smart" and `#history-btn` "Transcript" as pills; `#more-btn.hidden`; spacer; `#send-btn` as in approval 13. `.ready` adds a 3px `--selected-bg` ring. `.busy` shows a spinner.
- Speech states:
  - `.stt-filling`/`.stt-accumulating`: `--ok-line` border (accumulating breathes).
  - `.stt-ready`: `--ok-line` border plus the hint "Ready · ↵ to answer" in **`--text-2`**.
  - `.stt-dimmed`: .55.
  - Ghost interim: upright `--text-2`, one line.

**Banner (`#onscreenly-status`)**
- Radius 12: icon, message, optional 26px secondary action, dismiss `x`.
- `data-tone`: info is `role=status`; warn and error use their line tokens, and error is `role=alert`. Timers 11s, or 30s with an action.
- The macOS meeting-audio banner gains "Open Audio settings".

**Toast copy**
- Copied
- Couldn't copy
- Saved resume-analysis.md
- Couldn't save the file
- Transcript cleared
- Nothing to restore
- Question restored
- Cleared · ⌘Z to undo
- No question to answer
- Slide 3 · <caption>: the caption is cut to 60 characters, with the full text in `title`

**Sidebar**
- 300px, radius 16, `--frame`.
- Header: "Transcript" plus a close `x` ("Close transcript").
- Rows: THEM in `--text-1`, YOU in `--text-2`. Placeholder: "Nothing yet. Start a session and the conversation shows up here."
- "Clear transcript" is a ghost button with two-step confirmation ("Click again to clear" for 3s). No red.
- The closed sidebar is click-through.

**Collapse.** `#panel-wrap.collapsed`, `#hide-btn.collapsed`, label "Show". The toolbar, live dot, unread dot and toast stay visible.

#### Workspace (`.ws-dialog.theme-workspace`)

**Frame.** Chalk, 1px Bone, radius 16, `--frame: none`, `overflow: hidden`, flex column. Workspace controls in `controls.css` (explicit classes only):
- **`.btn-primary`:** `--accent-fill`, `--on-accent`, `--type-button`, radius 4, 10px 20px (34px). `.compact` is 8px 16px (30px).
  - Hover: `--accent-hover-shadow`. Pressed: `--accent-press`. Disabled: `--bg-layer` with `--text-disabled`.
- **`.btn-secondary`:** Chalk, Bone, `--text-nav`. Hover `--bg-layer`; pressed `--bg-pressed`.
- **`.btn-ghost`:** `--text-2`.
- **`.btn-danger`:** a secondary with a trash icon and `--danger` text.
- **`.chip`:** 28px. Rest: Vapor with `--text-nav`. Selected: Frost, 1px Signal Blue, `aria-pressed`. Inside a Frost `.s-card`: Chalk plus Bone at rest, Chalk plus Signal Blue when selected.
- **`.tag`:** 24px pill, Chalk plus Bone, `--type-meta`, with an icon or dot.
- **`.field`:** 34px, radius 8, padding 0 12, Bone, `--field-shadow`. Focus: `--accent` border plus halo. `aria-invalid`: `--danger` border plus an alert icon in the label.
- **`.kbd`:** 22px, Vapor plus Bone, radius 4.

**Settings** (520px; max-height `calc(100vh − 48px)` = 552px)
- **Budget:** header 20 + 30 + 12 = 62; tabs 41; footer 41; border 2. That leaves a **406px** pane.
- **Header:** `<h2 id="s-title">Settings</h2>` in `--type-title`, plus `#s-close` "Done" as a compact `.btn-secondary`.
- **Tabs:** one `role=tablist` row with the labels "API keys · Profile · Knowledge · Audio · Style · Appearance".
  - The `data-tab` order is unchanged.
  - Rest is Steel, hover Slate, `.on` is Carbon with a 2px Signal Blue underline.
- **Pane** (padding 20 24):
  - Group headings get `.s-eyebrow`; field labels are Slate in a 96px column.
  - At most one Frost `.s-card` per pane:
    - Keys: the key fields only, with `#provider-seg` above it on Chalk.
    - Profile: the résumé block.
    - Knowledge: the vault block.
    - Audio: `.whisper-card`.
    - Style: `.s-hint-block`.
- **Footer `.s-foot`:** `#s-status` moves here (`role=status`, `--type-help` Steel). `.is-error`: Carbon plus circle-alert. `.is-ok`: a check in `--ok`.
- **Which button is primary, by state** (one per pane):
  - Profile: `#resume-import` while `#resume-text` is empty, `#resume-analyse` once it has text.
  - Knowledge: `#vault-pick` only while no vault is set. Afterwards it is a secondary "Change folder…" plus a "`<n>` notes" `.tag`.
  - Audio: Download for the local model, when `data-listen=none`.
  - Keys: `#publik-link` when publik is shown.
- **Unchanged from the previous plan:**
  - Deepgram moves to Audio and drops `data-key-for`.
  - The Auto chain reads deepgram → openai → groq → gemini.
  - Key-storage sentence: "Stored on this computer, encrypted when your system allows it, and sent only to the provider you pick."

**Onboarding** (520px, radius 16, max-height `calc(100vh − 32px)`, `#ob-body` scrolls)
- **Markup** (ids kept):
  - `.ob-head`: `#ob-icon`, `#ob-eyebrow`, `#ob-title` (`h2`), `#ob-lede`.
  - Then `#ob-body` and `#ob-buttons`.
  - Footer: [Skip] [`#ob-count` "Step n of 4" in `--type-meta` Steel plus decorative `#ob-dots` (`aria-hidden`; inactive dots 6px `--icon`, current an 18×6 Signal Blue pill)] [Back] [Next].
- **One blue button per view.** On steps whose body has a primary action, Next is `.btn-secondary`; otherwise Next is `.btn-primary`. Skip and Back are ghost.

Steps and their final copy:
1. **Welcome** (`#onboard.is-hero`).
   - Band: `var(--gradient-hero)`, padding 32 28 28, top corners clipped by the dialog's 16px radius. Chalk logo 28px.
   - Title "Welcome to Onscreenly" in `--type-display`. Lede "A quiet AI copilot that floats over your screen." in Frost.
   - Feature card (Frost, radius 24, padding 16 20, margin 20 28 0), three rows:
     - eye: "Sees your screen when you ask"
     - mic, macOS: "Hears you once you start a session, and the other side when Meeting audio is on"
     - mic, other platforms: "Hears the conversation once you start a session"
     - wand: "Suggests what to say next"
   - Caveat in Steel: "It tries to stay out of screen shares, but that is best effort, so check before you rely on it."
   - About 480px tall.
2. **PERMISSIONS: "Let Onscreenly see and hear"** (shield-check tile).
   - Rows carry an "Allowed" tag (bordered, check, `--ok`) or "Not yet" (neutral) plus an "Open … settings" secondary button.
   - When both are allowed, it is confirmation-only: title "Microphone and screen recording are on", buttons hidden.
   - macOS adds: "Meeting audio (the other side of a call) is off by default on macOS, because the system shows a recording indicator while it runs. Turn it on in Settings › Audio."
   - Windows 10: microphone only, plus "Screen capture needs no permission on Windows 10."
   - Linux: no buttons, plus "Linux doesn't ask for these permissions. If your desktop blocks screen capture, allow it in its privacy settings."
3. **AI PROVIDER: "Connect an AI provider"** (key-round).
   - Body: "Answers come from the provider you choose, with your own API key. Listening needs speech-to-text too: a Deepgram, OpenAI, Groq or Gemini key, or a free local model you download in Settings › Audio."
   - Not ready: **"Open Settings" is primary** and **suspends** onboarding (below).
   - Ready (`providerLooksReady()`): a "Connected · <Provider>" tag and a "Change provider" secondary; Next is primary.
4. **SHORTCUTS: "You're all set"** (keyboard).
   - Keycap table.
   - Secondary buttons "Add your résumé" → `finishOnboard(); openSettings('profile')` and "Connect Obsidian notes" → `finishOnboard(); openSettings('knowledge')`.
   - Line: "Reopen this guide from the help button in the toolbar."
   - The last button, "Get started", only closes.

**Suspend and resume** (when Settings is opened from step 3 or from the publik decline)
- Hide `#onboard-scrim` and set `obResume = OB_STEPS.length − 1`.
- A single `MutationObserver` on `#settings-scrim`'s `class` reshows onboarding at "You're all set" once Settings hides after a successful save.
- `closeSettings` stays byte-identical.
- The publik splice at index 2 still works.
- Before `showOnboard()`, boot waits for `document.fonts.load('500 48px "EB Garamond"')`, raced against 300ms.

**publik disclosure (`#onboard.dialog`)**
- Wallet tile; `--type-heading` title; "Cost." and "Where your prompts go." in Carbon 500.
- `.ob-fine` in Steel, with the terms link in Slate and a Signal Blue underline.
- Accept and decline are **equal `.btn-secondary`**. Next is hidden, as today. Main's copy is kept.

**publik card (`#onboard.card`)**
- Circle-check tile; `.publik-card-balance` in `--type-heading` tabular on a Frost band; why-copy in Slate.
- The `.ob-cta` primary button gets `btn btn-primary`; "Later" is secondary. It ignores Escape.

**Consent**
- 420px, padding 24, shield-check tile. Title in `--type-title` ("…wants to control Onscreenly."); body in Slate.
- Actions: "Don't allow" `.btn-secondary` (focused first) and "Allow" `.btn-primary`.

**Permissions window** (500×540)
- **Card:** `.perm-card.theme-workspace`, 484px, Chalk, Bone, radius 16, no shadow or blur, padding 28 28 24. The drag region is kept; rows and actions are no-drag.
- **Rows:** one Frost card (radius 12, Bone) with mic and screen rows and an Ash divider. Each row has an 18px `--icon`, the name in `--type-strong-sm` and the status in Steel ("Allowed", "Not requested yet", "Not allowed yet"). On the right, either an "Allowed" `.tag` or an "Open settings" compact secondary; the other one gets `.hidden`.
- **macOS (first run gate):** logo mark tile; eyebrow "WELCOME TO ONSCREENLY"; title "Allow microphone and screen recording"; description "Onscreenly needs to hear the conversation and see your screen to answer."; note "After you switch a permission on, click Check again. macOS may need Onscreenly to restart before screen recording works."; actions Quit (ghost) · "Check again" / "Checking…" · "Continue" (disabled until both are allowed).
- **Windows (returning user, mic off):** lock tile; eyebrow "BEFORE YOU START"; title "Allow microphone access"; description "Onscreenly needs your microphone to hear the conversation. Screen capture needs no permission on Windows."; the screen row is hidden; note "After you switch the microphone on, click Check again."; Continue is always enabled and reads "Continue without microphone" while the mic is off.

**First run, by platform**
- **macOS:** OS mic prompt → OS screen prompt → (not all granted) the permissions gate as the welcome screen → Continue → overlay plus onboarding. Step 2 is then confirmation-only.
- **Windows:**
  - First run (`onboarded: false`): **no separate window**; onboarding step 2 is the permission UI.
  - Returning user with the mic denied: the window opens **`setAlwaysOnTop(true, 'screen-saver')`**, so the overlay cannot cover it. `permissions:continue` on win32 closes it through the idempotent `launchApp()`.
  - I rejected placing it below the 600px band: a 728px-tall work area has only 114px left.
- **Linux:** no gate.

### Accessibility and motion

**Focus**
- Delete `button:focus{outline:none}`; add `:focus-visible { outline: var(--focus-ring); outline-offset: 2px }` (−2px on tabs). Fields show focus with border plus halo.
- `safeFocus` (`renderer/js/a11y.js`) focuses only when `document.hasFocus()`.

**ARIA**
- Toolbar `role=group`. `aria-expanded` and `aria-controls` on hide, opacity and history; `aria-pressed` on smart and on chips; sliders get `aria-label` and `aria-valuetext`.
- `#messages`: `role=log`, `aria-live=polite`, with `aria-busy` while answering.
- `role=status` on `#stt-status`, `#s-status`, `#toast` and `#ob-count`; `role=alert` on errors.
- `#settings`: dialog with tablist and roving tabindex. `#onboard`: dialog. `#consent`: alertdialog.
- icons.js emits `aria-hidden="true" focusable="false"`. Add a `.sr-only` utility.

**Modals.** Focus trap in Settings, onboarding and consent, with focus returning to the opener. No `inert`.

**Escape: one layer per press**
1. Consent (capture phase, `stopPropagation`, deny).
2. Onboarding (capture phase; ignored on the publik card).
3. Settings (the tested line, verbatim).
4. Composer: clear, with `preventDefault`.
5. Popover.
6. Sidebar.

Steps 5 and 6 are guarded by `defaultPrevented` and by whether a scrim is open.

**System settings** (last layer, `motion`, no `!important`)
- Reduced motion: every duration .01ms with one iteration; static dot, caret and shimmer.
- `prefers-contrast: more`: overlay alpha .98 and lines 24%; workspace lines Steel.
- `forced-colors`: CanvasText borders, Highlight focus.
- `prefers-reduced-transparency`: alpha .98.

**Targets.** Overlay 28px or more (24px for the sidebar close). Workspace buttons 30px or more; fields 34px.

**Contrast.** Informative text is always `--text-2` or stronger. The only known exception is the default CTA (approval 1), plus item 14's alternative if the user picks it.

### Step 1: interactive prototype

**File and fonts**
- One self-contained HTML file, at most about 450KB, with no network requests.
- Fonts are base64 copies of the unmodified fontsource woff2 files: Geist latin + latin-ext and EB Garamond latin, about 90KB raw.
- A badge reads "Fonts: Geist ✓ EB Garamond ✓", taken from `document.fonts`. If the artifact viewer blocks data fonts, the badge says so and the ui-diff screenshots become the reference.

**CSS and markup**
- The CSS is the production files concatenated in layer order with `/* === css/<file>.css === */` headers. Only `fonts.css` differs (data URLs), plus a final `@layer proto`. After approval it is split back into files verbatim.
- The markup is the target `index.html` body and the target permissions markup with every real id. A scenario engine toggles the same classes the app toggles.

**Stages**
- A: the 1300×600 overlay window, scaled to fit with a 1:1 toggle; 300/700/300 hatched strips; bounds toggle; a red line at y=600.
- B: the 500×540 permissions window.

**Scenes**
1. Live call (dark overlay, streaming answer, transcript open).
2. Hybrid: light Settings over the live call, on any tab, including a save error raised from another tab.
3. First run · macOS: permissions gate → Welcome hero → confirmation-only step 2 → steps 3–4.
4. First run · Windows 11, Windows 10 and Linux variants; returning Windows user with the mic denied.
5. Onboarding → Open Settings → Done → resumes at "You're all set".
6. publik disclosure and card.
7. Consent over Settings.
8. Permissions window: none / mic only / both.
9. **Interview prep:** Settings › Profile with a résumé imported → Analyse → cards stream → Copy / Save as Markdown….
10. **Meeting with notes:** an answer with `.ai-source` chips plus the slide toast.
11. publik with no speech-to-text: transcription-setup empty state, then "No speech-to-text" after Start.
12. macOS with Meeting audio off: the mic-only listening variant plus a banner with an action.

**Control rail**
- Approval panel: 14 items with live toggles and their fallbacks; a "what changed vs today" list; "Copy my decisions".
- Platform switch; opacity 20–100 on the real variable.
- Desktop backdrops (Zoom, white Doc, VS Code dark, busy gradient, white, black).
- States:
  - session: off / pending / listening / speaking / error / no-STT
  - every empty-state variant
  - thinking per mode, streaming, done, older, recap, code, cards, sources
  - error per code (including publik with `action`, and the no-code case), interrupted
  - every composer state
  - banner tones; every toast string, including the longest slide caption
  - sidebar right / left / clear-confirm; collapsed plus unread
- Accessibility: reduced motion, increased contrast, forced colours, focus demo.

**Sheets**
- Token sheet: the 87 verbatim tokens; the 52-step specimen; both semantic columns side by side; the mockup frame using `--shadow-subtle-2`.
- Live contrast matrix: workspace pairs on Chalk, Frost and Vapor; overlay pairs composited over white and black at the current opacity; hero pairs; the CTA under each approval-1 option; item 14 both ways.
- Neon and cyan-veil appear only here, labelled "decorative, not used".
- Component sheet: every control in both themes, at rest, hover, pressed, focus and disabled, including Send empty and with text.

**Interactions.** Start/End session with a scripted call feeding the sidebar and ghost text; Enter → thinking → stream; shortcuts; Hide with the unread dot; popover; tab keyboard; the full Escape order and Tab trapping. Hash deep links per approval mechanics.

**Publishing**
- Load the artifact-design skill. Publish as a **private** claude.ai Artifact and give the user the link.
- After approval, commit the identical file as `docs/design/prototype.html` with `docs/design/README.md`. The README holds:
  - the decisions table
  - token provenance and the 4 quirks
  - the px/em note and the `--type-help` tracking departure
  - the new-literal list
  - the contrast statement and exceptions
  - the hybrid rationale

### Step 2: implementation

**New files**
- `renderer/css/{fonts,tokens,base,layout,controls,overlay,workspace,utilities,motion}.css`.
- `renderer/permissions.css`: `@layer fonts, tokens, base, controls, utilities, motion;` plus `@import url('css/x.css') layer(x);` for those six files.
- `renderer/fonts/geist-latin-wght-normal.woff2`, `geist-latin-ext-wght-normal.woff2`, `eb-garamond-latin-wght-normal.woff2`, `OFL-Geist.txt`, `OFL-EBGaramond.txt`.
- `renderer/js/a11y.js` (`safeFocus`, `trapFocus`).
- `scripts/vendor-fonts.cjs` (`--check` compares bytes) and `scripts/ui-diff.cjs`.
- Tests: `test/renderer/{ui-contract,design-system,icons}.test.js`, `test/build/fonts.test.js`, `test/platform/permission-gate.test.js`.
- e2e: `e2e/{ui,themes,screens,onboarding}.spec.js`.
- `docs/design/*`.

**CSS architecture**
- `renderer/styles.css` holds only `@layer fonts, tokens, base, layout, controls, overlay, workspace, utilities, motion;` and the `@import` lines.
- `.hidden` sits in `utilities`, so every `!important` goes.
- `#app` and the scrims keep `opacity: var(--onscreenly-opacity, 1)`.
- `layout.css`: `#app { pointer-events: none }`, and `pointer-events: auto` on exactly `#toolbar, #panel-wrap, #transcript-sidebar, #settings-scrim, #onboard-scrim, #consent-scrim`. `overlay.css` then sets `.transcript-sidebar:not(.open) { pointer-events: none }`, which wins by layer order.
- Theme classes are static markup.
- Removed:
  - dead rules
  - the old variables
  - the duplicate tab and button blocks
  - non-scrim `backdrop-filter`
  - every literal outside `tokens.css`
  - all descendant alias selectors

**JS changes** (ids never renamed; protected lines untouched)
- **core.js:** export `modKey`, `kbd()`, `setSessionPending`. Send uses arrow-up and its labels per approval 13; help uses circle-help.
- **chat.js:** progressive markdown (one render per animation frame and at most every 50ms; a selection guard; plain text above 20KB; cards only at finalize). `setBusy` sets `aria-busy`. `showToast(msg, ms, tone)` appends to `#toolbar`, ellipsises and sets `title`. `state.lastRun`.
- **events.js:**
  - `llm:start` stores `dataset.label` from `mode` and sets the unread dot.
  - `llm:error` keeps partial text and maps `code` with the table above: no `action` → `.ai-fix`; `action` → the existing banner or `showPublikCard()`.
  - `status` uses `code === 'stt-unavailable'` → STT error state plus an "Open Audio settings" action.
  - Delete `interimEl` and its export; keep one `startMic()`.
- **toolbar.js** (same commit as the `interimEl` removal):
  - drop the `interimEl` import and lines 119–122
  - pending state around `captureToggle`
  - ARIA, unread clear, focus return, two-step clear
  - the instant `opacity-open` shift
- **composer.js:** remove the "Press Enter to answer" toast; Escape `preventDefault`; `aria-pressed`; new toast copy.
- **transcript.js:** labels, placeholder, icon, `aria-expanded`. Export `sideFits()` for approval 9's alternative.
- **settings-form.js:** `providerLooksReady()`; `listenReadiness(settings, whisperOverview)` → `none` | `mic-only` | `ready`:
  - local: the chosen model is downloaded and the runtime is available
  - auto: a deepgram, openai, groq or gemini key
  - named provider: its key
  - custom: key plus `baseUrl` with `sttProvider: 'custom'`
  - `mic-only`: macOS with `!meetingAudio`
  - Plus the Auto-chain fix.
- **settings-save.js:** delete `showExample`; set `#s-status` `.is-error`/`.is-ok`; set `#panel[data-setup]` and `[data-listen]`.
- **settings-panel.js:** `selectTab(name)` (pure DOM); `openSettings(tab)` with a `typeof tab === 'string'` guard; roving keys and trap after the verbatim lines. The `#more-btn` listener stays.
- **profile-settings.js / knowledge-settings.js:** move `btn-primary` by state, add the vault `.tag`.
- **boot.js:**
  - hints via `modKey`, no placeholder override; Windows 10 and Linux flags
  - `whisperModels()` fetched before `data-listen` is computed (unknown counts as ready, so there are no false alarms)
  - the bounded Garamond wait
- **onboarding.js:**
  - the hero flag, eyebrow, lede, tiles, `#ob-count`
  - `renderOnboard()` adds `btn` classes, keeping `ob-cta`
  - step-2 confirmation state, step-3 ready state, suspend/resume observer, step-4 buttons
  - capture-phase Escape, `safeFocus('#ob-next')`
  - `publikStep`, `publikCardStep`, `showPublikCard`, `publikCardSeen` kept
- **consent.js:** capture-phase Escape, trap, `safeFocus`.
- **window-behaviour.js:** the selector and drag code unchanged; guarded popover and sidebar Escape branches after the tested line.
- **audio.js:** **one line**: the meeting-audio `showStatus` gains an "Open Audio settings" button. The `micGen`/`startMic`/`stopMic` lines and both `AudioWorkletNode` lines are untouched.
- **permissions.js (renderer):** icons, platform copy, tag/button `.hidden`, "Check again" / "Checking…", Continue label.

**Main process** (allowed edits)
- `app/main/llm-runner.js`: `mode` on `llm:start`; `code` on its `llm:error`s, with needs-session/needs-speech split on `state.capturing`; speech-error copy.
- `src/llm/llm.js:558`: ``Add your ${normalizeProviderName(provider)} API key in Settings › API keys.``; `test/llm/llm.test.js:262` becomes `/Add your DeepSeek API key/`.
- `src/integrations/applink-state.js`: "control Onscreenly."; `applink.test.js:122` and `:137` updated.
- `app/main/capture.js`: the `status` gains `code: 'stt-unavailable'`. Copy: "No speech-to-text is set up. Add a Deepgram, OpenAI, Groq or Gemini key, or download a local model, in Settings › Audio. Screen answers still work."
- `app/main/permissions.js`:
  - a pure function `permissionGatePlan({platform, onboarded, allGranted})`
  - on win32, `setAlwaysOnTop(true, 'screen-saver')`, and `permissions:continue` closes the window regardless of the mic
- `app/main/index.js`: uses that plan (no Windows gate on first run).
- `ipc.js` is not edited; its too-long error has no code, so no fix button.

**Fonts and licences**
- `npm i -D --save-exact @fontsource-variable/geist@5.3.0 @fontsource-variable/eb-garamond@5.3.0`. `vendor-fonts.cjs` copies the files and each `LICENSE`.
- `font-src 'self'` added to both CSPs.
- NOTICE gains:
  - Geist (SIL OFL 1.1, `renderer/fonts/OFL-Geist.txt`)
  - EB Garamond (SIL OFL 1.1, `renderer/fonts/OFL-EBGaramond.txt`)
  - "Lucide icons (renderer/icons.js): ISC"; the icons.js header changes from MIT to ISC
- `.gitattributes`: `*.woff2 binary`.

**Icons.** Add to icons.js from lucide-static 0.468: arrow-up, arrow-right, check, circle-help, circle-check, circle-alert, triangle-alert, info, grip-vertical, key-round, keyboard, lock, mic, shield-check, wallet, file-text, book-open, eye, monitor, trash-2, square.

**Copy rewrite index**
- "Smart assist" → "Assist"; "Transcription history" → "Transcript"; "Clear History" → "Clear transcript"; "Check Again" → "Check again"; "Continue →" → "Continue"; "Granted" → "Allowed"; ⏎ → ↵.
- Plus the toast list, STT labels, error copy, empty-state, onboarding and permissions copy above, tab labels and the key-storage sentence.
- No new code or comment may use the publik copy words that `test/integrations/publik-copy.test.js` forbids.

**Must stay byte-identical**
- `<title>Onscreenly</title>` and `<title>Onscreenly — Permissions</title>`.
- `data-provider="publik" id="provider-publik" class="hidden">publik API <span class="s-default-badge">default</span>`.
- The `#publik-link`, `#publik-why-summary` and `#publik-why-text` markup.
- The `closeSettings` body and its three listener lines.
- The `micGen`/`startMic`/`stopMic` code and both `AudioWorkletNode('onscreenly-audio-processor')` lines.
- The tab order; "Copy", "Save as Markdown…", the `.k-result-title` text; every e2e and smoke-quit id; the module-load handles.

**Commit sequence.** After each commit run `npm run check`, `xvfb-run -a npm run test:e2e` and `xvfb-run -a npx electron scripts/smoke-quit.cjs`. Each assertion lands in the commit that makes it true.

1. **Docs.** `docs/design/prototype.html` and `README.md`.
   - README `## Install` gains: "The repository is private: the Releases page and its downloads are visible to collaborators only. Ask the owner for access, or build from source."
   - README line 140: "Build-provenance attestations are skipped while the repository is private."
   - The same changes go into `docs/install.md` lines 3 and 74.
2. **Guards that hold today:**
   - `ui-contract`: unique static ids (allowlist `onscreenly-status`, `toast`, `ob-publik-terms`); module-load handles plus `#more-btn`; tab order; three `.act` and one `.act-primary`; the `closest()` id set ⊇ the CSS pointer-events ids ∪ {`#transcript-sidebar` via `.open`}; `--main-w`/`--side-w` (searched in `styles.css` and `css/*.css`) equal `MAIN_W`/`SIDE_W`.
   - `icons.test`.
3. **Fonts:** files, `fonts.css` imported at the top of today's `styles.css`, CSP, NOTICE, `fonts.test`, plus the ui-contract CSP assertion.
4. **`tokens.css`** (imported) and `design-system` part 1: verbatim block, DTCG steps, theme parity, per-theme role rules, contrast.
5. **Layer split plus dark overlay restyle and markup.**
   - Adds: `design-system` part 2 (no literals, no `!important`, no italics, `backdrop-filter` only on scrims, `styles.css` only `@layer`/`@import`, no-drop-shadow allowlist, radius rules, `@import` resolution), the six-id equality and sidebar layer rule, `#app.theme-overlay`.
   - The permissions inline style is allowlisted.
6. **Light workspace restyle and markup:** explicit `btn` classes, Settings `h2` and `.s-card`/`.s-foot`, onboarding head and footer. Adds the dialog theme-placement assertions.
7. **Icons replace emoji.** Adds the emoji scan.
8. **Answer states:** `llm-runner` `mode`/`code`, `llm.js` and its test.
9. **Listening and feedback:** events and toolbar together; listen readiness; `capture.js` code; audio.js action; the ⏎ and "Clear History" scans; toast copy.
10. **Settings behaviour:** tabs, footer status, primary by state, Deepgram field.
11. **Onboarding and consent behaviour:** hero, Garamond wait, step states, suspend/resume, Escape, trap; applink copy and test.
12. **Permissions window (light):** inline-style rewrite, `permissions.css`, icons, copy, main win32 changes plus `permission-gate.test`. The permissions allowlist goes; adds the permissions-structure assertions and the "Check Again" scan.
13. Escape chain, motion, contrast, forced colours, the remaining ARIA.
14. **New e2e:** specs, helpers, the `launch.cjs` hooks, ui-diff, CI screenshot upload.
15. **Docs:** README keyboard table and line 207 pointing to `docs/design/`; `qa-checklist.md`; `security-roadmap.md`; `docs/design/screens/`.

### Verification

**Unit (`npm run check`)**
- **Existing tests:** settings-close, llm-start, renderer-mic-start, publik-cta, publik-copy (now also scans `a11y.js`), branding, ipc-policy, windows-support. Only `llm.test.js:262` and `applink.test.js:122/137` change.
- **`ui-contract`** (staged as above):
  - every theme placement; no nested themes
  - `permissions.html` keeps an inline `<style>`, links only `permissions.css`, and loads icons.js before permissions.js
  - `controls.css` selectors are only `.btn*`, `.chip`, `.tag`, `.field`, `.kbd` and their states
- **`design-system`:**
  - `var()` is defined or carries a fallback (`--onscreenly-opacity`)
  - box-shadows come from the allowlist (`none`, `--frame`, `--field-shadow`, `--accent-hover-shadow`, halo), and none has an outer blur
  - `border-radius` only via `--radius-*`; cards, dialogs, `#onscreenly-status`, `.is-error` and `pre` use 12, 16 or 24
  - `var(--type-display)` appears only in `#onboard.is-hero #ob-title`; `--ts-5xl-3` is never referenced outside `tokens.css`; `--font-eb-garamond` appears outside the verbatim block only in those two definitions
  - `--gradient-hero` is referenced only in `#onboard.is-hero .ob-head`
  - neon and cyan-veil are never referenced
  - contrast:
    - workspace `--text-1`, `--text-nav`, `--text-2` ≥4.5 on Chalk, Frost and Vapor
    - `--icon-solo` ≥3 in both themes
    - focus ring ≥3 on Chalk and Carbon
    - `--ok` ≥4.5 on its surface
    - overlay `--text-2` ≥4.5 composited over white and black
    - hero text ≥4.5 on both stops
    - CTA ≥4.5, or exactly 3.64 together with the README exception entry
- **`fonts.test`:** wOF2 magic; every `@import` and `url()` in `styles.css`, `permissions.css` and `css/*.css` resolves under `renderer/`; no http or data fonts; only the declared faces; OFL files and NOTICE entries; under 200KB; byte-equal to `node_modules`; builder globs cover them.
- **`permission-gate.test`:** the plan for darwin, win32 and linux × onboarded × granted.
- **`icons.test`:** every icon name used exists.

**e2e (`xvfb-run -a npm run test:e2e`)**
- **Setup:** the 4 existing specs pass unchanged.
  - `launch.cjs` attaches `console-message` (error level) and `did-fail-load` to every window at `browser-window-created`, writing to `<profile>/console.log`.
  - Helpers assert that file is empty at teardown (this catches CSP, font and `@import` failures during load).
  - Helpers gain `{firstChunkDelayMs, chunkDelayMs, status}` and `env` options.
- **Hooks:**
  - `ONSCREENLY_E2E_PERMISSIONS_WINDOW=1` creates the window once, on the main window's first `did-finish-load`.
  - `ONSCREENLY_E2E_PUBLIK=disclosure|card` sets `available: true` and stubs `provision`/`fetchWallet` on the module object (inject `fetchImpl` if callers destructure).
  - Overrides use `ipcMain.removeHandler('permissions:check')` before `handle`.
- **`ui.spec`:**
  - (a) Fonts: `fonts.load('500 13px Geist').length > 0`; Geist FontFace status `loaded`; every `CSSImportRule.styleSheet.cssRules.length > 0`.
  - (b) Empty states: setup, ready, **transcription-setup with the mock custom provider**.
  - (c) Thinking label, then progressive list items.
  - (d) Error fixes:
    - Recap when not capturing shows "Start session".
    - With `capture:state` active, Recap shows no "Start session".
    - Status 500 shows "Try again", which re-sends.
    - A too-long question shows no fix button.
  - (e) Live dot in `#stop-btn`; collapse; unread dot.
  - (f) Opacity sync; popover inside y ≥ 0 right after opening; Escape returns focus.
  - (g) Layout guard: 20 answers + banner + popover keep the composer bottom ≤600 and Send topmost; closed sidebar `pointer-events: none`, open `auto`; an 80-character `slides:update` toast stays within x 300–1000 and its cap.
  - (h) Escape precedence.
  - (i) Keyboard: Signal Blue outline; arrow keys move tabs without saving; Send `aria-label` empty vs with text.
  - (j) Ghost text and the ready hint in `--text-2`.
  - (k) Reduced motion.
  - (l) A save error shows on another tab.
  - (p) With capture active and no STT, `#stt-status` reads "No speech-to-text", not "Listening".
- **`themes.spec`:**
  - (m) Hybrid: `#toolbar` luminance < .1; `#settings` background `rgb(255, 255, 255)`, border `rgb(228, 228, 231)`, `box-shadow: none`, `color-scheme: light`; `.s-tab.on` underline `rgb(60, 131, 246)`; at most one visible `.btn-primary` per pane after `fillSettings`; the résumé pane's primary is `#resume-import` while empty.
  - (n) Onboarding (`onboarded: false`): hero gradient; `#ob-title` in EB Garamond, loaded; step 2 confirmation-only (stubs granted); Geist after Next; no EB Garamond anywhere else; `#ob-skip` topmost.
  - (o) Permissions window: title; white card; Geist loaded. With mic denied and screen not-determined: the mic row's "Allowed" tag is hidden, "Open settings" is visible, Continue is disabled. With both granted: the reverse, and Continue is enabled.
  - (q) publik: disclosure and card white with Bone borders; `.ob-cta` background equals the `--accent-fill` value.
- **`onboarding.spec`:** Next → Next → "Open Settings" → Done → "You're all set" is visible; step-4 "Add your résumé" opens Profile with the onboarding scrim hidden.
- **`screens.spec`:** about 44 states in both themes over white and dark backdrops, including the publik screens, the journey scenes and three permissions states. Output to `test-results/ui/*.png`, uploaded by CI. Pixel asserts are opt-in (`VISUAL=1`).
- **`scripts/ui-diff.cjs`:** app vs `docs/design/prototype.html#<state>`, side by side in `test-results/ui/index.html`.

**Packaged build.**
- `npm run pack` (asar is off). Then confirm `dist/linux-unpacked/resources/app/renderer/{fonts/*.woff2,fonts/OFL-*.txt,css/*.css,permissions.css}` exist.
- Run the unpacked binary under `xvfb-run` with `ELECTRON_ENABLE_LOGGING=1` for 10s; there must be no "Refused to load" or "Failed to load resource".

**Manual QA** (`docs/qa-checklist.md`, "Design and accessibility"). Machines: Mac Retina and 1x, Windows 11 at 100% and 150%, a Windows 10 VM, Ubuntu GNOME.
- Overlay at opacity 100/60/20 over Zoom, a white Doc, VS Code dark and video.
- The light dialogs over dark and bright desktops at the same opacities.
- OS dark mode on and off: no change.
- ClearType at 12–13px; Garamond rendering on Windows.
- Click-through in the gaps and strips; drag from the grip and the toolbar background.
- Collapse with the live and unread dots; a real speech flow.
- **Listening with publik only (no STT); macOS with Meeting audio off.**
- All tabs; a save error from another tab.
- Onboarding on every platform, including suspend/resume.
- **macOS fresh profile: the gate as welcome. Windows, returning user with the mic denied: the window stays above the overlay and "Continue without microphone" works.**
- publik via a staging token.
- Keyboard-only pass; VoiceOver and NVDA read the answer once.
- Reduce Motion, Increase Contrast, high contrast.
- Screen-share exclusion unchanged; idle CPU/GPU no worse.
- Before/after screenshots in the PR.

### Risks and mitigations

1. **Protected strings and ids.** The do-not-touch list; guard tests first; staged assertions; the full gate after each commit; no banned words, including in comments.
2. **Null derefs at module load.** Hide, never delete; moved nodes keep their ids; a resolver test.
3. **Click-through regressions.** All UI sits inside the six ids; the closed sidebar wins by layer order (tested); the toast and dots are pointer-events none.
4. **Hidden UI intercepts clicks** (smoke-quit's 150ms check). No exit animations, no `inert`, and the scrim hides instantly.
5. **Silent CSS or font failures.** Main-side console capture from load; `@import`/`url()` resolution test; runtime CSSImportRule and FontFace checks; explicit `font-src 'self'`.
6. **The 600px budget.** Flex chain, layout-guard e2e, popover-bounds e2e, dialog caps with inner scroll, the recomputed 406px Settings pane.
7. **Listening looks live but does nothing.** `data-listen` variants, the "No speech-to-text" state, the `capture.js` code, the onboarding copy, e2e (b) and (p).
8. **Two windows collide on first run.** `permissionGatePlan` (unit-tested), `alwaysOnTop` on win32, no Windows gate on first run, manual QA. Cross-window stacking cannot be asserted in e2e.
9. **Onboarding dead ends.** Suspend/resume via an observer on `#settings-scrim`, with `closeSettings` untouched; e2e round trip.
10. **Wrong fix button** (ends a live session, or competes with publik). The code table, the `.active` guard, `action` suppression, e2e (d).
11. **Default CTA fails AA.** Approval 1, a documented exception, a test whose threshold switches automatically.
12. **Saturation creep.** Approval 10 is achromatic by default; one muted green; new literals listed for approval; the no-literals test.
13. **Shared controls break in one theme.** Explicit classes (no aliases), the parity test, the component sheet and screens in both themes, the publik e2e.
14. **The serif or the gradient leaks.** Selector-level reference tests plus the e2e font scan.
15. **Hybrid brightness and a milky veil at low opacity.** The .45 scrim, approval 2C, QA over dark desktops.
16. **Bone edges below 3:1.** Labels, inset shadow, focus border plus halo, Steel lines under `prefers-contrast`; documented.
17. **Scope creep.** Main-process edits limited to `llm-runner.js`, `llm.js`, `applink-state.js`, `capture.js`, `permissions.js` and `index.js` (one branch). No new IPC channels; `ipc.js` untouched. Excluded: inline key entry, extra steps, a settings rail, new status levels.
18. **Font licensing, and data fonts in the artifact.** Unmodified OFL files with their licences, NOTICE; the prototype's font badge, with ui-diff as the fallback reference.

### Critical Files for Implementation
- /home/user/onscreenly/renderer/index.html
- /home/user/onscreenly/renderer/styles.css (becomes the layer entry for the new /home/user/onscreenly/renderer/css/tokens.css, controls.css, overlay.css, workspace.css, fonts.css)
- /home/user/onscreenly/renderer/js/onboarding.js (with /home/user/onscreenly/renderer/js/boot.js and /home/user/onscreenly/renderer/js/settings-form.js)
- /home/user/onscreenly/renderer/js/events.js (with /home/user/onscreenly/renderer/js/chat.js, /home/user/onscreenly/app/main/llm-runner.js, /home/user/onscreenly/app/main/capture.js)
- /home/user/onscreenly/renderer/permissions.html (with /home/user/onscreenly/renderer/permissions.js, /home/user/onscreenly/app/main/permissions.js, /home/user/onscreenly/e2e/launch.cjs)