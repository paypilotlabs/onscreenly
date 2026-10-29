# Changelog

All notable changes to Onscreenly. Versions follow [Semantic Versioning](https://semver.org/); releases are published on the [Releases page](https://github.com/paypilotlabs/onscreenly/releases).

## [0.2.4] - 2026-10-29

First public release under the PayPilotLabs organization.

### Added
- Résumé analysis: strengths, gaps against a job description, a locally computed keyword match, rewritten bullets and likely interview questions.
- Obsidian notes in answers (Settings → Knowledge): read-only, indexed on your computer.
- "Delete all my data" in Settings → API Keys.
- A session shortcut (⌘/Ctrl ⇧ L) and visible listening, thinking and streaming states.
- Redesigned overlay, Settings, onboarding and consent screens, with keyboard navigation and contrast checks in both themes.
- Signed-free release builds for macOS, Windows and Linux, with `SHA256SUMS`, build-provenance attestations and an install guide.

### Changed
- macOS meeting audio comes from a Core Audio tap instead of a screen capture, so it no longer competes with the meeting app's screen share.
- Upgraded Electron 33 to 44; `npm audit` reports no vulnerable packages.
- Résumé PDFs are parsed with current pdf.js.

### Security
- API keys are encrypted with the operating system's key store.
- Both windows are sandboxed, the renderer CSP is tighter, and every IPC message is checked for its sender and payload. Navigation and pop-ups are blocked.

### Fixed
- A question sent while an answer was streaming was dropped.
- Settings could be changed before startup had read them.
- Obsidian notes written by the app weren't always picked up by the vault watcher.

[0.2.4]: https://github.com/paypilotlabs/onscreenly/releases/tag/v0.2.4
