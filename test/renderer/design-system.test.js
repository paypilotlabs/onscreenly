// Design system, part 1: the tokens in renderer/css/tokens.css. Every check parses the
// file's text, and the contrast checks compute WCAG ratios from the token values, so a
// changed value is judged by the same rules the design was approved under.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { parseCss, RENDERER } = require('../helpers/css');

const TOKENS_CSS = fs.readFileSync(path.join(RENDERER, 'css', 'tokens.css'), 'utf8');
const TOKENS = parseCss(TOKENS_CSS);

const PROVENANCE = 'Source: https://styles.refero.design/style/72da35d5-1cfd-41a3-94f6-cb6b8c07a670 (Cluely)';

// The Cluely :root block exactly as supplied by the user (styles.refero.design export),
// in source order. tokens.css must open with these 87 declarations, unchanged.
const CLUELY = [
  ['--color-signal-blue', '#3c83f6'],
  ['--color-deep-dusk', '#022c70'],
  ['--color-azure-crest', '#0544a5'],
  ['--color-hover-glow', '#81b6ff'],
  ['--color-ink-black', '#000000'],
  ['--color-carbon', '#18181b'],
  ['--color-slate', '#2e3038'],
  ['--color-steel', '#5e616e'],
  ['--color-fog', '#777a88'],
  ['--color-mist', '#afb3c4'],
  ['--color-vapor', '#edeef2'],
  ['--color-frost', '#f3f8ff'],
  ['--color-chalk', '#ffffff'],
  ['--color-bone', '#e4e4e7'],
  ['--color-ash', '#d7d7d7'],
  ['--color-neon', '#00ff26'],
  ['--color-cyan-veil', '#7df0f8'],
  [
    '--font-eb-garamond',
    `'EB Garamond', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  ],
  [
    '--font-geist',
    `'Geist', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
  ],
  ['--font-ui-monospace', "'ui-monospace', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"],
  ['--text-caption', '10px'],
  ['--leading-caption', '1.5'],
  ['--tracking-caption', '0px'],
  ['--text-body', '16px'],
  ['--leading-body', '1.5'],
  ['--tracking-body', '-0.01px'],
  ['--text-subheading', '20px'],
  ['--leading-subheading', '1.38'],
  ['--tracking-subheading', '-0.018px'],
  ['--text-heading-sm', '28px'],
  ['--leading-heading-sm', '1.25'],
  ['--tracking-heading-sm', '-0.025px'],
  ['--text-heading', '36px'],
  ['--leading-heading', '1.2'],
  ['--tracking-heading', '-0.031px'],
  ['--text-heading-lg', '48px'],
  ['--leading-heading-lg', '1.13'],
  ['--tracking-heading-lg', '-0.036px'],
  ['--text-display', '80px'],
  ['--leading-display', '1.02'],
  ['--tracking-display', '-0.96px'],
  ['--font-weight-light', '300'],
  ['--font-weight-regular', '400'],
  ['--font-weight-medium', '500'],
  ['--font-weight-semibold', '600'],
  ['--spacing-4', '4px'],
  ['--spacing-5', '5px'],
  ['--spacing-6', '6px'],
  ['--spacing-7', '7px'],
  ['--spacing-8', '8px'],
  ['--spacing-9', '9px'],
  ['--spacing-10', '10px'],
  ['--spacing-12', '12px'],
  ['--spacing-14', '14px'],
  ['--spacing-16', '16px'],
  ['--spacing-18', '18px'],
  ['--spacing-20', '20px'],
  ['--spacing-28', '28px'],
  ['--spacing-32', '32px'],
  ['--spacing-40', '40px'],
  ['--spacing-73', '73px'],
  ['--page-max-width', '1200px'],
  ['--section-gap', '64px'],
  ['--card-padding', '24px'],
  ['--element-gap', '8px'],
  ['--radius-md', '4px'],
  ['--radius-lg', '8px'],
  ['--radius-xl', '12px'],
  ['--radius-2xl', '16px'],
  ['--radius-3xl', '24px'],
  ['--radius-3xl-2', '32px'],
  ['--radius-full', '110.25px'],
  ['--radius-cards', '12px'],
  ['--radius-pills', '9999px'],
  ['--radius-inputs', '8px'],
  ['--radius-buttons', '4px'],
  ['--radius-feature-cards', '24px'],
  ['--radius-product-mockup', '16px'],
  [
    '--shadow-subtle',
    'rgb(12, 68, 161) 0px 0px 0px 0.5px, rgb(2, 44, 112) 0px -1px 0px 0px inset, rgb(129, 182, 255) 0px 0.5px 0px 0px inset'
  ],
  ['--shadow-subtle-2', 'rgba(207, 226, 255, 0.24) 0px 0px 0px 1px, rgba(255, 255, 255, 0.8) 0px -0.5px 0px 0px'],
  ['--shadow-subtle-3', 'rgba(255, 255, 255, 0.25) 0px -1px 0px 0px'],
  ['--shadow-lg', 'rgba(0, 0, 0, 0.05) 0px 2px 20px -1px inset'],
  [
    '--shadow-lg-2',
    'rgba(148, 172, 243, 0.4) 20px 20px 24px 0px, rgba(191, 229, 251, 0.4) -3px -3px 4px 0px inset, rgba(19, 26, 228, 0.1) 4px 4px 4px 0px inset'
  ],
  ['--surface-canvas', '#ffffff'],
  ['--surface-frost-tint', '#f3f8ff'],
  ['--surface-vapor-layer', '#edeef2'],
  ['--surface-bone-border', '#e4e4e7']
];

// ---- parsing ---------------------------------------------------------------

const unlayered = (selector) => TOKENS.rules.filter((r) => r.selector === selector && r.context.length === 0);
const pairs = (rule) => rule.declarations.map((d) => [d.prop, d.value]);

const ROOT_VARS = new Map(unlayered(':root').flatMap(pairs));
const THEMES = {
  overlay: new Map([...ROOT_VARS, ...unlayered('.theme-overlay').flatMap(pairs)]),
  workspace: new Map([...ROOT_VARS, ...unlayered('.theme-workspace').flatMap(pairs)])
};

// Every rule for a theme, including the system-setting overrides inside @media.
const themeRules = (theme) => TOKENS.rules.filter((r) => r.selector === `.theme-${theme}`);

// ---- colour maths ----------------------------------------------------------

// Splits at top-level commas (not inside parentheses).
function args(text) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    else if (text[i] === ')') depth--;
    else if (text[i] === ',' && depth === 0) {
      out.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(text.slice(start).trim());
  return out;
}

/** Resolves a token value to { r, g, b, a } (0–255, alpha 0–1) through var() and color-mix(). */
function color(value, vars, seen = new Set()) {
  const v = value.trim();
  let m;
  if ((m = /^var\(\s*(--[\w-]+)\s*(?:,(.*))?\)$/s.exec(v))) {
    assert.ok(!seen.has(m[1]), `circular ${m[1]}`);
    const next = vars.get(m[1]) ?? m[2];
    assert.ok(next !== undefined, `undefined ${m[1]}`);
    return color(next, vars, new Set([...seen, m[1]]));
  }
  if (v === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if ((m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v))) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return { r, g, b, a: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1 };
  }
  if ((m = /^rgba?\((.*)\)$/s.exec(v))) {
    const [r, g, b, a = '1'] = m[1].split(/[\s,/]+/).filter(Boolean);
    return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
  }
  if ((m = /^color-mix\((.*)\)$/s.exec(v))) {
    const [space, ...parts] = args(m[1]);
    assert.equal(space, 'in srgb', `only srgb mixing: ${v}`);
    assert.equal(parts.length, 2, v);
    const stops = parts.map((p) => {
      const pm = /^(.*?)\s+(\d+(?:\.\d+)?)%$/s.exec(p);
      return pm ? { c: color(pm[1], vars, seen), p: Number(pm[2]) / 100 } : { c: color(p, vars, seen), p: null };
    });
    if (stops[0].p === null && stops[1].p === null) stops[0].p = stops[1].p = 0.5;
    else if (stops[0].p === null) stops[0].p = 1 - stops[1].p;
    else if (stops[1].p === null) stops[1].p = 1 - stops[0].p;
    // CSS Color 5: premultiplied interpolation; a sum under 100% scales the alpha down.
    const sum = stops[0].p + stops[1].p;
    const w = stops.map((s) => s.p / sum);
    const a = stops[0].c.a * w[0] + stops[1].c.a * w[1];
    const ch = (k) => (a ? (stops[0].c[k] * stops[0].c.a * w[0] + stops[1].c[k] * stops[1].c.a * w[1]) / a : 0);
    return { r: ch('r'), g: ch('g'), b: ch('b'), a: a * Math.min(1, sum) };
  }
  throw new Error(`cannot resolve colour "${v}"`);
}

/** The colour inside a shorthand such as `2px solid var(--x)`. */
function colorIn(value, vars) {
  const found = args(value.replace(/\s+(?![^(]*\))/g, ',')).flatMap((part) => {
    try {
      return [color(part, vars)];
    } catch {
      return [];
    }
  });
  assert.equal(found.length, 1, `expected one colour in "${value}"`);
  return found[0];
}

/** `fg` alpha-composited over an opaque `bg`. */
function over(fg, bg) {
  assert.equal(bg.a, 1, 'backdrop must be opaque');
  const mix = (k) => fg[k] * fg.a + bg[k] * (1 - fg.a);
  return { r: mix('r'), g: mix('g'), b: mix('b'), a: 1 };
}

function luminance({ r, g, b }) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2 contrast ratio of `fg` on an opaque `bg`. */
function contrast(fg, bg) {
  const [a, b] = [luminance(over(fg, bg)), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const WHITE = { r: 255, g: 255, b: 255, a: 1 };
const BLACK = { r: 0, g: 0, b: 0, a: 1 };
const named = (name) => color(`var(--color-${name})`, ROOT_VARS);
const token = (theme, name) => color(`var(${name})`, THEMES[theme]);
// The overlay is translucent, so its text is judged on the surface over a white and a black desktop.
const overlaySurfaces = () => [WHITE, BLACK].map((desk) => over(token('overlay', '--bg-surface'), desk));

function atLeast(min, fg, bg, label) {
  const ratio = contrast(fg, bg);
  assert.ok(ratio >= min, `${label}: ${ratio.toFixed(2)}:1, needs ${min}:1`);
}

const sameColor = (a, b) => ['r', 'g', 'b', 'a'].every((k) => Math.abs(a[k] - b[k]) < 1e-9);

// ---- tests -----------------------------------------------------------------

test('tokens.css opens with the verbatim Cluely :root block and its provenance', () => {
  assert.equal(CLUELY.length, 87);
  const first = TOKENS.rules[0];
  assert.equal(first.selector, ':root');
  assert.deepEqual(first.context, []);
  assert.deepEqual(pairs(first), CLUELY);
  const header = TOKENS_CSS.slice(0, TOKENS_CSS.indexOf(':root'));
  const comments = header.match(/\/\*[\s\S]*?\*\//g) || [];
  assert.ok(
    comments.some((c) => c.includes(PROVENANCE)),
    'the header comment must cite the Cluely source'
  );
});

test('the 52 DTCG type steps each have a -track partner', () => {
  const ts = [...ROOT_VARS].filter(([name]) => name.startsWith('--ts-'));
  const steps = ts.filter(([name]) => !name.endsWith('-track'));
  const tracks = new Map(ts.filter(([name]) => name.endsWith('-track')));
  assert.equal(steps.length, 52);
  assert.equal(tracks.size, 52);
  for (const [name, value] of steps) {
    assert.match(value, /^[1-9]00 \d+px\/\d+(?:\.\d+)? var\(--font-(?:geist|eb-garamond|ui-monospace)\)$/, name);
    assert.ok(tracks.has(`${name}-track`), `${name} has no ${name}-track`);
    assert.match(tracks.get(`${name}-track`), /^-?\d*\.?\d+em$/, `${name}-track`);
  }
  for (const name of tracks.keys()) assert.ok(ROOT_VARS.has(name.replace(/-track$/, '')), `${name} has no step`);
});

test('the overlay and workspace themes declare the same properties', () => {
  const props = (theme) => {
    const rules = unlayered(`.theme-${theme}`);
    assert.equal(rules.length, 1, `one base .theme-${theme} rule`);
    const names = rules[0].declarations.map((d) => d.prop);
    assert.equal(new Set(names).size, names.length, `.theme-${theme} repeats a property`);
    return names;
  };
  const overlay = props('overlay');
  const workspace = props('workspace');
  assert.deepEqual([...overlay].sort(), [...workspace].sort());
  // System-setting overrides (@media) may only change properties both themes declare.
  for (const theme of ['overlay', 'workspace']) {
    for (const rule of themeRules(theme).filter((r) => r.context.length)) {
      for (const d of rule.declarations) assert.ok(overlay.includes(d.prop), `${rule.context} ${d.prop}`);
    }
  }
});

test('each theme puts Steel, Fog and Mist only in their approved roles', () => {
  const steel = named('steel');
  const fog = named('fog');
  const mist = named('mist');
  const is = (theme, name, expected, label) =>
    assert.ok(sameColor(token(theme, name), expected), `${theme} ${name} is ${label}`);
  // Props that name a palette colour directly, in base and @media rules alike.
  const using = (theme, colorName) => {
    const hex = ROOT_VARS.get(`--color-${colorName}`);
    return themeRules(theme)
      .flatMap((r) => r.declarations)
      .filter((d) => d.value.includes(`var(--color-${colorName})`) || d.value.toLowerCase().includes(hex))
      .map((d) => d.prop);
  };

  // Workspace (light): Fog fails 4.5:1 on Chalk, so it is disabled text only; Mist is
  // decorative, so it only draws icons that sit beside a label.
  assert.deepEqual([...new Set(using('workspace', 'fog'))], ['--text-disabled']);
  assert.deepEqual([...new Set(using('workspace', 'mist'))], ['--icon']);
  for (const name of ['--text-2', '--text-3', '--icon-solo']) is('workspace', name, steel, 'Steel');

  // Overlay (dark): the same three greys, with the roles flipped for a dark surface. Steel
  // (2.88:1 on Carbon) is disabled text only, and Fog (4.15:1) only draws icons.
  assert.deepEqual([...new Set(using('overlay', 'steel'))], ['--text-disabled']);
  assert.deepEqual([...new Set(using('overlay', 'fog'))], ['--icon', '--icon-solo']);
  is('overlay', '--text-2', mist, 'Mist');
  is('overlay', '--icon', fog, 'Fog');
  is('overlay', '--icon-solo', fog, 'Fog');
  is('overlay', '--text-disabled', steel, 'Steel');
});

// Every --text-* role a theme declares, except disabled text (WCAG exempts it).
function textRoles(theme) {
  const names = unlayered(`.theme-${theme}`)
    .flatMap((r) => r.declarations.map((d) => d.prop))
    .filter((name) => name.startsWith('--text-') && name !== '--text-disabled');
  for (const core of ['--text-1', '--text-2']) assert.ok(names.includes(core), `${theme} declares ${core}`);
  return names;
}

test('workspace text roles reach 4.5:1 on Chalk, Frost and Vapor', () => {
  for (const surface of ['chalk', 'frost', 'vapor']) {
    for (const name of textRoles('workspace')) {
      atLeast(4.5, token('workspace', name), named(surface), `workspace ${name} on ${surface}`);
    }
  }
});

test('overlay text roles reach 4.5:1 on the overlay surface over white and black', () => {
  for (const surface of overlaySurfaces()) {
    for (const name of textRoles('overlay')) atLeast(4.5, token('overlay', name), surface, `overlay ${name}`);
  }
});

test('icon-only strokes reach 3:1 in both themes', () => {
  for (const surface of ['chalk', 'frost', 'vapor']) {
    atLeast(3, token('workspace', '--icon-solo'), named(surface), `workspace --icon-solo on ${surface}`);
  }
  for (const surface of overlaySurfaces()) atLeast(3, token('overlay', '--icon-solo'), surface, 'overlay --icon-solo');
});

test('the focus ring reaches 3:1 on Chalk and on Carbon', () => {
  const ring = colorIn(ROOT_VARS.get('--focus-ring'), ROOT_VARS);
  assert.ok(sameColor(ring, named('signal-blue')), 'the focus ring is Signal Blue');
  atLeast(3, ring, named('chalk'), 'focus ring on Chalk');
  atLeast(3, ring, named('carbon'), 'focus ring on Carbon');
});

test('the ok colour reaches 4.5:1 on its theme surface', () => {
  atLeast(4.5, token('workspace', '--ok'), token('workspace', '--bg-surface'), 'workspace --ok');
  for (const surface of overlaySurfaces()) atLeast(4.5, token('overlay', '--ok'), surface, 'overlay --ok');
});

test('hero text reaches 4.5:1 on both stops of the hero gradient', () => {
  const stops = ROOT_VARS.get('--gradient-hero').match(/#[0-9a-f]{6}\b/gi);
  assert.equal(stops.length, 2, 'two gradient stops');
  for (const stop of stops) atLeast(4.5, named('chalk'), color(stop, ROOT_VARS), `Chalk on ${stop}`);
});

test('the CTA label meets 4.5:1, or is exactly the documented Signal Blue exception', () => {
  const ratio = contrast(color('var(--on-accent)', ROOT_VARS), color('var(--accent-fill)', ROOT_VARS));
  if (ratio >= 4.5) return;
  // Approval item 1 keeps the exact Signal Blue (#3c83f6) CTA: white on it is 3.64:1, a known
  // AA exception for the 14px/500 label, recorded under "Contrast exceptions" in
  // docs/design/README.md. Any other fill below 4.5:1 is a new exception and fails here.
  assert.equal(Math.round(ratio * 100) / 100, 3.64, `CTA label is ${ratio.toFixed(2)}:1`);
  assert.ok(sameColor(color('var(--accent-fill)', ROOT_VARS), named('signal-blue')));
});

test('styles.css imports the font and token layers first, in that order', () => {
  const styles = parseCss(fs.readFileSync(path.join(RENDERER, 'styles.css'), 'utf8'));
  const imports = styles.statements
    .filter((s) => s.name === 'import')
    .map((s) => /^url\(\s*['"]?([^'")]+)['"]?\s*\)\s+layer\(\s*([\w-]+)\s*\)$/.exec(s.prelude))
    .map((m) => m && `${m[1]} → ${m[2]}`);
  assert.deepEqual(imports.slice(0, 2), ['css/fonts.css → fonts', 'css/tokens.css → tokens']);
});
