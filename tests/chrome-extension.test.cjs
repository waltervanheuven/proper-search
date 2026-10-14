const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');

test('Chrome loads the packaged extension and grants search access only after toolbar activation', { timeout: 60000 }, async t => {
  let context, profile, pendingImage;
  const server = http.createServer((req, res) => {
    if (req.url === '/slow-image') { pendingImage = res; return; }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (req.url === '/loading.html') {
      res.end('<!doctype html><html><body><p>Still loading</p><img src="/slow-image"></body></html>');
      return;
    }
    res.end(fs.readFileSync(path.join(__dirname, req.url === '/frame.html' ? 'frame.html' : 'fixture.html')));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await context?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    if (profile) fs.rmSync(profile, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  profile = fs.mkdtempSync(path.join(os.tmpdir(), 'proper-search-chrome-'));
  context = await chromium.launchPersistentContext(profile, {
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: ['--enable-unsafe-extension-debugging'],
    viewport: { width: 1280, height: 1000 },
  });
  t.diagnostic(`Chrome ${context.browser().version()}; isolated temporary profile`);
  const cdp = await context.browser().newBrowserCDPSession();
  const { id } = await cdp.send('Extensions.loadUnpacked', {
    path: path.resolve(__dirname, '../dist/Proper Search-chrome'),
  });
  const page = context.pages()[0];
  await page.goto(origin);
  const probe = await context.newPage();
  await probe.goto(`chrome-extension://${id}/popup.html`);
  await probe.locator('#retry').waitFor({ state: 'visible' });
  assert.match(await probe.locator('#status').textContent(), /Browser settings pages/);
  assert.doesNotMatch(await probe.locator('#status').textContent(), /Safari/);
  const manifest = await probe.evaluate(() => chrome.runtime.getManifest());
  assert.equal(manifest.name, 'Proper Search');
  assert.equal(manifest.action.default_popup, undefined, 'toolbar activation must not open a popup');
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'storage']);
  assert.equal(manifest.host_permissions, undefined);

  async function canInject(activePage) {
    await activePage.bringToFront();
    return probe.evaluate(async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => true });
        return true;
      } catch { return false; }
    });
  }
  async function activate(activePage) {
    await activePage.bringToFront();
    await activePage.evaluate(() => document.querySelector('[data-full-page-search-owned="panel"]')?.shadowRoot.activeElement?.blur());
    const { targetInfos } = await cdp.send('Target.getTargets', { filter: [{ type: 'tab' }, { exclude: true }] });
    const target = targetInfos.find(info => info.type === 'tab' && info.url === activePage.url());
    assert.ok(target, `Chrome tab target not found for ${activePage.url()}`);
    await cdp.send('Extensions.triggerAction', { id, targetId: target.targetId });
    // triggerAction returns before the asynchronous injection has finished.
    await activePage.waitForFunction(() => document.querySelector('[data-full-page-search-owned="panel"]')?.shadowRoot.activeElement?.id === 'query', undefined, { timeout: 3000 });
    const { targetInfos: afterActivation } = await cdp.send('Target.getTargets');
    assert.equal(afterActivation.some(info => info.type === 'page' && info.url === `chrome-extension://${id}/popup.html` && info.targetId !== probeTargetId), false, 'no toolbar popup');
  }

  const { targetInfos: probeTargets } = await cdp.send('Target.getTargets');
  const probeTargetId = probeTargets.find(info => info.type === 'page' && info.url === probe.url()).targetId;
  assert.equal(await canInject(page), false, 'no website access before toolbar activation');
  await activate(page);
  await page.getByRole('region', { name: 'Proper Search', exact: true }).waitFor();
  assert.equal(await page.getByRole('checkbox', { name: 'Show all results' }).isChecked(), true);
  const query = page.getByRole('searchbox', { name: 'Search page text' });
  await query.fill('aurora');
  await page.waitForFunction(() => document.querySelector('[data-full-page-search-owned="panel"]').shadowRoot.getElementById('count').textContent === '1 of 12 matches');
  assert.match(await page.locator('#hidden').textContent(), /^10 originally hidden/);
  await page.getByRole('checkbox', { name: 'Match case' }).check();
  await page.getByRole('checkbox', { name: 'Whole word' }).check();
  await page.getByRole('checkbox', { name: 'Show all results' }).uncheck();
  await probe.waitForFunction(async () => {
    const saved = await chrome.storage.local.get(['matchCase', 'wholeWord', 'showAllResults']);
    return saved.matchCase === true && saved.wholeWord === true && saved.showAllResults === false;
  });
  await query.fill('nested aurora');
  await page.waitForFunction(() => document.getElementById('outer').open && document.getElementById('inner').open);
  await activate(page);
  assert.equal(await query.count(), 1, 'reopening focuses the existing panel');
  await query.press('Escape');
  assert.equal(await page.locator('#outer').getAttribute('open'), null);
  assert.equal(await page.locator('#inner').getAttribute('open'), null);
  assert.equal(await page.locator('[data-full-page-search-owned="panel"]').count(), 0);
  await activate(page);
  await page.getByRole('checkbox', { name: 'Show all results' }).waitFor();
  assert.equal(await page.getByRole('checkbox', { name: 'Show all results' }).isChecked(), false, 'remember explicitly disabled option on reopen');
  assert.equal(await page.getByRole('checkbox', { name: 'Match case' }).isChecked(), true);
  assert.equal(await page.getByRole('checkbox', { name: 'Whole word' }).isChecked(), true);
  await query.press('Escape');

  const otherTab = await context.newPage();
  await otherTab.goto(origin);
  assert.equal(await canInject(otherTab), false, 'another tab has no grant');
  await page.goto(origin.replace('127.0.0.1', 'localhost'));
  assert.equal(await canInject(page), false, 'navigation to another website revokes access');
  await activate(page);
  await page.getByRole('region', { name: 'Proper Search', exact: true }).waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-full-page-search-owned="panel"]').shadowRoot.getElementById('all').checked);
  assert.equal(await page.getByRole('checkbox', { name: 'Match case' }).isChecked(), true, 'settings remembered on another website');
  assert.equal(await page.getByRole('checkbox', { name: 'Whole word' }).isChecked(), true);
  fs.mkdirSync(path.resolve(__dirname, '../test-results'), { recursive: true });
  await page.getByRole('searchbox', { name: 'Search page text' }).fill('aurora');
  await page.waitForFunction(() => document.querySelector('[data-full-page-search-owned="panel"]').shadowRoot.getElementById('count').textContent === '1 of 12 matches');
  await page.screenshot({ path: path.resolve(__dirname, '../test-results/chrome-extension.png') });
  await page.goto(`${origin}/loading.html`, { waitUntil: 'domcontentloaded' });
  assert.equal(await page.evaluate(() => document.readyState), 'interactive');
  await activate(page);
  await page.getByRole('region', { name: 'Proper Search', exact: true }).waitFor({ timeout: 3000 });
  assert.equal(await page.evaluate(() => document.readyState), 'interactive', 'panel opens while a page resource is still loading');
  pendingImage?.end();
});
