# Developing Onscreenly

Everything you need to run, test, package and release Onscreenly from source. For the quick start, see the [README](../README.md#run-from-source).

## Local Whisper setup

```sh
npm run prepare:whisper
npm run verify:whisper-runtime
```

Windows x64 and Linux x64/arm64 preparation fetch checksum-verified runtime archives. macOS x64/arm64 preparation builds the pinned source and requires CMake plus Xcode command-line tools. A checksum mismatch stops preparation; do not bypass it.

Then choose **Local** in Settings → Audio and download or import a supported model. Speech inference is local; generated answers and meeting notes still use your selected answer provider.

## Optional Publik integration

A source checkout has no embedded Publik app token by default, so that option is absent. The release workflow expects `PUBLIK_APP_TOKEN` and embeds it into the build configuration. For local development, `PUBLIK_APP_TOKEN` also overrides the embedded value at runtime; `PUBLIK_API_BASE_URL` can override the gateway URL.

The external Publik registration retains the legacy `cue` slug for compatibility. It is separate from Onscreenly's new local app-link identity. Changing a provider registration needs coordination with that provider; a local text rename cannot provision a new registration. Check the provider's current pricing and disclosure before opting in.

## Upgrading from Cue

Onscreenly can reuse an existing Cue profile in place. Quit Cue first, then see [docs/compatibility.md](compatibility.md) for profile selection, legacy file names and `CUE_*` environment aliases.

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

Mac builds are **ad-hoc signed** by default: every binary has a valid signature, which Apple silicon needs, but no developer identity, so Gatekeeper asks once after a download ([install guide](install.md)). Developer ID signing and notarization stay available through `MAC_SIGN=1` and the configuration in `electron-builder.cjs`. Windows builds are unsigned.

### Releases

[`.github/workflows/release.yml`](../.github/workflows/release.yml) builds every platform on its own runner after the checks and the app tests pass there:

- **A version tag** (`git tag v0.2.5 && git push origin v0.2.5`, matching `package.json`) publishes a GitHub release with the Mac zips, Windows installer and portable exe, Linux AppImages and `.deb`, `SHA256SUMS`, and generated release notes. Each file also gets a build-provenance attestation, checkable with `gh attestation verify`.
- **A pull request that changes packaging, or a manual run** (Actions → Release → Run workflow) builds the same files as downloadable workflow artifacts and publishes nothing.
- The Publik app token (`PUBLIK_APP_TOKEN` secret) is optional; without it the Publik provider option is absent.

### Verification

`npm test` covers provider routing, capture logic, persistence, profile/filename compatibility, environment aliases, preload compatibility, and package identity. Audio/provider tests use mocks or synthetic fixtures, so a passing suite does not prove actual OS audio access or screen-share exclusion.

`npm run test:e2e` drives the real Electron app with Playwright (on Linux, run it under `xvfb-run -a`). Each test starts the app on a throwaway profile with OS permission prompts stubbed. It covers launch and sandboxing, encrypted keys across a restart, answers from a stand-in provider with Obsidian notes, résumé import and analysis with copy and save, and the IPC boundary against foreign pages, navigation and arbitrary URLs. CI runs it on Linux for every change; the release workflow runs it on macOS, Windows and Linux before building.

What only real hardware can show (permissions, microphone and meeting audio, screen-share hiding, shortcuts, local Whisper) is in the [manual QA checklist](qa-checklist.md).

For an isolated Electron quit check after installing dependencies:

```sh
npx --no-install electron scripts/smoke-quit.cjs
```

This check uses a temporary profile, mocks OS permissions, disables app-link startup and configured-provider initialization, and clicks through onboarding to Quit. It does not record audio or the screen.

For release acceptance, inspect the packaged application name, bundle ID, permission descriptions, and included runtime files, then test permissions, capture, shortcuts, and visibility on each target OS. The malformed historical Windows lab and unfinished patch-agent workflows are [archived and inactive](legacy/README.md); review and repair are required before reactivation.

## Project layout

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

The screenshots directly under `docs/` are historical: they show the upstream Cue interface. Current screenshots are in `docs/design/screens/`.

Copyright (C) 2026 Lohith Kumar. Based on [Cue by Blueturboguy07](https://github.com/Blueturboguy07/cue); see [NOTICE](../NOTICE). Licensed under GPL-3.0-or-later, see [LICENSE](../LICENSE). See `vendor/app-link/VENDORED.md` / `build-resources/whisper.cpp.LICENSE` for third-party provenance.
