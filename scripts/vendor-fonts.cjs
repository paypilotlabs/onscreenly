#!/usr/bin/env node
// Copies the renderer's fonts from their npm packages into renderer/fonts/,
// byte for byte, with each family's licence. The app ships these committed
// copies, so it never needs node_modules or the network for fonts.
//
//   node scripts/vendor-fonts.cjs           copy (after bumping a font package)
//   node scripts/vendor-fonts.cjs --check   compare only; exit 1 on any drift

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FONT_DIR = path.join(ROOT, 'renderer', 'fonts');

// Latin and Latin Extended Geist; upright only, no italics. (EB Garamond left with the light
// onboarding hero in 0.2.5: nothing in the app sets it.)
const FONTS = [
  {
    pkg: '@fontsource-variable/geist',
    files: ['geist-latin-wght-normal.woff2', 'geist-latin-ext-wght-normal.woff2'],
    license: 'OFL-Geist.txt'
  }
];

function packageDir(pkg) {
  return path.dirname(require.resolve(`${pkg}/package.json`, { paths: [ROOT] }));
}

/** Every vendored file: { from } in node_modules, { to } in renderer/fonts. */
function vendorPlan() {
  return FONTS.flatMap(({ pkg, files, license }) => {
    const dir = packageDir(pkg);
    return [
      ...files.map((f) => ({ from: path.join(dir, 'files', f), to: path.join(FONT_DIR, f) })),
      { from: path.join(dir, 'LICENSE'), to: path.join(FONT_DIR, license) }
    ];
  });
}

function drift() {
  const plan = vendorPlan();
  const problems = [];
  for (const { from, to } of plan) {
    const name = path.relative(ROOT, to);
    if (!fs.existsSync(to)) problems.push(`${name} is missing`);
    else if (!fs.readFileSync(from).equals(fs.readFileSync(to)))
      problems.push(`${name} differs from ${path.relative(ROOT, from)}`);
  }
  const expected = new Set(plan.map(({ to }) => path.basename(to)));
  if (fs.existsSync(FONT_DIR)) {
    for (const f of fs.readdirSync(FONT_DIR)) {
      if (!expected.has(f)) problems.push(`renderer/fonts/${f} is not a vendored file`);
    }
  }
  return problems;
}

function main() {
  if (process.argv.includes('--check')) {
    const problems = drift();
    for (const p of problems) console.error(`vendor-fonts: ${p}`);
    if (problems.length) {
      console.error('vendor-fonts: run `node scripts/vendor-fonts.cjs` to refresh renderer/fonts.');
      process.exit(1);
    }
    console.log('vendor-fonts: renderer/fonts matches node_modules.');
    return;
  }
  fs.mkdirSync(FONT_DIR, { recursive: true });
  for (const { from, to } of vendorPlan()) {
    fs.copyFileSync(from, to);
    console.log(`vendor-fonts: ${path.relative(ROOT, from)} -> ${path.relative(ROOT, to)}`);
  }
}

if (require.main === module) main();

module.exports = { FONTS, FONT_DIR, drift, vendorPlan };
