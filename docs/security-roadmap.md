# Security work before production distribution

This is a prioritized implementation and policy backlog, dated **2026-10-05**. It distinguishes source-observed safeguards from work still needed. Adding these documents does not encrypt existing data, enable GitHub protections, or resolve vulnerabilities.

## Current evidence

| Area | Present | Still needed |
|---|---|---|
| Electron boundary | Sandboxed renderers, context isolation, disabled renderer Node integration, named preload methods and an event allowlist. Every IPC channel goes through `app/main/ipc-guard.js` (top frame of Onscreenly's own pages only) with type and size checks per payload. Navigation, `window.open` and webviews are refused. | Field-level schema for settings patches (today: plain object, 2 MB cap). |
| Permissions and links | macOS meeting-audio opt-in; OS grants; Publik link allowlist; media grants only for Onscreenly's own pages; `open-pane` limited to the OS privacy panes. | — |
| Displayed content | Text rendering and escape-first limited markdown; both pages restrict scripts to self with no inline scripts, `object-src 'none'`, `base-uri 'none'` and `form-action 'none'`. | Malicious-content regression coverage. |
| Credentials and storage | Atomic settings writes, backup recovery, POSIX `0600`; API keys encrypted with the OS key store in `secrets.bin`, migrated out of the settings file and its backup; the renderer sees masked keys only; Publik credentials redacted. | Protected meeting files; legacy `cue-data.json` files left by Cue in the same folder are not scrubbed. |
| Capture and history | OS permissions, bounded meeting history, separate slide consent scoped to the application ID. | Defined retention/export/deletion behavior. The current Clear History action clears the active transcript, not saved meetings. |
| Local app-link | Default-deny consent, timeout and revocation, minimal status data. | Review caller authentication and diagnostic redaction. Claimed Node-transport caller identity is not verified identity. |
| Runtime downloads | SHA-256 checks for model/runtime downloads; bounded model downloads and size/SHA-256-verified imports; no runtime-code download at app launch. | Revalidate executable caches/overrides and use immutable source archives/provenance for macOS runtime preparation. |
| Packaging | Explicit file inclusion, `publish: null`, ad-hoc Mac signatures verified with `codesign` in the release job, opt-in Developer ID signing/notarization, checks and app tests on each OS before building, `SHA256SUMS`, build-provenance attestations once the repository is public. | Human approval before publishing; Developer ID notarization and Windows signing (needs certificates). |

Source anchors: `app/main/`, `preload.js`, `renderer/js/`, `renderer/permissions.html`, `src/storage/settings-store-core.js`, `src/storage/store.js`, `src/meetings/meetings.js`, `src/integrations/applink.js`, `src/whisper/whisper-runtime.js`, `src/whisper/whisper-model-manager.js`, and `scripts/prepare-whisper-runtime.js`.

## Priority 1: protect data and privileged operations

- [x] **Move provider keys to OS-backed storage.** Done 2026-10-05: `src/storage/secrets.js` with Electron `safeStorage` (async API). Keys are written encrypted and read back before they are removed from the settings file and its backup; a failure keeps them where they were. Unavailable or weak key stores are reported in Settings. Evidence: synthetic-key tests for migration, restart, masking, unavailable and undecryptable stores, and deletion; a real-Electron run migrates a plaintext profile, saves a new key encrypted and reads both back after a restart.
- [x] **Harden Electron IPC and permissions.** Done 2026-10-05: sandboxing, sender/frame checks on every channel, payload checks, media grants bound to Onscreenly's pages, `open-pane` allowlist, navigation/window-open/webview refusal. Evidence: in real Electron, a foreign page with the same preload is refused settings, capture, panes, quit, microphone and screen capture; malformed payloads and unapproved URLs are refused; navigation and pop-ups are blocked; capture/settings/UI flows give identical results before and after (IPC scenario and 42 DOM snapshots).
- [ ] **Define and implement the data lifecycle.** Partly done: **Delete all my data** removes settings, keys and meeting history and restarts (verified in Electron). Still needed: Specify what is stored, why, where, for how long, and what each clear/export/delete operation includes. Cover saved meetings, settings backups, imported context, Obsidian notes (held in memory only, never copied to disk), diagnostics, screenshots, and models separately. Acceptance: a synthetic profile demonstrates documented deletion and restart behavior; UI labels match actual effects.
- [ ] **Review untrusted content and local callers.** Test malicious model text/imports, audit local app-link transport authorization, and redact sensitive error events. Acceptance: captured content cannot gain privileges, and revoked/new-identity callers cannot recover prior access.

## Priority 1: triage dependencies

`npm audit --json --ignore-scripts` on 2026-10-05 reported **8 high**, **0 critical** vulnerable package entries: `@xmldom/xmldom`, `brace-expansion`, `electron`, `extract-zip`, `fast-uri`, `http-cache-semantics`, `js-yaml`, and `undici`. The same day:

- Electron moved from 33 to 44.5.1 after reviewing the 34–44 breaking changes (first-run binary download, Core Audio tap loopback on macOS needing `NSAudioCaptureUsageDescription`, native Wayland on Linux, `display-capture` permission name, macOS 13 minimum).
- `extract-zip` has no fixed release, so the runtime preparation script uses a yauzl-based extractor that keeps every entry inside the target and writes archive links as copies.
- Transitive advisories were resolved with non-breaking updates.
- `pdf-parse` 1.x was replaced with `pdfjs-dist` 6: it bundled pdf.js 1.10, affected by CVE-2024-4367, which `npm audit` cannot see.

`npm audit` now reports no vulnerable packages.

- [x] Triage reachability and exposure for each advisory and assign remediation owners.
- [x] Upgrade Electron and affected dependency paths; review breaking changes. Re-run the capture/permission/packaging matrix on macOS and Windows hardware before a release (Linux checked under xvfb).
- [ ] Establish an update cadence and severity-based response targets. Any temporary exception needs explicit owner approval and an expiry; none is granted here.

Acceptance: no unresolved reachable high/critical finding ships without an explicit reviewed exception; record residual advisory findings rather than hiding them with audit suppression.

## Priority 2: repository and release controls

- [ ] Protect `main` and release tags: reviewed changes, required passing checks, restricted bypass/push privileges, and no force pushes. GitHub settings must be configured separately; this document does not activate them.
- [ ] Enable available dependency alerts, secret scanning/push protection, and code scanning according to the repository's plan. Add automated dependency-update proposals; do not auto-merge security-sensitive changes.
- [ ] Pin Actions to reviewed immutable commits and minimize job permissions and credential exposure. Keep untrusted PR jobs separate from credential-bearing release jobs.
- [ ] Gate release publication on tests, explicit human approval, package-content inspection, and artifact signature verification. For macOS, verify notarization and stapling; certificate presence alone is insufficient. Add Windows signing and published checksums/provenance as distribution requirements. Partly done 2026-10-06: the release workflow runs lint, types, unit tests and the Playwright app tests on macOS, Windows and Linux before building, verifies the Mac signatures, and publishes `SHA256SUMS` with build-provenance attestations (attestations need the repository to be public). Still needed: a protected `release` environment with required reviewers, and notarization/Windows signing if certificates are obtained.
- [ ] Protect runtime/model supply chains: immutable archives, checksum provenance, constrained extraction, cache integrity, and an explicit trust policy for custom runtime paths.

The release workflow publishes only from `v*` tags whose version matches `package.json`; pull requests that change packaging and manual runs build the same files as workflow artifacts without publishing. Only the publish job can write to the repository. The Publik build token is optional. It does not yet require a human approval step or prove notarization, so do not treat it as satisfying every requirement above.

Two inherited manual workflows are archived, inactive, under [legacy/](legacy/README.md): a malformed Windows bugfix lab and an unfinished patch agent with write permissions. Reactivation needs a valid maintained configuration and a review of privileges, inputs, artifacts, and costs.

## Owner decisions and operating policies

These remain **unresolved**, rather than assumed accepted risks:

- Security owner and a monitored private reporting channel; acknowledgement/remediation targets; supported versions and end-of-support communication.
- Data-retention defaults and deletion/export guarantees, including how to treat backups and optional provider retention.
- Which providers/endpoints and app-link capabilities are supported, their disclosure requirements, and whether diagnostics may ever leave the device.
- Release approval roles, signing custody, emergency rollback/revocation, and a security advisory process.
- Incident response: private intake, scope assessment, containment, credential rotation by affected owners, fixes, user communication, and post-incident review. Reports must use sanitized evidence and avoid uploading private captures.

## Completed for this source push

- [x] Documented the reporting route, security boundaries, required properties, and limitations in [SECURITY.md](../SECURITY.md).
- [x] Kept app profiles, environment files, local probes, signing material, build outputs, and conventional credential/database artifacts out of the source commit using explicit staging and ignore rules.
- [x] Aligned CI's test matrix with Node 22/24, retained a read-only CI token, and added bounded job timeouts.
- [x] Archived the broken manual lab and unfinished write-enabled patch-agent workflows.

The rename validation passed **314 automated tests**, isolated main/permission-window and click-to-Quit checks, and Apple Silicon Mac packaging. These tests use synthetic data and mocks; they do not establish live provider access, physical audio capture, meeting-app screen-share exclusion, or Windows/Linux installer behavior. The Mac test package is unsigned and has no bundled Whisper runtime.

References: [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security), [GitHub private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately).
