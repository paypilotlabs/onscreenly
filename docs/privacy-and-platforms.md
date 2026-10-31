# Privacy, storage and platform limits

## What is stored, and where

- API keys are encrypted with the operating system's key store (macOS Keychain, Windows DPAPI, GNOME Keyring or KWallet on Linux) in `secrets.bin`; the settings JSON keeps blank key fields. Keys from an older profile are moved there on first launch, and Settings only ever shows a saved key masked to its last four characters. Without a key store, Settings says so: on Linux without a keyring the keys are only obfuscated, and where encryption is unavailable they stay in the settings file as before.
- **Settings → API Keys → Delete all my data** removes settings, saved keys, résumé and profile text, meeting history (with any set-aside or archived copies), and the list of programs allowed to use Onscreenly, then restarts Onscreenly. Downloaded Whisper models are kept and can be removed in Settings → Audio.
- `meetings.json` stores transcript history and generated notes, readable by your user account only. **Settings → API Keys → Your data → Meeting history** keeps the last 10, 25, 50 (default) or 100 meetings, or none; lowering it, or **Delete meeting history…**, asks before deleting anything. A meeting longer than about 200,000 characters (roughly 3.5 hours of speech) continues as a new record. The app may restore an interrupted session; it is not a lossless recording system.
- A damaged `meetings.json` is kept as `meetings.json.corrupt-<time>` and history is restored from the last good copy where possible. A history over 48 MB is not loaded or overwritten; **Archive and start fresh** renames it to `meetings-archive-<time>.json`.
- Audio chunks are processed in memory. Downloaded Whisper models remain on disk until deleted through Settings.
- Screen images, conversation context, profile text, and custom response rules can be sent to your selected answer provider. With Knowledge on, the best-matching excerpts from your Obsidian vault (about 3,000 characters at most) are sent too; recap and coding solves never use them. The vault is only read, never written, and its index lives in memory only. Cloud transcription sends audio to the selected speech provider. Optional Publik routes requests through its gateway.
- App-link callers need explicit consent. A separate consent controls access to captured slide captions.
- Do not commit personal profiles or provider keys. Both new and legacy settings filenames and their backups are excluded by `.gitignore`.

## Screen capture and platform limits

Screen-share protection is **best effort, not a guarantee**. The app requests Electron's content protection on supported macOS/Windows sessions. Modern macOS applications using ScreenCaptureKit may still capture the window. Linux has no equivalent protection in this app, and the app skips protection in unsupported Windows builds or remote sessions where it can make the overlay unusable.

See [Electron's content-protection documentation](https://www.electronjs.org/docs/latest/api/browser-window#winsetcontentprotectionenable-macos-windows). Check the actual share from another participant's view in the meeting application and OS version you use. No Zoom, Teams, or Meet capture mode is promised to hide Onscreenly universally.

- **macOS:** requires macOS 13 or later (Electron 44). Microphone and Screen Recording permission are required for the corresponding features. Meeting audio targets macOS 14.4+, uses a Core Audio tap rather than a screen capture (so it does not compete with the meeting app's own screen share), needs the System Audio Recording permission, and can display macOS's recording indicator.
- **Windows:** microphone access depends on Windows privacy settings. Meeting audio uses loopback capture. Native window exclusion requires a supported local console session.
- **Linux:** package targets exist for x64 and arm64; audio capture, window behavior, and global shortcuts depend on the desktop environment. Screen-share invisibility is not supported.

Use recording and assistance features in accordance with participants' consent and the rules of your meeting or activity.
