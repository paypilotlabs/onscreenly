# Cue compatibility

Onscreenly started as a fork of [Cue](https://github.com/Blueturboguy07/cue). This page covers the compatibility shims kept for people upgrading from Cue. New installs never need them.

## Where the shims live

| Shim | File | Why it stays |
|---|---|---|
| Legacy profile directories (`cue`, `Cue`, `MicrosoftEdgeUpdate`) and `cue-data.json` | `src/app-identity.js` | Reuses an existing Cue profile in place. |
| `CUE_*` environment aliases | `src/environment.js` | Old scripts and CI keep working. |
| `window.cue` renderer alias | `preload.js` | Deprecated alias of `window.onscreenly`. |
| Publik `cue` app slug | `src/publik.js`, `src/publik-build.json` | External registration owned by Publik; changing it needs their coordination. |
| `cue-data.json*` ignore rule | `.gitignore` | Stops a legacy settings file holding keys from being committed. |

## Upgrading from Cue

**Quit Cue before starting Onscreenly.** Onscreenly can reuse the same saved files, so do not run both apps against that profile simultaneously.

The compatibility bootstrap selects a profile before settings or the window are opened:

1. An explicit `--user-data-dir` argument or programmatic `app.setPath('userData', ...)` override wins.
2. An existing **Onscreenly** profile containing recognized app data wins.
3. Otherwise, a legacy profile is reused in this order: **cue**, **Cue**, **MicrosoftEdgeUpdate**. A matching name alone is insufficient: it must contain a settings file/backup, meeting history, or the Whisper model directory. An empty new Onscreenly directory does not hide a populated legacy profile.
4. A fresh install uses the **Onscreenly** directory.

Profiles are reused **in place**, without copying, merging, renaming, or deleting your files. Settings, meeting history, and downloaded models stay together in the selected directory.

Within that directory, `onscreenly-data.json` (or its `.bak`) takes priority. If only `cue-data.json` or its backup exists, Onscreenly continues reading and writing that legacy filename. Fresh profiles use `onscreenly-data.json`. Existing backup recovery remains enabled.

Default profile parent directories:

| Platform | Parent directory |
|---|---|
| macOS | `~/Library/Application Support/` |
| Windows | `%APPDATA%\` |
| Linux | `$XDG_CONFIG_HOME/`, normally `~/.config/` |

For an explicitly separate profile:

```sh
npm start -- --user-data-dir=/absolute/path/to/isolated-onscreenly-profile
```

The new application identity has consequences beyond saved data:

- macOS may require fresh microphone/Screen Recording grants after the rename or a rebuild.
- Windows can treat Onscreenly as a separate installation from Cue. This does not silently uninstall Cue.
- Local app-link discovery now uses `com.onscreenly.overlay` / `onscreenly`. Existing callers must rediscover it and request consent again, including slide-caption access. Legacy slide decisions remain in the saved profile but are not honored by the new identity.
- The canonical renderer bridge is `window.onscreenly`; `window.cue` remains as a deprecated compatibility alias.
- Upstream attribution, vendor code, external Publik identifiers, and historical bug-reproduction script filenames intentionally retain some Cue references.

### Environment compatibility

| Preferred variable | Legacy alias | Behavior |
|---|---|---|
| `ONSCREENLY_NO_PROTECT` | `CUE_NO_PROTECT` | A nonempty value disables content protection for debugging. Unset or empty enables the normal protection policy. As with the old flag, the string `0` is nonempty. |
| `ONSCREENLY_BUNDLE_WHISPER` | `CUE_BUNDLE_WHISPER` | `1` enables runtime bundling, `0` disables it. Unset or empty uses platform defaults. |
| `ONSCREENLY_WHISPER_RUNTIME` | `CUE_WHISPER_RUNTIME` | Directory containing an explicitly prepared runtime. |

When both names are present, the preferred variable wins, **including an empty value or `0`**. Signing and provider configuration variables retain their existing names.
