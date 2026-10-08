# Installing Onscreenly

Download the file for your computer from the [Releases page](https://github.com/squid-beast/onscreenly/releases/latest). Every release lists `SHA256SUMS` next to the downloads.

The repository is private: the Releases page and its downloads are visible to collaborators only. Ask the owner for access, or build from source.

| Computer | File |
|---|---|
| Mac with Apple silicon (M1 and later) | `Onscreenly-<version>-mac-arm64.zip` |
| Mac with an Intel processor | `Onscreenly-<version>-mac-x64.zip` |
| Windows 10 or 11 (64-bit), installed | `Onscreenly-<version>-win-x64-setup.exe` |
| Windows, no install (runs from any folder) | `Onscreenly-<version>-win-x64-portable.exe` |
| Ubuntu, Debian and other `.deb` distributions (x64) | `Onscreenly-<version>-linux-amd64.deb` |
| Any Linux (x64 or arm64) | `Onscreenly-<version>-linux-<arch>.AppImage` |

Onscreenly is free and open source. The builds are **not signed with an Apple or Microsoft certificate**, so macOS and Windows ask you once to confirm that you want to open them. The steps below show where.

## macOS (13 Ventura or later)

1. Unzip the download and drag **Onscreenly.app** into **Applications**.
2. Double-click it. macOS says it cannot verify the app. Click **Done** (or **OK**).
3. Open **System Settings → Privacy & Security**, scroll to **Security**, and click **Open Anyway** next to the Onscreenly message. Confirm with your password or Touch ID.
4. Onscreenly opens. From now on it opens normally.

If you prefer Terminal, this does the same as steps 2–3:

```sh
xattr -dr com.apple.quarantine /Applications/Onscreenly.app
```

Then grant the permissions Onscreenly asks for:

- **Microphone**, to transcribe you.
- **Screen & System Audio Recording**, for screenshots and, if you switch on Meeting audio in Settings → Audio, the other side of a call.

Grant them in **System Settings → Privacy & Security**, then quit and reopen Onscreenly. The builds are ad-hoc signed: the signature is valid but does not identify a developer. After an update, macOS may ask for these permissions again.

## Windows 10 and 11

**Installer:** run `…-setup.exe`. If Windows shows **Windows protected your PC**, click **More info → Run anyway**. The installer installs for your user only and needs no administrator rights.

**Portable:** run `…-portable.exe` from any folder. Windows asks the same way the first time.

Allow microphone access in **Settings → Privacy & security → Microphone** (turn on **Let desktop apps access your microphone**).

## Linux

**.deb (Ubuntu, Debian, Mint, Pop!\_OS):**

```sh
sudo apt install ./Onscreenly-<version>-linux-amd64.deb
```

**AppImage (any distribution):**

```sh
chmod +x Onscreenly-<version>-linux-<arch>.AppImage
./Onscreenly-<version>-linux-<arch>.AppImage
```

On Ubuntu 22.04 and later, AppImages need FUSE 2: `sudo apt install libfuse2t64` (24.04) or `sudo apt install libfuse2` (22.04).

Saved API keys are encrypted with your desktop's keyring (GNOME Keyring or KWallet). Without a keyring, Settings → API Keys says the keys are only obfuscated.

## Check a download

**Checksum (all systems):** download `SHA256SUMS` into the same folder as your file, then run:

```sh
shasum -a 256 -c SHA256SUMS --ignore-missing      # macOS
sha256sum -c SHA256SUMS --ignore-missing          # Linux
```

On Windows, run `Get-FileHash .\Onscreenly-<version>-win-x64-setup.exe` in PowerShell and compare the hash with the line in `SHA256SUMS`.

**Build provenance:** Build-provenance attestations are skipped while the repository is private. Once it is public, each release file also carries a GitHub attestation that proves which workflow run built it from which commit. With the [GitHub CLI](https://cli.github.com/):

```sh
gh attestation verify Onscreenly-<version>-mac-arm64.zip --repo squid-beast/onscreenly
```

## Update

Download the new version and install it the same way. Your settings, encrypted keys, résumé and meeting history stay where they are.

## Uninstall and remove your data

First use **Settings → API Keys → Delete all my data** if you want your settings, keys, résumé and meeting history removed. Then delete the app:

- **macOS:** move Onscreenly from Applications to the Bin. Data folder: `~/Library/Application Support/Onscreenly`.
- **Windows:** Settings → Apps → Onscreenly → Uninstall (or delete the portable file). Data folder: `%APPDATA%\Onscreenly`.
- **Linux:** `sudo apt remove onscreenly`, or delete the AppImage. Data folder: `~/.config/Onscreenly`.
