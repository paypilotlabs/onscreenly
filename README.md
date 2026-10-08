# Onscreenly

An open-source desktop AI copilot with a floating overlay for screen context, microphone transcription, and meeting assistance. Bring your own AI provider, use a local model, or configure the optional Publik integration.

Onscreenly is maintained by Lohith Kumar and licensed under GPL-3.0-or-later. It is based on [Cue](https://github.com/Blueturboguy07/cue); see [NOTICE](NOTICE) for attribution. The application ID is `com.onscreenly.overlay`.

## Current features

| Feature | Behavior |
|---|---|
| Floating overlay | Transparent, always-on-top toolbar and answer panel, with adjustable opacity. Empty areas pass mouse clicks to the application underneath. |
| Screen assistance | Screenshots plus recent conversation provide context for questions, coding help, and Smart assist. |
| Microphone transcription | Captures your microphone on its own “You” channel. |
| Meeting audio | Captures system output on a separate “Them” channel where supported. Off by default on macOS; enable it in Settings → Audio. |
| AI providers | OpenAI, Anthropic, Gemini, Azure, Cerebras, Groq, MiniMax, DeepSeek, Ollama, Custom OpenAI-compatible endpoints, and optionally Publik. Availability depends on your endpoint, account, and selected model. |
| Local transcription | Whisper model download/import, cancel/resume, and integrity checks. Local transcription does not silently fall back to a cloud provider. |
| Meeting memory | Local transcript/history, generated meeting notes, recap, and recent-meeting context. |
| Personal context | Settings → Profile: résumé and target job (paste, or import PDF, DOCX, Markdown or text), interview-prep answers, and custom response rules. |
| Résumé analysis | **Analyse my résumé** shows cards for summary, strengths, gaps against the job, keyword match, rewritten bullets, likely interview questions and STAR stories to prepare. The keyword score is computed locally, not guessed by the model. Copy it or save it as Markdown. |
| Obsidian notes | Settings → Knowledge: choose your vault folder and answers draw on your best-matching notes, listed under each answer and opened in Obsidian with a click. Read-only, indexed on this computer, and updated as you edit. |
| Slide tracking | Optional automatic slide capture/caption context while listening. |
| App-link integration | Consent-controlled access to app status and actions; slide-caption access has a separate consent. |

Chat and speech-to-text are separate choices. Selecting Anthropic or Azure for answers does not give that provider an audio transcription implementation. Pick a supported speech provider in Settings → Audio, or use local Whisper.

### Keyboard controls

These are the shortcuts registered by the current app. On Windows/Linux, use Ctrl in place of Command.

| Action | macOS | Windows/Linux |
|---|---|---|
| Start or end a session | Command+Shift+L | Ctrl+Shift+L |
| What should I say? | Command+Enter | Ctrl+Enter |
| Assist | Command+Shift+Enter | Ctrl+Shift+Enter |
| Solve the coding problem on screen | Command+H | Ctrl+H |
| Collapse/expand the answer panel | Command+Shift+/ | Ctrl+Shift+/ |
| Quit | Command+Shift+X | Ctrl+Shift+X |

Use **Start session / End session** (or Command/Ctrl+Shift+L from any app) to toggle listening, or type a question and press Enter. Settings are available from the input area's menu; Command/Ctrl+, works while the app is focused. If another app already holds a shortcut (Safari uses Command+Shift+L for its sidebar), that key does nothing in Onscreenly, but the toolbar button still works.

The Mac Dock icon is already hidden after the permission gate. Collapse keeps the toolbar visible; minimum opacity is 20%. This rename does **not** add a fully hidden mode or permanent whole-window click-through.

## Screen capture and platform limits

Screen-share protection is **best effort, not a guarantee**. The app requests Electron's content protection on supported macOS/Windows sessions. Modern macOS applications using ScreenCaptureKit may still capture the window. Linux has no equivalent protection in this app, and the app skips protection in unsupported Windows builds or remote sessions where it can make the overlay unusable.

See [Electron's content-protection documentation](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows). Check the actual share from another participant's view in the meeting application and OS version you use. No Zoom, Teams, or Meet capture mode is promised to hide Onscreenly universally.

- **macOS:** requires macOS 13 or later (Electron 44). Microphone and Screen Recording permission are required for the corresponding features. System-audio loopback targets macOS 14.4+ and uses a screen-capture session; enabling meeting audio can display macOS's recording/sharing indicator.
- **Windows:** microphone access depends on Windows privacy settings. Meeting audio uses loopback capture. Native window exclusion requires a supported local console session.
- **Linux:** package targets exist for x64 and arm64; audio capture, window behavior, and global shortcuts depend on the desktop environment. Screen-share invisibility is not supported.

Use recording and assistance features in accordance with participants' consent and the rules of your meeting or activity.

## Install

Download a build from the [Releases page](https://github.com/squid-beast/onscreenly/releases/latest) and follow the [install guide](docs/install.md). Builds are free and unsigned, so macOS and Windows ask once before the first launch; the guide shows where. Each release lists `SHA256SUMS` for checking a download.

The repository is private: the Releases page and its downloads are visible to collaborators only. Ask the owner for access, or build from source.

## Run from source

Use Node.js **22.13 or later** and npm. Repository access is required while this project is private:

```sh
git clone https://github.com/squid-beast/onscreenly.git
cd onscreenly
npm ci
npm start
```

`npm ci` installs the Electron package; Electron 42 and later download the runtime binary the first time `npm start` runs, so the first launch needs network access. The former Windows executable-renaming and Edge-icon scripts are retired; they no longer modify files. If an old checkout modified your Electron installation, a fresh `npm ci` restores it.

On first launch:

1. Grant the requested microphone and screen permissions. In development, the operating system may identify the executable as Electron; packaged builds use Onscreenly.
2. Open Settings and select an answer provider, model, and your own API key, or configure a local/compatible endpoint.
3. Select the transcription provider separately. For local transcription, prepare the runtime and download/import a model first.
4. On macOS, enable Meeting audio in Settings → Audio if you want system audio transcribed.
5. Start a session from the toolbar.

Permission changes may require quitting and reopening the app. A shortcut cannot override a denied OS permission.

### Local Whisper setup

```sh
npm run prepare:whisper
npm run verify:whisper-runtime
```

Windows x64 and Linux x64/arm64 preparation fetch checksum-verified runtime archives. macOS x64/arm64 preparation builds the pinned source and requires CMake plus Xcode command-line tools. A checksum mismatch stops preparation; do not bypass it.

Then choose **Local** in Settings → Audio and download or import a supported model. Speech inference is local; generated answers and meeting notes still use your selected answer provider.

### Optional Publik integration

A source checkout has no embedded Publik app token by default, so that option is absent. The release workflow expects `PUBLIK_APP_TOKEN` and embeds it into the build configuration. For local development, `PUBLIK_APP_TOKEN` also overrides the embedded value at runtime; `PUBLIK_API_BASE_URL` can override the gateway URL.

The external Publik registration retains the legacy `cue` slug for compatibility. It is separate from Onscreenly's new local app-link identity. Changing a provider registration needs coordination with that provider; a local text rename cannot provision a new registration. Check the provider's current pricing and disclosure before opting in.

## Upgrading from Cue

Onscreenly can reuse an existing Cue profile in place. Quit Cue first, then see [docs/compatibility.md](docs/compatibility.md) for profile selection, legacy file names and `CUE_*` environment aliases.

## Build and package

```sh
npm test
npm run pack              # unpacked application for the current platform
npm run pack:win          # unpacked Windows x64 application
npm run dist:mac          # Apple Silicon and Intel Mac zips
npm run dist:mac:arm64    # Apple Silicon zip
npm run dist:mac:x64      # Intel Mac zip
npm run dist:win          # Windows x64 installer and portable exe
npm run dist:linux        # Linux x64 AppImage and .deb
npm run dist:linux:arm64  # Linux arm64 AppImage
```

Expected artifacts under `dist/`:

| Target | Artifact |
|---|---|
| macOS | `Onscreenly-<version>-mac-<arch>.zip`, containing `Onscreenly.app` |
| Windows installer | `Onscreenly-<version>-win-x64-setup.exe` |
| Windows portable | `Onscreenly-<version>-win-x64-portable.exe` |
| Windows unpacked | `win-unpacked/Onscreenly.exe` |
| Linux | `Onscreenly-<version>-linux-<arch>.AppImage`, `Onscreenly-<version>-linux-amd64.deb` |

Whisper runtime bundling defaults **on for Windows/Linux** and **off for macOS**. To include it in a Mac build:

```sh
ONSCREENLY_BUNDLE_WHISPER=1 npm run dist:mac:arm64
```

A Mac package built without the runtime cannot use local transcription unless you provide a prepared runtime using `ONSCREENLY_WHISPER_RUNTIME`. Model files are downloaded separately from the runtime.

Mac builds are **ad-hoc signed** by default: every binary has a valid signature, which Apple silicon needs, but no developer identity, so Gatekeeper asks once after a download ([install guide](docs/install.md)). Developer ID signing and notarization stay available through `MAC_SIGN=1` and the configuration in `electron-builder.cjs`. Windows builds are unsigned.

### Releases

[`.github/workflows/release.yml`](.github/workflows/release.yml) builds every platform on its own runner after the checks and the app tests pass there:

- **A version tag** (`git tag v0.2.5 && git push origin v0.2.5`, matching `package.json`) publishes a GitHub release with the Mac zips, Windows installer and portable exe, Linux AppImages and `.deb`, `SHA256SUMS`, and generated release notes. Build-provenance attestations are skipped while the repository is private. Once it is public, each file also gets one.
- **A pull request that changes packaging, or a manual run** (Actions → Release → Run workflow) builds the same files as downloadable workflow artifacts and publishes nothing.
- The Publik app token (`PUBLIK_APP_TOKEN` secret) is optional; without it the Publik provider option is absent.

### Verification

`npm test` covers provider routing, capture logic, persistence, profile/filename compatibility, environment aliases, preload compatibility, and package identity. Audio/provider tests use mocks or synthetic fixtures, so a passing suite does not prove actual OS audio access or screen-share exclusion.

`npm run test:e2e` drives the real Electron app with Playwright (on Linux, run it under `xvfb-run -a`). Each test starts the app on a throwaway profile with OS permission prompts stubbed. It covers launch and sandboxing, encrypted keys across a restart, answers from a stand-in provider with Obsidian notes, résumé import and analysis with copy and save, and the IPC boundary against foreign pages, navigation and arbitrary URLs. CI runs it on Linux for every change; the release workflow runs it on macOS, Windows and Linux before building.

What only real hardware can show (permissions, microphone and meeting audio, screen-share hiding, shortcuts, local Whisper) is in the [manual QA checklist](docs/qa-checklist.md).

For an isolated Electron quit check after installing dependencies:

```sh
npx --no-install electron scripts/smoke-quit.cjs
```

This check uses a temporary profile, mocks OS permissions, disables app-link startup and configured-provider initialization, and clicks through onboarding to Quit. It does not record audio or the screen.

The rename was checked with **314 passing automated tests**, isolated main/permission-window and click-to-Quit checks, and an Apple Silicon Mac package inspection. The test package is unsigned and has no bundled Whisper runtime. Live audio/providers, Windows/Linux installers, and Intel Mac packaging were not verified in that pass.

For release acceptance, inspect the packaged application name, bundle ID, permission descriptions, and included runtime files, then test permissions, capture, shortcuts, and visibility on each target OS. The malformed historical Windows lab and unfinished patch-agent workflows are [archived and inactive](docs/legacy/README.md); review and repair are required before reactivation.

## Security policy and planned work

Read [SECURITY.md](SECURITY.md) for vulnerability reporting, security boundaries, and required protections. The [security roadmap](docs/security-roadmap.md) tracks the work still needed: retention rules for meeting history, a dependency update cadence, and protected signed releases.

On **2026-10-05** Onscreenly moved to Electron 44, both windows became sandboxed, and every IPC message is checked for its sender and payload. `npm audit` now reports no vulnerable packages. The policy documents planned requirements and does not claim this build is production-hardened.

## Privacy and local storage

- API keys are encrypted with the operating system's key store (macOS Keychain, Windows DPAPI, GNOME Keyring or KWallet on Linux) in `secrets.bin`; the settings JSON keeps blank key fields. Keys from an older profile are moved there on first launch, and Settings only ever shows a saved key masked to its last four characters. Without a key store, Settings says so: on Linux without a keyring the keys are only obfuscated, and where encryption is unavailable they stay in the settings file as before.
- **Settings → API Keys → Delete all my data** removes settings, saved keys, résumé and profile text, and meeting history, then restarts Onscreenly. Downloaded Whisper models are kept and can be removed in Settings → Audio.
- `meetings.json` stores transcript history and generated notes. The app retains a bounded number of recent meetings and may restore an interrupted session; it is not a lossless recording system.
- Audio chunks are processed in memory. Downloaded Whisper models remain on disk until deleted through Settings.
- Screen images, conversation context, profile text, and custom response rules can be sent to your selected answer provider. With Knowledge on, the best-matching excerpts from your Obsidian vault (about 3,000 characters at most) are sent too; recap and coding solves never use them. The vault is only read, never written, and its index lives in memory only. Cloud transcription sends audio to the selected speech provider. Optional Publik routes requests through its gateway.
- App-link callers need explicit consent. A separate consent controls access to captured slide captions.
- Do not commit personal profiles or provider keys. Both new and legacy settings filenames and their backups are excluded by `.gitignore`.

## Project layout and provenance

- `app/main/`: the Electron main process, one module per concern:
  - `index.js`: identity bootstrap, launch and lifecycle.
  - `window.js`: the overlay window, screen-share protection, dragging.
  - `capture.js`, `whisper.js`, `slides.js`: listening, local Whisper, slide tracking.
  - `llm-runner.js`: runs an AI feature and streams the answer.
  - `knowledge.js`: Settings → Knowledge, the vault index and note search for answers.
  - `publik-controller.js`, `permissions.js`, `media.js`, `shortcuts.js`, `ipc.js`: Publik, OS permissions, media handlers, shortcuts, shared IPC.
  - `session.js`, `platform.js`: shared live state and platform facts.
- `preload.js`: limited renderer API bridge.
- `renderer/`: existing HTML/CSS/JavaScript overlay, permissions, onboarding, and audio processing.
- `src/`, grouped by area:
  - `llm/`: answer providers, OpenAI-compatible endpoints, prompt modes.
  - `stt/`: cloud and streaming transcription, voice activity detection, utterance segmentation, WAV encoding.
  - `whisper/`: local Whisper runtime, model catalog/downloads, server session.
  - `context/`: résumé parsing and analysis, interview and profile context.
  - `knowledge/`: the read-only Obsidian vault: note parsing, the index (BM25 search over heading sections) and its prompt block.
  - `capture/`: screenshots and slide tracking.
  - `meetings/`: meeting history, memory, generated notes.
  - `storage/`: settings persistence.
  - `integrations/`: app-link and Publik.
  - `platform/`: app identity and Cue profile compatibility, environment variables, shortcuts.
- `scripts/`: packaging and runtime preparation; `scripts/dev/` holds manual regression helpers.
- `test/`: automated tests using synthetic data and mocked integrations, mirroring the `src/` groups plus `renderer/` and `build/`.
- `vendor/app-link/`: vendored integration library with its original provenance.

Historical screenshots under `docs/` show the upstream Cue interface and are not current Onscreenly product screenshots. No new visual design or icon is included in this rename.

Copyright (C) 2026 Lohith Kumar. Based on [Cue by Blueturboguy07](https://github.com/Blueturboguy07/cue); see [NOTICE](NOTICE). Licensed under GPL-3.0-or-later, see [LICENSE](LICENSE). See and `vendor/app-link/VENDORED.md` / `build-resources/whisper.cpp.LICENSE` for third-party provenance.
