# Security work before production distribution

This is a prioritized implementation and policy backlog, dated **2026-10-05**. It distinguishes source-observed safeguards from work still needed. Adding these documents does not encrypt existing data, enable GitHub protections, or resolve vulnerabilities.

## Current evidence

| Area | Present | Still needed |
|---|---|---|
| Electron boundary | Context isolation, disabled renderer Node integration, named preload methods and an event allowlist. | Renderer sandboxing; consistent IPC sender/frame checks, schemas and payload limits; navigation/window-open restrictions. |
| Permissions and links | macOS meeting-audio opt-in; OS grants; Publik link allowlist. | Bind media grants to trusted frames. Constrain generic `open-pane` URLs before `shell.openExternal`. |
| Displayed content | Text rendering and escape-first limited markdown; main page restricts scripts to self. | Malicious-content regression coverage; remove inline scripts from the permissions page and tighten its CSP. |
| Credentials and storage | Atomic settings writes, backup recovery, POSIX `0600`; Publik credentials redacted from renderer settings. | OS-backed secret storage, redacted/write-only BYO key UI, protected meeting files, and explicit handling of legacy plaintext backups. |
| Capture and history | OS permissions, bounded meeting history, separate slide consent scoped to the application ID. | Defined retention/export/deletion behavior. The current Clear History action clears the active transcript, not saved meetings. |
| Local app-link | Default-deny consent, timeout and revocation, minimal status data. | Review caller authentication and diagnostic redaction. Claimed Node-transport caller identity is not verified identity. |
| Runtime downloads | SHA-256 checks for model/runtime downloads; bounded model downloads and size/SHA-256-verified imports; no runtime-code download at app launch. | Revalidate executable caches/overrides and use immutable source archives/provenance for macOS runtime preparation. |
| Packaging | Explicit file inclusion, `publish: null`, opt-in Mac signing/notarization. | Protected release approvals and verification of the actual signed/notarized artifact before upload. |

Source anchors: `main.js`, `preload.js`, `renderer/renderer.js`, `renderer/permissions.html`, `src/settings-store-core.js`, `src/store.js`, `src/meetings.js`, `src/applink.js`, `src/whisper-runtime.js`, `src/whisper-model-manager.js`, and `scripts/prepare-whisper-runtime.js`.

## Priority 1: protect data and privileged operations

- [ ] **Move provider keys to OS-backed storage.** Choose a supported credential-storage mechanism for macOS, Windows, and Linux; define behavior when it is unavailable. Migrate without losing keys and account for plaintext backups. Acceptance: secrets are absent from new settings files, renderer read responses, logs, and diagnostic exports; migration, failure, deletion, and rollback are tested with synthetic keys.
- [ ] **Harden Electron IPC and permissions.** Enable sandboxing after adapting preload dependencies, validate sender/frame identity and each IPC payload, restrict permission grants, and allow only intended external schemes/destinations. Acceptance: hostile frames, malformed/oversized payloads, and unapproved URLs are denied while capture/settings flows still work.
- [ ] **Define and implement the data lifecycle.** Specify what is stored, why, where, for how long, and what each clear/export/delete operation includes. Cover saved meetings, settings backups, imported context, diagnostics, screenshots, and models separately. Acceptance: a synthetic profile demonstrates documented deletion and restart behavior; UI labels match actual effects.
- [ ] **Review untrusted content and local callers.** Test malicious model text/imports, audit local app-link transport authorization, and redact sensitive error events. Acceptance: captured content cannot gain privileges, and revoked/new-identity callers cannot recover prior access.

## Priority 1: triage dependencies

`npm audit --json --ignore-scripts` on 2026-10-05 reported **8 high**, **0 critical** vulnerable package entries in the current lockfile:

`@xmldom/xmldom`, `brace-expansion`, `electron`, `extract-zip`, `fast-uri`, `http-cache-semantics`, `js-yaml`, and `undici`.

These include transitive and development/build dependencies. They are not eight proven exploits in Onscreenly, and a development dependency may still affect shipped Electron or build integrity. Advisory data changes over time; rerun the audit when doing the remediation. The audit recommends a major Electron upgrade, so an automatic forced update has not been applied.

- [ ] Triage reachability and exposure for each advisory and assign remediation owners.
- [ ] Upgrade Electron and affected dependency paths; review breaking changes and rerun the capture/permission/packaging matrix on every supported OS.
- [ ] Establish an update cadence and severity-based response targets. Any temporary exception needs explicit owner approval and an expiry; none is granted here.

Acceptance: no unresolved reachable high/critical finding ships without an explicit reviewed exception; record residual advisory findings rather than hiding them with audit suppression.

## Priority 2: repository and release controls

- [ ] Protect `main` and release tags: reviewed changes, required passing checks, restricted bypass/push privileges, and no force pushes. GitHub settings must be configured separately; this document does not activate them.
- [ ] Enable available dependency alerts, secret scanning/push protection, and code scanning according to the repository's plan. Add automated dependency-update proposals; do not auto-merge security-sensitive changes.
- [ ] Pin Actions to reviewed immutable commits and minimize job permissions and credential exposure. Keep untrusted PR jobs separate from credential-bearing release jobs.
- [ ] Gate release publication on tests, explicit human approval, package-content inspection, and artifact signature verification. For macOS, verify notarization and stapling; certificate presence alone is insufficient. Add Windows signing and published checksums/provenance as distribution requirements.
- [ ] Protect runtime/model supply chains: immutable archives, checksum provenance, constrained extraction, cache integrity, and an explicit trust policy for custom runtime paths.

The inherited release workflow runs on `v*` tags. Ordinary source pushes run CI but do not publish a release. The workflow requires a Publik build token, and its Mac upload checks for a configured signing certificate; it does not yet require tests/approval or prove notarization. Do not treat that workflow as satisfying the release requirements above.

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
