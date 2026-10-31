// The redesigned overlay: fonts and stylesheets load, the empty states, error
// fixes, the session shortcut, the layout under load, and the Escape order.
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('./fixtures');
const { closeSettings, startMockProvider } = require('./helpers');

/** Sends `channel` from main to the overlay window, as the global shortcuts do. */
function sendToOverlay(app, channel) {
  return app.evaluate(({ BrowserWindow }, name) => {
    const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('/renderer/index.html'));
    win.webContents.send(name, {});
  }, channel);
}

async function ask(page, question) {
  await page.fill('#input', question);
  await page.press('#input', 'Enter');
}

test('Geist and every layer stylesheet load, and the setup state shows without a provider', async ({ launch }) => {
  const { page } = await launch();
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const faces = await document.fonts.load('500 13px Geist');
    const imports = [];
    const walk = (sheet) => {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSImportRule) {
          imports.push({ href: rule.href, rules: rule.styleSheet ? rule.styleSheet.cssRules.length : 0 });
          if (rule.styleSheet) walk(rule.styleSheet);
        }
      }
    };
    Array.from(document.styleSheets).forEach(walk);
    return { faces: faces.length, check: document.fonts.check('500 13px Geist'), imports };
  });
  expect(fonts.faces).toBeGreaterThan(0);
  expect(fonts.check).toBe(true);
  expect(fonts.imports.length).toBeGreaterThan(0);
  for (const sheet of fonts.imports) expect(sheet.rules, sheet.href).toBeGreaterThan(0);

  await expect(page.locator('.es-setup')).toBeVisible();
  await expect(page.locator('.es-setup')).toContainText('Connect an AI provider');
  await expect(page.locator('.es-ready')).toBeHidden();
});

test('with a provider the ready state shows, and the main window draws no svg', async ({ launch }) => {
  const mock = await startMockProvider(() => 'ok');
  try {
    // A provider that can also transcribe: the custom endpoint doubles as speech-to-text.
    const { page } = await launch({ settings: { ...mock.settings, sttProvider: 'custom' } });
    await expect(page.locator('.es-ready')).toBeVisible();
    await expect(page.locator('.es-ready')).toContainText('Ready when you are');
    await expect(page.locator('.es-setup')).toBeHidden();
    expect(await page.locator('svg').count()).toBe(0);
    await page.click('#tb-settings-btn');
    await expect(page.locator('#settings')).toBeVisible();
    expect(await page.locator('svg').count()).toBe(0);
  } finally {
    await mock.close();
  }
});

test('an error offers the fix that applies, and Try again sends the question again', async ({ launch }) => {
  let failing = true;
  const mock = await startMockProvider(() => 'Second time lucky', { status: () => (failing ? 500 : 200) });
  try {
    const { page } = await launch({ settings: mock.settings });

    // Recap with nothing captured asks for a session.
    await page.click('.act[data-mode="recap"]');
    await expect(page.locator('.ai-fix').last()).toHaveText('Start session');

    // A provider failure offers Try again, which re-sends the same question.
    await ask(page, 'What is the capital of France?');
    await expect(page.locator('.ai-fix').last()).toHaveText('Try again');
    const sent = mock.requests.length;
    expect(sent).toBeGreaterThan(0);
    failing = false;
    await page.locator('.ai-fix').last().click();
    await expect(page.locator('#messages')).toContainText('Second time lucky');
    expect(mock.requests.length).toBeGreaterThan(sent);
  } finally {
    await mock.close();
  }
});

test('the session shortcut starts and ends a session', async ({ launch }) => {
  const mock = await startMockProvider(() => 'ok');
  try {
    const { app, page } = await launch({ settings: mock.settings });
    const stop = page.locator('#stop-btn');
    await expect(stop).not.toHaveClass(/\bactive\b/);
    await sendToOverlay(app, 'session:toggle');
    await expect(stop).toHaveClass(/\bactive\b/);
    await sendToOverlay(app, 'session:toggle');
    await expect(stop).not.toHaveClass(/\bactive\b/);
  } finally {
    await mock.close();
  }
});

test('twenty answers keep the composer in the window, and the sidebar only takes clicks when open', async ({
  launch
}) => {
  const answer = ['Here is the answer.', '', '- one point', '- another point', '- a third point'].join('\n');
  const mock = await startMockProvider(() => answer);
  try {
    const { page } = await launch({ settings: mock.settings });
    for (let i = 1; i <= 20; i++) {
      await ask(page, `Question ${i}?`);
      await expect.poll(() => mock.requests.length).toBe(i);
      await expect(page.locator('#messages')).toHaveAttribute('aria-busy', 'false');
    }
    const layout = await page.evaluate(() => {
      const send = document.querySelector('#send-btn').getBoundingClientRect();
      const hit = document.elementFromPoint(send.left + send.width / 2, send.top + send.height / 2);
      return {
        composerBottom: document.querySelector('#composer').getBoundingClientRect().bottom,
        sendOnTop: !!hit && !!hit.closest('#send-btn')
      };
    });
    expect(layout.composerBottom).toBeLessThanOrEqual(600);
    expect(layout.sendOnTop).toBe(true);

    const sidebar = page.locator('#transcript-sidebar');
    expect(await sidebar.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('none');
    await page.click('#history-btn');
    await expect(sidebar).toHaveClass(/\bopen\b/);
    await expect.poll(() => sidebar.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe('auto');
  } finally {
    await mock.close();
  }
});

test('a question sent while an answer is on its way stays in the box until it can be sent', async ({ launch }) => {
  let release = () => {};
  const held = new Promise((resolve) => (release = resolve));
  const mock = await startMockProvider(() => (mock.requests.length === 1 ? held.then(() => 'First') : 'Second'));
  try {
    const { page } = await launch({ settings: mock.settings });
    await ask(page, 'First question?');
    await expect.poll(() => mock.requests.length).toBe(1);
    await expect(page.locator('#messages')).toHaveAttribute('aria-busy', 'true');

    await ask(page, 'Second question?');
    await expect(page.locator('#input')).toHaveValue('Second question?');
    await expect(page.locator('#toast')).toContainText('Still answering');
    expect(mock.requests.length).toBe(1);

    release();
    await expect(page.locator('#messages')).toHaveAttribute('aria-busy', 'false');
    await page.press('#input', 'Enter');
    await expect.poll(() => mock.requests.length).toBe(2);
    await expect(page.locator('#input')).toHaveValue('');
    await expect(page.locator('#messages')).toContainText('Second');
  } finally {
    await mock.close();
  }
});

test('Escape clears the composer, then closes the opacity popover, then the sidebar', async ({ launch }) => {
  const { page } = await launch();
  const popover = page.locator('#opacity-popover');
  const sidebar = page.locator('#transcript-sidebar');
  await page.click('#history-btn');
  await page.click('#opacity-btn');
  await expect(popover).toBeVisible();
  await expect(page.locator('#opacity-btn')).toHaveAttribute('aria-expanded', 'true');

  await page.fill('#input', 'a draft');
  await page.press('#input', 'Escape');
  await expect(page.locator('#input')).toHaveValue('');
  await expect(popover).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(popover).toBeHidden();
  await expect(page.locator('#opacity-btn')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#opacity-btn')).toBeFocused();
  await expect(sidebar).toHaveClass(/\bopen\b/);

  await page.keyboard.press('Escape');
  await expect(sidebar).not.toHaveClass(/\bopen\b/);
  await expect(page.locator('#history-btn')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#history-btn')).toBeFocused();
});

test('arrow keys move between Settings tabs without saving', async ({ launch }) => {
  const { page, profile } = await launch();
  const file = path.join(profile, 'onscreenly-data.json');
  await page.click('#tb-settings-btn');
  await page.focus('.s-tab.on');
  const before = fs.statSync(file).mtimeMs;
  const tabs = await page.locator('.s-tab').evaluateAll((els) => els.map((el) => el.dataset.tab));
  for (const tab of [...tabs.slice(1), tabs[0]]) {
    await page.keyboard.press('ArrowRight');
    await expect(page.locator(`.s-tab[data-tab="${tab}"]`)).toBeFocused();
    await expect(page.locator(`.s-tab[data-tab="${tab}"]`)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(`.s-tab-pane[data-pane="${tab}"]`)).toBeVisible();
  }
  expect(fs.statSync(file).mtimeMs).toBe(before);
  await closeSettings(page);
});

test('Send stops an answer that is on its way, and so does Escape', async ({ launch }) => {
  let release = () => {};
  const mock = await startMockProvider(() => new Promise((resolve) => (release = () => resolve('Too late'))));
  try {
    const { page } = await launch({ settings: mock.settings });
    await ask(page, 'First question?');
    await expect(page.locator('#send-btn')).toHaveAttribute('aria-label', 'Stop the answer');
    await page.click('#send-btn');
    await expect(page.locator('.ai-note').last()).toHaveText('Stopped.');
    await expect(page.locator('#messages')).toHaveAttribute('aria-busy', 'false');
    await expect(page.locator('#send-btn')).not.toHaveAttribute('aria-label', /.*/);
    release();

    await ask(page, 'Second question?');
    await expect(page.locator('#messages')).toHaveAttribute('aria-busy', 'true');
    await page.keyboard.press('Escape');
    await expect(page.locator('.ai-note')).toHaveCount(2);
    await expect(page.locator('#messages')).toHaveAttribute('aria-busy', 'false');
    release();
  } finally {
    await mock.close();
  }
});

test('a rejected API key offers Open settings, not Try again', async ({ launch }) => {
  const mock = await startMockProvider(() => 'never', { status: 401 });
  try {
    const { page } = await launch({ settings: mock.settings });
    await ask(page, 'Hello?');
    await expect(page.locator('.ai-error-msg').last()).toContainText('rejected the API key (401)');
    await expect(page.locator('.ai-fix').last()).toHaveText('Open settings');
  } finally {
    await mock.close();
  }
});

test('a global shortcut can be changed in Settings, and every hint follows it', async ({ launch }) => {
  const { page } = await launch();
  // Hints read ⌘⌥↵ on macOS and Ctrl+Alt+Enter elsewhere.
  const mac = process.platform === 'darwin';
  const sayDefault = mac ? '⌘⌥↵' : 'Ctrl+Alt+Enter';
  const sayNew = mac ? '⌘⌥J' : 'Ctrl+Alt+J';
  await expect(page.locator('#say-shortcut-hint')).toHaveText(sayDefault);
  await page.click('#tb-settings-btn');
  await page.click('.s-tab[data-tab="appearance"]');
  await page.click('#shortcut-say');
  await expect(page.locator('#shortcut-say')).toHaveText('Press keys…');
  await page.keyboard.press('Control+Alt+KeyJ');
  await expect(page.locator('#shortcut-note')).toHaveText(/^Saved/);
  await expect(page.locator('#shortcut-say')).toHaveText(sayNew);
  await expect(page.locator('#say-shortcut-hint')).toHaveText(sayNew);
  // One already used elsewhere is refused.
  await page.click('#shortcut-say');
  await page.keyboard.press('Control+Shift+KeyL');
  await expect(page.locator('#shortcut-note')).toHaveText(/Already used for listening/);
  await page.click('#shortcut-reset');
  await expect(page.locator('#say-shortcut-hint')).toHaveText(sayDefault);
});

test('typed model names survive switching provider chips, and the answer log takes keyboard focus', async ({
  launch
}) => {
  const { page } = await launch();
  await page.click('#tb-settings-btn');
  await page.click('#provider-seg button[data-provider="openai"]');
  await page.fill('#model-fast', 'my-fast-model');
  await page.click('#provider-seg button[data-provider="ollama"]');
  await page.click('#provider-seg button[data-provider="openai"]');
  await expect(page.locator('#model-fast')).toHaveValue('my-fast-model');
  await closeSettings(page);
  await expect(page.locator('#messages')).toHaveAttribute('tabindex', '0');
});

test('the Knowledge test search says to choose a vault when there is none', async ({ launch }) => {
  const { page } = await launch();
  await page.click('#tb-settings-btn');
  await page.click('.s-tab[data-tab="knowledge"]');
  await page.fill('#knowledge-test', 'checkout latency');
  await expect(page.locator('#knowledge-results')).toContainText('Choose a vault folder first.');
});
