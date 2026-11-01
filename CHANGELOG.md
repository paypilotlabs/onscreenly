# Changelog

All notable changes to Onscreenly. Versions follow [Semantic Versioning](https://semver.org/); releases are published on the [Releases page](https://github.com/paypilotlabs/onscreenly/releases).

## [Unreleased]

### Added
- **Report a problem** in the guide (Help): opens a new GitHub issue in your browser with only the app version and system filled in.
- A notice when a newer version is out, with **Download**. The installed app asks GitHub's releases page once per launch; turn it off in Settings › API keys › Your data › New versions.

### Changed
- The app no longer ships the EB Garamond font, which nothing used after the guide moved into the overlay.

## [0.2.5] - 2026-10-31

### Added
- Coding problems longer than the screen: press ⌘⌥⇧K / Ctrl+Alt+Shift+K (Add screen) to keep each part as you scroll (up to 4), then solve; every part is sent together. A problem that is still cut off is named as such instead of half-solved, and the parts already added are kept for the next solve.
- Settings › API keys › Your data › Meeting history: keep the last 10, 25, 50 or 100 meetings, or none, and delete the history.
- Stop an answer that is on its way (Send or Esc); answers cut off at the length limit say so.
- Settings › Appearance › Keyboard shortcuts: change any global shortcut.
- Answers come from your Obsidian notes first, in your own wording.

### Changed
- The guide (first run and Help) is part of the overlay: it opens in the answer panel's place under the toolbar, in the same dark theme, instead of a light card over a grey box. It also lists the Add screen shortcut.
- Global shortcuts no longer take keys other apps rely on: "What should I say?" is ⌘⌥↵ / Ctrl+Alt+Enter and LeetCode ⌘⌥K / Ctrl+Alt+K.
- macOS opens without asking for permissions; the microphone and Screen Recording are asked for when first needed.
- Answers never invent experience, employers or numbers; missing details are marked [X].

### Fixed
- One copy per profile; Settings saves can no longer erase saved keys, move the window back, or switch away from Ollama/Custom.
- Meeting history is saved atomically and owner-only, a damaged file is kept and recovered, and deleting it is final.
- Requests are cancelled on Stop and on timeouts; bad keys, unreachable providers and HTML error pages read clearly.
- Audio queues are bounded, nothing is uploaded after a key is rejected, and Deepgram keeps audio while it connects.
- Keyboard scrolling of answers, focus after a failed save and in onboarding, and banners that no longer vanish before they can be read.

### Security
- The packaged app turns off the Electron fuses that let it run as plain Node or accept NODE_OPTIONS and --inspect; the macOS entitlements no longer allow DYLD_* injection.
- CI fails on high or critical advisories in shipped dependencies, and runs the quit check.

## [0.2.4] - 2026-10-29

First public release under the PayPilotLabs organization.

### Added
- Résumé analysis: strengths, gaps against a job description, a locally computed keyword match, rewritten bullets and likely interview questions.
- Obsidian notes in answers (Settings → Knowledge): read-only, indexed on your computer.
- "Delete all my data" in Settings → API Keys.
- A session shortcut (⌘/Ctrl ⇧ L) and visible listening, thinking and streaming states.
- Redesigned overlay, Settings, onboarding and consent screens, with keyboard navigation and contrast checks in both themes.
- Release builds for macOS, Windows and Linux, with `SHA256SUMS`, build-provenance attestations and an install guide.

### Changed
- macOS meeting audio comes from a Core Audio tap instead of a screen capture, so it no longer competes with the meeting app's screen share.
- Upgraded Electron 33 to 44; at release, `npm audit` reported no vulnerable runtime dependencies.
- Résumé PDFs are parsed with current pdf.js.

### Security
- API keys are encrypted with the operating system's key store.
- Both windows are sandboxed, the renderer CSP is tighter, and every IPC message is checked for its sender and payload. Navigation and pop-ups are blocked.

### Fixed
- A question sent while an answer was streaming was dropped.
- Settings could be changed before startup had read them.
- Obsidian notes written by the app weren't always picked up by the vault watcher.

[0.2.5]: https://github.com/paypilotlabs/onscreenly/releases/tag/v0.2.5
[0.2.4]: https://github.com/paypilotlabs/onscreenly/releases/tag/v0.2.4
