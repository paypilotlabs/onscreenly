# Manual QA checklist

The automated tests cover the code and the app's own windows, but they cannot grant OS permissions, record real audio, or join a real call. Run this list on real hardware before a release, at least on an Apple silicon Mac and on Windows 11. It takes about 30 minutes.

Use a release build (from the Releases page or the release workflow's artifacts), not `npm start`: permissions and the app identity differ in development.

| Field | Value |
|---|---|
| Build (file name) | |
| OS and version | |
| Chip | |
| Tester and date | |

## 1. Install and first launch

- [ ] The install steps in [install.md](install.md) work as written, including **Open Anyway** on macOS or **Run anyway** on Windows.
- [ ] macOS asks for Microphone and Screen & System Audio Recording; after granting both and reopening, the overlay appears.
- [ ] The overlay sits above other windows; empty areas pass clicks through to the app underneath.
- [ ] The first-run walkthrough appears once and can be skipped.
- [ ] Windows first run: no permissions window. A returning user with the microphone off gets the permissions window above the overlay, and **Continue without microphone** works.

## 2. API keys

- [ ] Add a real key (Settings → API Keys). Closing Settings saves it.
- [ ] Settings → API Keys → Your data says the keys are encrypted with macOS Keychain or Windows DPAPI.
- [ ] Reopen Settings: the key shows as `••••••••` plus its last four characters.
- [ ] The settings file (`~/Library/Application Support/Onscreenly/onscreenly-data.json` or `%APPDATA%\Onscreenly\onscreenly-data.json`) contains no key.
- [ ] Quit and reopen: answers still work without re-entering the key.

## 3. Answers

- [ ] Type a question and press Enter: an answer streams in.
- [ ] **Assist** (Command/Ctrl+Shift+Enter) answers about what is on screen.
- [ ] **Solve the coding problem on screen** (⌘⌥K / Ctrl+Alt+K) on a LeetCode page returns a solution.
- [ ] A LeetCode problem longer than the screen: at the top press ⌘⌥⇧K / Ctrl+Alt+Shift+K ("Screen 1 kept"), scroll, press it again, scroll to the end and solve. The question reads "(3 screens)" and the solution uses every constraint and the full signature. Solving a cut-off problem without adding screens starts with "Missing:" and names those keys; adding the rest and solving again keeps the parts already added.
- [ ] ⌘↵ in Slack or Teams and ⌘H on macOS still do what those apps expect while Onscreenly runs.
- [ ] Settings › Appearance › Keyboard shortcuts: a new combination works at once in other apps, and the hints update; one already used is refused.
- [ ] macOS, fresh install: the overlay opens without asking for any permission; starting a session asks for the microphone, and the first screen answer asks for Screen Recording.
- [ ] Turn **Smart** on: the answer uses the smart model (slower, longer).

## 4. Listening

- [ ] **Start session**: the live dot turns on, and your speech appears as "You" in Transcription history.
- [ ] **What should I say?** (Command/Ctrl+Enter) during a test conversation gives a reply to say.
- [ ] **Recap** summarises what was said.
- [ ] Meeting audio (Settings → Audio, on): in a Zoom, Meet or Teams test call, the other side appears as "Them". On macOS, the first session asks for System Audio Recording; denying it shows "Meeting audio stopped" with Open Privacy settings.
- [ ] With Meeting audio on, share your screen from Zoom, Meet and Teams: the other side sees the share, and "Them" is still transcribed.
- [ ] **End session** stops listening and the indicator goes away.
- [ ] ⌘⇧L / Ctrl+Shift+L from another app starts and ends a session.

## 5. Screen sharing

- [ ] Share your whole screen in Zoom, Meet and Teams: the overlay does not appear in what the others see (best effort; note any app where it shows).
- [ ] Share a single window: the overlay does not appear.

## 6. Shortcuts

- [ ] Every shortcut in the README's keyboard table works while another app has focus.
- [ ] Collapse/expand (Command/Ctrl+Shift+/) and Quit (Command/Ctrl+Shift+X) work.

## 7. Local Whisper

- [ ] Settings → Audio → Local: download a model (for example base.en); progress shows and finishes.
- [ ] With Wi-Fi off, Start session transcribes your speech.

## 8. Résumé analysis

- [ ] Settings → Profile → Import file: a PDF and a DOCX résumé both import.
- [ ] Paste a real job description and press **Analyse my résumé**: cards appear with a keyword score.
- [ ] **Copy** pastes the full analysis elsewhere; **Save as Markdown…** writes a file that opens correctly.
- [ ] In a mock interview, answers to "tell me about yourself" use your résumé.

## 9. Obsidian notes

- [ ] Settings → Knowledge → Choose vault folder: pick your vault. The status shows the note count and "updates as you edit".
- [ ] **Test search** finds the notes you expect.
- [ ] Ask a question your notes answer: the answer uses them and lists them under **From your notes**.
- [ ] Clicking a listed note opens it in Obsidian.
- [ ] Edit a note in Obsidian, then search again: the change is found within a few seconds.
- [ ] Untick **Search my notes**: answers stop listing notes.
- [ ] The vault is unchanged afterwards (no new or modified files; check with `git status` if it is a git repository).

## 10. Data

- [ ] **Meeting history** under Your data shows the meeting count and size. Choosing a lower Keep asks before deleting the oldest; Cancel changes nothing. **Don’t save** stops recording new meetings.
- [ ] **Delete meeting history…** asks first, removes every meeting, and new meetings are saved again afterwards.
- [ ] While an answer is on its way, **Send** (or Esc) stops it: the answer ends with “Stopped.” and the next question works at once.
- [ ] A wrong API key shows “rejected the API key” with **Open settings**; a long answer cut off at the limit says so under it.
- [ ] Opening the app a second time while it runs shows the running copy instead of a second overlay.
- [ ] **Delete all my data** asks first; Cancel changes nothing.
- [ ] Confirming removes settings, keys, résumé and meeting history and restarts Onscreenly as new.

## 11. Design and accessibility

- [ ] Opacity at 100%, 60% and 20% over a video call, a white document and a dark code editor: answers stay readable and the toolbar stays findable.
- [ ] The light dialogs (Settings, consent, permissions) over a dark desktop and over a bright one.
- [ ] Help opens the guide dark, in the answer panel's place under the toolbar; the area around it clicks through to the app below, and a toolbar button (or Help again) closes it.
- [ ] Text and borders look sharp on a Retina display, on a 1x display, and on Windows at 150% scaling.
- [ ] Keyboard only: Tab reaches every control with a visible focus ring, dialogs keep focus inside, and Escape closes one layer per press (the composer text, then Opacity, then the transcript).
- [ ] VoiceOver (macOS) and NVDA (Windows) read the toolbar buttons, answers as they finish, and the status lines.
- [ ] Reduce Motion: no pulsing dot, caret or shimmer. Increase Contrast: the overlay goes solid and lines are stronger.
- [ ] Screen sharing still hides the overlay, as in section 5.

## Result

| Area | Pass / fail | Notes |
|---|---|---|
| Install and launch | | |
| API keys | | |
| Answers | | |
| Listening | | |
| Screen sharing | | |
| Shortcuts | | |
| Local Whisper | | |
| Résumé analysis | | |
| Obsidian notes | | |
| Data | | |
| Design and accessibility | | |

File an issue for each failure, with the build, OS and steps.
