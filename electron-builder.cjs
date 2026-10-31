/* electron-builder configuration.
 *
 * Moved out of package.json so signing can be chosen by the environment rather
 * than hardcoded.
 *
 *   • Ad-hoc signed (default, no Apple account) — identity '-'. Every binary in
 *     the app carries a valid ad-hoc signature, which Apple Silicon requires to
 *     run at all. macOS Gatekeeper still blocks it after a download until the
 *     user allows it once (System Settings → Privacy & Security → Open Anyway,
 *     or `xattr -dr com.apple.quarantine`); docs/install.md walks through it.
 *
 *   • Signed + notarized — set MAC_SIGN=1 with a "Developer ID Application"
 *     identity reachable in the keychain (or CSC_LINK in CI), plus
 *     APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID. electron-builder
 *     signs with the hardened runtime, notarizes, and staples. The app then
 *     opens on the first double-click with no warning at all.
 */

// Gated on an explicit flag rather than on CSC_LINK: a bare .p12 carries only
// the leaf certificate, and signing with an incomplete chain fails in a way
// that looks like a wrong password.
const hasCert = process.env.MAC_SIGN === '1';
const canNotarize =
  hasCert && !!process.env.APPLE_ID && !!process.env.APPLE_APP_SPECIFIC_PASSWORD && !!process.env.APPLE_TEAM_ID;

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.onscreenly.overlay',
  productName: 'Onscreenly',
  asar: false,
  publish: null,
  artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
  // An allowlist, so anything new has to be added here or it simply is not in
  // the shipped app — and the only symptom is a require() that throws at
  // launch, in a build that ran fine from source.
  files: [
    'app/**/*',
    'preload.js',
    'src/**/*',
    'renderer/**/*',
    'vendor/**/*',
    'LICENSE',
    'NOTICE',
    // pdfjs-dist only needs this native canvas module to render pages; résumé
    // import reads the text layer, so the prebuilt binary is left out.
    '!**/node_modules/@napi-rs/**'
  ],
  directories: { buildResources: 'build-resources' },
  afterPack: 'scripts/after-pack.js',
  mac: {
    target: [{ target: 'zip', arch: ['x64', 'arm64'] }],
    category: 'public.app-category.productivity',
    // With a real cert, let electron-builder discover it and apply the hardened
    // runtime (notarization is refused without it). Without one, '-' signs
    // ad-hoc: no identity, but a valid signature on every binary.
    identity: hasCert ? undefined : '-',
    hardenedRuntime: hasCert,
    gatekeeperAssess: false,
    entitlements: 'build-resources/entitlements.mac.plist',
    entitlementsInherit: 'build-resources/entitlements.mac.plist',
    // electron-builder 26 wants a boolean; the credentials come from
    // APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID in the env.
    notarize: canNotarize,
    extendInfo: {
      LSUIElement: true,
      NSMicrophoneUsageDescription: 'Onscreenly transcribes your microphone so it can help you in conversations.',
      NSCameraUsageDescription: 'Onscreenly does not use the camera.',
      NSAudioCaptureUsageDescription: 'Onscreenly captures system audio to transcribe the other participant in a call.'
    }
  },
  // Unsigned: Windows SmartScreen asks once ("More info" → "Run anyway").
  win: {
    target: [
      { target: 'nsis', arch: ['x64'] },
      { target: 'portable', arch: ['x64'] }
    ]
  },
  portable: {
    artifactName: '${productName}-${version}-win-${arch}-portable.${ext}'
  },
  // A per-user install with a visible directory step: onscreenly is a personal overlay,
  // not a machine-wide service, so it should never need an elevation prompt.
  nsis: {
    artifactName: '${productName}-${version}-win-${arch}-setup.${ext}',
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    shortcutName: 'Onscreenly'
  },
  linux: {
    target: [
      { target: 'AppImage', arch: ['x64', 'arm64'] },
      { target: 'deb', arch: ['x64'] }
    ],
    category: 'Utility',
    maintainer: 'Lohith Kumar <lkneerukonda@gmail.com>',
    synopsis: 'AI overlay for screen context and meeting assistance'
  },
  deb: {
    artifactName: '${productName}-${version}-linux-${arch}.${ext}'
  },
  // Electron fuses, flipped in the packaged binary. With the defaults a shipped Onscreenly would run
  // as a plain Node interpreter (ELECTRON_RUN_AS_NODE=1) and honour NODE_OPTIONS and --inspect, so
  // anything that can set its environment or arguments could run code with its permissions
  // (microphone, screen recording, keys). Nothing in the app uses them.
  electronFuses: {
    runAsNode: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false
  }
};
