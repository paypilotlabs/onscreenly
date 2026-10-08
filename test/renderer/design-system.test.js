// Design system. Part 1: the tokens in renderer/css/tokens.css. Every check parses the
// file's text, and the contrast checks compute WCAG ratios from the token values, so a
// changed value is judged by the same rules the design was approved under.
// Part 2 (at the end): the rules every other stylesheet follows (docs/design/README.md).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { parseCss, readCss, rendererCssFiles, stripComments, RENDERER } = require('../helpers/css');
const { parseComplex, splitSelectorList } = require('../helpers/markup');

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

// ---- part 2: the stylesheets -------------------------------------------------

const LAYERS = ['fonts', 'tokens', 'base', 'layout', 'controls', 'overlay', 'workspace', 'utilities', 'motion'];
const SHEETS = rendererCssFiles().map(readCss);
const TOKENS_FILE = 'renderer/css/tokens.css';
const OTHERS = SHEETS.filter((sheet) => sheet.name !== TOKENS_FILE);

/** Every declaration in a sheet, with where it is: style rules, then at-rule blocks (keyframe steps too). */
function declarations(sheet) {
  const out = [];
  for (const rule of sheet.rules) {
    for (const d of rule.declarations)
      out.push({ ...d, selector: rule.selector, context: rule.context, line: rule.line });
  }
  for (const block of sheet.atBlocks) {
    const inner = block.body.replace(/[^{}]*\{([^{}]*)\}/g, ';$1;');
    for (const m of inner.matchAll(/([-\w]+)\s*:\s*([^;{}]+)/g)) {
      out.push({
        prop: m[1],
        value: m[2].trim(),
        important: /!\s*important/i.test(m[2]),
        selector: `@${block.name}`,
        context: block.context,
        line: block.line
      });
    }
  }
  return out;
}
const where = (sheet, d) => `${sheet.name}:${d.line} ${d.selector} { ${d.prop}: ${d.value} }`;

// Value text with url(…) and quoted strings removed, so a data: URL or a font name never counts.
const bare = (value) =>
  value.replace(/url\((?:[^()]|\([^()]*\))*\)/g, 'url()').replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""');

// CSS named colours (CSS Color 4). transparent and currentColor are not literals; system colours
// (Canvas, CanvasText, Highlight, …) are allowed for forced-colors mode.
const NAMED_COLORS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown ' +
    'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
    'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid ' +
    'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
    'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ' +
    'ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
    'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
    'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise ' +
    'mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab ' +
    'orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru ' +
    'pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown ' +
    'seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan ' +
    'teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
  ).split(' ')
);

function colourLiterals(value) {
  const v = bare(value);
  return [
    ...[...v.matchAll(/#[0-9a-f]{3,8}\b/gi)].map((m) => m[0]),
    ...[...v.matchAll(/\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color|color-mix)\(/gi)].map((m) => m[0]),
    ...[...v.matchAll(/(?<![\w-])[a-z]+(?![\w-])/gi)].map((m) => m[0]).filter((w) => NAMED_COLORS.has(w.toLowerCase()))
  ];
}

/** Complex selectors split into compounds (pseudo-classes and pseudo-elements kept as text). */
const compounds = (selector) => splitSelectorList(selector).map((s) => parseComplex(s).map((p) => p.compound));

test('styles.css holds only the layer order and one @import per layer, each to an existing file', () => {
  const file = path.join(RENDERER, 'styles.css');
  const sheet = readCss(file);
  assert.deepEqual(sheet.rules, [], 'styles.css has style rules');
  assert.deepEqual(sheet.atBlocks, [], 'styles.css has at-rule blocks');
  const [order, ...imports] = sheet.statements;
  assert.equal(order.name, 'layer', 'the @layer order comes first');
  assert.deepEqual(
    order.prelude.split(',').map((s) => s.trim()),
    LAYERS
  );
  assert.deepEqual(
    imports.map((st) => `@${st.name} ${st.prelude}`),
    LAYERS.map((layer) => `@import url('css/${layer}.css') layer(${layer})`)
  );
  for (const layer of LAYERS) assert.ok(fs.existsSync(path.join(RENDERER, 'css', `${layer}.css`)), `css/${layer}.css`);
});

test('every var() names a property some stylesheet declares, or carries a fallback', () => {
  const declared = new Set(
    SHEETS.flatMap((sheet) => declarations(sheet).map((d) => d.prop)).filter((p) => p.startsWith('--'))
  );
  const missing = [];
  for (const sheet of SHEETS) {
    for (const d of declarations(sheet)) {
      for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)\s*(,)?/g)) {
        if (!m[2] && !declared.has(m[1])) missing.push(`${where(sheet, d)}: ${m[1]}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('no colour literal outside tokens.css: every colour is a token', () => {
  assert.ok(OTHERS.length >= 6, 'expected the layer files');
  const found = [];
  for (const sheet of OTHERS) {
    for (const d of declarations(sheet)) {
      const literals = colourLiterals(d.value);
      if (literals.length) found.push(`${where(sheet, d)} → ${literals.join(', ')}`);
    }
  }
  assert.deepEqual(found, []);
  // The scan itself: it must catch each kind of literal and skip urls and strings.
  assert.deepEqual(colourLiterals('1px solid #e4e4e7'), ['#e4e4e7']);
  assert.deepEqual(colourLiterals('0 0 0 1px rgba(0, 0, 0, 0.4)'), ['rgba(']);
  assert.deepEqual(colourLiterals('color-mix(in srgb, var(--x) 4%, transparent)'), ['color-mix(']);
  assert.deepEqual(colourLiterals('white'), ['white']);
  assert.deepEqual(colourLiterals('url("data:image/svg+xml,%3Csvg stroke=\'white\'%3E") center / 12px'), []);
  assert.deepEqual(colourLiterals('var(--line-strong) CanvasText currentColor transparent'), []);
});

test('no !important and no italics in any stylesheet', () => {
  for (const sheet of SHEETS) {
    assert.doesNotMatch(stripComments(sheet.css), /!\s*important/i, `${sheet.name} uses !important`);
    for (const d of declarations(sheet)) {
      if (d.prop === 'font-style' || d.prop === 'font') {
        assert.doesNotMatch(bare(d.value), /\b(?:italic|oblique)\b/i, where(sheet, d));
      }
    }
  }
});

// Cards, the error block, the banner, code blocks and the popover are 12px; the panel, the sidebar
// and every dialog 16px; the Welcome feature card 24px.
const CARD_RADII = ['var(--radius-cards)', 'var(--radius-product-mockup)', 'var(--radius-feature-cards)'];
const CARD_IDS = new Set(['panel', 'settings', 'onboard', 'consent', 'onscreenly-status']);
const CARD_CLASSES = new Set([
  'ai-card',
  'ai-error',
  'is-error',
  'transcript-sidebar',
  'opacity-popover',
  'ws-dialog',
  'perm-card',
  'k-result',
  'publik-card',
  'whisper-card',
  's-card',
  'ws-rows',
  'ob-features'
]);
const isCard = (c) =>
  c.pseudos.every((p) => !p.startsWith('::')) &&
  (CARD_IDS.has(c.id) || c.tag === 'pre' || c.classes.some((k) => CARD_CLASSES.has(k)));

test('radii come only from --radius-* tokens, and cards and dialogs use 12, 16 or 24', () => {
  const covered = new Set();
  const problems = [];
  for (const sheet of OTHERS) {
    for (const rule of sheet.rules) {
      for (const d of rule.declarations.filter((x) => /^border(?:-[a-z]+)*-radius$/.test(x.prop))) {
        const parts = d.value.split(/\s+(?![^(]*\))/);
        if (!parts.every((p) => /^var\(--radius-[\w-]+\)$/.test(p) || p === 'inherit')) {
          problems.push(`${sheet.name}:${rule.line} ${rule.selector}: ${d.value}`);
        }
        for (const list of compounds(rule.selector)) {
          const subject = list[list.length - 1];
          // 24px is the Welcome feature card's alone.
          if (d.value === 'var(--radius-feature-cards)' && !subject.classes.includes('ob-features'))
            problems.push(`${sheet.name}:${rule.line} ${rule.selector}: only the Welcome feature card is 24px`);
          if (!isCard(subject)) continue;
          covered.add(
            subject.id
              ? `#${subject.id}`
              : subject.tag === 'pre'
                ? 'pre'
                : `.${subject.classes.find((k) => CARD_CLASSES.has(k))}`
          );
          if (!CARD_RADII.includes(d.value))
            problems.push(`${sheet.name}:${rule.line} ${rule.selector}: a card or dialog at ${d.value}`);
        }
      }
    }
  }
  assert.deepEqual(problems, []);
  for (const sel of [
    '#panel',
    '.transcript-sidebar',
    '.ai-card',
    '.ai-error',
    '#onscreenly-status',
    'pre',
    '.ws-dialog',
    '.s-card',
    '.ob-features'
  ]) {
    assert.ok(covered.has(sel), `no radius found for ${sel}; is the check still looking at it?`);
  }
});

// The only shadows: the overlay's frame ring, a field's inset, the CTA's hover, the focus halo.
const SHADOWS = ['none', 'var(--frame)', 'var(--field-shadow)', 'var(--accent-hover-shadow)', 'var(--focus-halo)'];

// Splits at top-level commas.
const layersOf = (value) => value.split(/,(?![^(]*\))/).map((s) => s.trim());

test('box-shadows come from the allowlist, and none of them casts an outer blur', () => {
  const problems = [];
  for (const sheet of OTHERS) {
    for (const d of declarations(sheet).filter((x) => x.prop === 'box-shadow')) {
      if (!layersOf(d.value).every((layer) => SHADOWS.includes(layer))) problems.push(where(sheet, d));
    }
  }
  for (const sheet of OTHERS) {
    for (const d of declarations(sheet)) {
      if (/\bdrop-shadow\(/.test(d.value) || d.prop === 'text-shadow') problems.push(where(sheet, d));
    }
  }
  assert.deepEqual(problems, []);

  // Each allowed token, in both themes: every layer that is not inset has no blur.
  const resolve = (value, vars) => {
    const m = /^var\(\s*(--[\w-]+)\s*\)$/.exec(value.trim());
    return m ? resolve(vars.get(m[1]), vars) : value;
  };
  let layers = 0;
  for (const [theme, vars] of Object.entries(THEMES)) {
    for (const name of SHADOWS.filter((s) => s !== 'none')) {
      const value = resolve(name, vars);
      if (value === 'none') continue;
      for (const layer of layersOf(
        value.replace(/\b[\w-]+\((?:[^()]|\([^()]*\))*\)/g, (fn) => fn.replace(/,/g, ' '))
      )) {
        layers++;
        if (/\binset\b/.test(layer)) continue;
        const lengths = layer
          .replace(/\b[\w-]+\((?:[^()]|\([^()]*\))*\)/g, ' ')
          .split(/\s+/)
          .filter((t) => /^-?\d*\.?\d+(?:px)?$/.test(t));
        assert.ok(lengths.length >= 2, `${theme} ${name}: "${layer}"`);
        assert.equal(parseFloat(lengths[2] || '0'), 0, `${theme} ${name} casts a blurred outer shadow: "${layer}"`);
      }
    }
  }
  assert.ok(layers >= 8, 'found the shadow tokens');
});

test('backdrop-filter appears only on the three scrims', () => {
  const SCRIMS = new Set(['#settings-scrim', '#onboard-scrim', '#consent-scrim']);
  let seen = 0;
  for (const sheet of OTHERS) {
    for (const d of declarations(sheet).filter((x) => /^(?:-webkit-)?backdrop-filter$/.test(x.prop))) {
      seen++;
      for (const selector of splitSelectorList(d.selector)) assert.ok(SCRIMS.has(selector), where(sheet, d));
    }
  }
  assert.ok(seen > 0, 'the scrims blur what is behind them');
});

test('the serif display type and the hero gradient appear only on the onboarding welcome', () => {
  const ONLY = {
    '--type-display': '#onboard.is-hero #ob-title',
    '--type-display-track': '#onboard.is-hero #ob-title',
    '--gradient-hero': '#onboard.is-hero .ob-head'
  };
  const NEVER = [
    '--gradient-hero-alt',
    '--ts-5xl-3',
    '--ts-5xl-3-track',
    '--font-eb-garamond',
    '--color-neon',
    '--color-cyan-veil'
  ];
  for (const sheet of OTHERS) {
    for (const d of declarations(sheet)) {
      for (const m of d.value.matchAll(/var\(\s*(--[\w-]+)/g)) {
        if (m[1] in ONLY) assert.equal(d.selector, ONLY[m[1]], `${where(sheet, d)}: ${m[1]} only in ${ONLY[m[1]]}`);
        assert.ok(!NEVER.includes(m[1]), `${where(sheet, d)}: ${m[1]} is used outside tokens.css`);
      }
      if (sheet.name !== 'renderer/css/fonts.css' && /font-family|^font$/.test(d.prop)) {
        assert.doesNotMatch(d.value, /Garamond/i, where(sheet, d));
      }
    }
  }
  // Inside tokens.css, EB Garamond is only the 80px step and the display role built from it, and
  // the decorative neon and cyan-veil are never referenced.
  const garamond = declarations(readCss(path.join(RENDERER, 'css', 'tokens.css')))
    .filter((d) => d.value.includes('var(--font-eb-garamond)'))
    .map((d) => d.prop);
  assert.deepEqual(garamond.sort(), ['--ts-5xl-3', '--type-display']);
  assert.doesNotMatch(TOKENS_CSS, /var\(--color-(?:neon|cyan-veil)\)/);
});

test('system-setting @media blocks never target :root, html or body', () => {
  const SYSTEM = /prefers-reduced-motion|prefers-contrast|forced-colors|prefers-reduced-transparency/;
  let seen = 0;
  for (const sheet of SHEETS) {
    for (const rule of sheet.rules.filter((r) => r.context.some((c) => SYSTEM.test(c)))) {
      seen++;
      for (const list of compounds(rule.selector)) {
        for (const c of list) {
          assert.ok(
            c.tag !== 'html' && c.tag !== 'body' && !c.pseudos.includes(':root'),
            `${sheet.name}:${rule.line} ${rule.selector}`
          );
        }
      }
    }
  }
  assert.ok(seen > 0, 'found the system-setting rules');
});
