# Security policy

Onscreenly is a desktop Electron app that can handle microphone audio, screen images, meeting transcripts, imported documents, and provider API keys. This policy defines what needs protection; it is **not a security certification**. See the [security roadmap](docs/security-roadmap.md) for known gaps and planned controls.

## Reporting a vulnerability

The repository is currently private. Collaborators should contact the repository owner, [@squid-beast](https://github.com/squid-beast), through an existing private channel. If you do not have one, open an issue titled **Security contact requested**, without exploit details or sensitive attachments, to arrange a private conversation. Repository issues are visible to everyone with repository access.

Do not include API keys, real transcripts, screenshots of private meetings, personal documents, or other people's data. A useful private report includes the affected commit/build, operating system, a minimal reproduction using synthetic data, prerequisites, expected/actual behavior, and impact. Coordinate disclosure of exploitable details with the maintainer.

A monitored security contact, response targets, and supported-release window have not yet been established. The current `main` branch is the assessment baseline; this does not promise maintenance of older Cue or Onscreenly builds. Before public distribution, the owner must establish a private reporting route and release-support policy. GitHub's [private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately) is available for public repositories when enabled; this document does not claim it is enabled here.

## System and scope

This policy covers first-party source, packaging, and repository automation:

- `main.js`, `preload.js`, and `renderer/`: privileged operations, renderer isolation, IPC, permissions, capture, and rendering.
- `src/`: provider requests, settings and history, document parsing, local transcription, app-link integration, and compatibility paths.
- `vendor/app-link/`: the integration boundary and its use by Onscreenly, including locally reachable callers.
- `scripts/`, build resources, dependency manifests, and active `.github/workflows/`: downloaded/executed code, packaged contents, and release integrity.

Cloud AI providers, optional Publik, and user-configured endpoints are separate systems. Their behavior and retention promises are not verified by this repository. Vulnerabilities in how Onscreenly connects to or handles data from them remain in scope.

## Threat model and trust boundaries

Protect provider credentials, audio and screenshots, transcripts/history, imported personal context, consent decisions, executable runtimes, and release artifacts.

Treat AI output, provider responses, imported documents, remote downloads, IPC payloads, and local app-link requests as untrusted inputs. The renderer is less privileged than the main process. A local caller's claimed identity is not proof of identity. A user-selected provider endpoint or executable runtime path is a trust decision, not an automatically safe destination.

The application runs with the signed-in OS user's privileges. OS-level compromise affects what it can protect, but must not become a blanket reason to dismiss an avoidable app boundary failure. Keep trusted-user actions, attacker prerequisites, and the effect of a vulnerability explicit.

## Required security properties

These are review requirements. Some are not fully implemented; the roadmap records the gaps.

1. **Permission and consent:** capture must respect OS grants and user intent. App-link operations must require the appropriate current consent; slide access needs its separate grant. Renaming or profile reuse must not silently inherit consent for a different application identity.
2. **Least privilege:** renderer and local callers must receive only necessary capabilities. Privileged IPC needs sender/frame validation, input schemas and limits, and authorization before accessing data or changing state.
3. **Untrusted content stays data:** provider responses, transcripts, imports, and links must not become arbitrary script execution, shell commands, unrestricted file access, or privileged navigation.
4. **Sensitive data protection:** keys must not enter source control, logs, diagnostics, or release artifacts. Persisted secrets need OS-backed protection; settings UI should avoid returning saved secrets. Data sent to a provider must follow the user's selected configuration and disclosed purpose.
5. **Data lifecycle:** explain retention, backups, and cloud transfers accurately. Clearing a visible transcript must not be presented as deletion of saved meeting history. Export and deletion must have defined scopes and tests.
6. **Executable and release integrity:** verify downloaded runtimes/models, constrain archive extraction, and account for cached or explicitly supplied executables. Release only reviewed, validated artifacts with truthful signing/notarization status.
7. **Repository integrity:** changes to dependencies, consent, provider routing, permissions, workflows, and release configuration require review. Untrusted contributions must not run with release credentials or unrestricted write privileges.

## Findings and severity

Report credential exposure, unauthorized capture/data access, consent bypass, code execution from untrusted content, unsafe IPC or URL handling, path traversal, exploitable dependency exposure, and compromised download/build/release paths. Include the reachable input, required privileges or interaction, affected data, and demonstrated impact when assessing severity.

Dependency advisory severity is evidence for triage, not proof of application exploitability. Conversely, a passing test suite, a private repository, or a documented limitation does not make a reachable vulnerability safe.

There are **no owner-approved finding exclusions or accepted-risk waivers** in this policy. Do not suppress a finding merely because it involves vendor code, local access, an optional provider, a known limitation, or an inherited Cue component. Any future exception must name its scope, rationale, owner, compensating controls, and review date.

## Current limitations

- Settings and their backups contain plaintext keys; POSIX file permissions are not encryption. Most saved BYO provider keys are available to the settings renderer; Publik has additional redaction.
- Renderer context isolation and disabled Node integration are present, but renderer sandboxing is disabled. IPC, permission request, and external-link boundaries need further hardening.
- Screen-share exclusion is best effort and is not a confidentiality guarantee across meeting apps and operating systems.
- Local app-link consent does not prove the requesting process's identity. Runtime overrides and caches require trust and further integrity review.
- The dependency audit on 2026-10-05 reported eight high-severity vulnerable package entries. They remain unresolved; see the roadmap.
- The verified Apple Silicon package is unsigned and excludes the local Whisper runtime. No production release or comprehensive penetration test is implied.

Use the [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security) alongside this repository-specific guidance. Planned controls, owner decisions, and acceptance evidence are tracked in [the roadmap](docs/security-roadmap.md).
