const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, webkit } = require('playwright');
let browser, server, origin;
before(async () => {
  server = http.createServer((req, res) => {
    const name = req.url === '/frame.html' ? 'frame.html' : 'fixture.html';
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(fs.readFileSync(path.join(__dirname, name)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = process.env.SEARCH_TEST_BROWSER === 'webkit' ? await webkit.launch() : await chromium.launch({ executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless:true });
});
after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });
async function pageFor(t, ui = false) {
  const page = await browser.newPage({ viewport:{width:1280,height:1000} });
  t.after(() => page.close());
  await page.goto(origin);
  await page.addScriptTag({ path:path.join(__dirname, '../extension/search-engine.js') });
  if (ui) await page.addScriptTag({ path:path.join(__dirname, '../extension/content.js') });
  else await page.evaluate(() => window.engine = new FullPageSearchEngine());
  return page;
}
test('indexes hidden, nested, shadow DOM and same-origin frame text without opening sections', async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(() => {
    const matches = engine.search('aurora');
    return { count:matches.length, hidden:matches.filter(m => m.hidden).length, highlighted:CSS.highlights.get(engine.highlightName).size, nested:document.getElementById('outer').open, frame:matches.some(m => m.range.startContainer.ownerDocument !== document), shadow:matches.some(m => m.range.startContainer.getRootNode() instanceof ShadowRoot) };
  });
  assert.equal(result.count, 12); // introduction + visible + 2 details + 6 hidden + shadow + frame
  assert.equal(result.hidden, 10);
  assert.equal(result.highlighted, 2);
  assert.equal(result.nested, false); assert.equal(result.frame, true); assert.equal(result.shadow, true);
});
test('matches across inline markup and normalized whitespace', async t => {
  const page = await pageFor(t);
  assert.deepEqual(await page.evaluate(() => ['an extraordinary discovery', 'distant constellation'].map(q => engine.search(q).map(m => m.range.toString()))), [['An extraordinary discovery'], ['distant\n    constellation']]);
});
test('search can start before the document body exists and retry as content arrives', async t => {
  const page = await pageFor(t);
  assert.deepEqual(await page.evaluate(() => {
    document.body.remove();
    const early = engine.search('aurora').length;
    const body = document.createElement('body'); body.textContent = 'A newly loaded aurora.';
    document.documentElement.append(body);
    return [early, engine.search('aurora').length];
  }), [0, 1]);
});
test('case, Unicode whole words and literal regex punctuation', async t => {
  const page = await pageFor(t);
  assert.deepEqual(await page.evaluate(() => [engine.search('orbit', {wholeWord:true}).length, engine.search('Orbit', {caseSensitive:true,wholeWord:true}).length, engine.search('café', {wholeWord:true}).length, engine.search('[a+b].').length, engine.search('星光',{wholeWord:true}).length]), [3,1,1,1,1]);
});
test('excludes executable markup, templates and editable field text', async t => {
  const page = await pageFor(t);
  assert.deepEqual(await page.evaluate(() => ['private sentinel','script sentinel','template sentinel'].map(q => engine.search(q).length)), [0,0,0]);
});
test('reveals nested details and restores both on close', async t => {
  const page = await pageFor(t);
  assert.deepEqual(await page.evaluate(() => {
    engine.search('nested aurora'); const revealed = engine.reveal(0);
    const opened = [document.getElementById('outer').open, document.getElementById('inner').open];
    engine.close(); return [revealed,...opened,document.getElementById('outer').open,document.getElementById('inner').open];
  }), [true,true,true,false,false]);
});
test('reveals and restores hidden attributes, styles, clipping, inert and shadow/frame details', async t => {
  const page = await pageFor(t);
  const results = await page.evaluate(() => {
    const queries = ['behind display','behind the hidden','behind visibility','clipped accordion','transparent aurora','inert aurora','in an open shadow','inside an embedded'];
    const snapshot = () => JSON.stringify([...document.body.querySelectorAll('*')].map(element => [element.tagName, [...element.attributes].map(attribute => [attribute.name, attribute.value]).sort()]));
    const before = snapshot();
    const results = queries.map(query => { engine.search(query); return engine.reveal(0); });
    engine.close();
    return {results, restored:before === snapshot(), shadowOpen:document.getElementById('component').shadowRoot.querySelector('details').open, frameOpen:document.getElementById('frame').contentDocument.querySelector('details').open};
  });
  assert.ok(results.results.every(Boolean)); assert.equal(results.restored, true); assert.equal(results.shadowOpen,false); assert.equal(results.frameOpen,false);
});
test('does not overwrite a page change when restoring a revealed style', async t => {
  const page = await pageFor(t);
  assert.equal(await page.evaluate(() => {
    engine.search('behind display'); engine.reveal(0);
    document.getElementById('display').style.setProperty('display','flex','important');
    engine.close(); return document.getElementById('display').style.display;
  }), 'flex');
});
test('reveals all matching containers together and restores shared, shadow and frame ancestors', async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(() => {
    const unrelated = document.createElement('details');
    unrelated.innerHTML = '<summary>Unrelated</summary><p>No matching text here.</p>';
    document.body.append(unrelated);
    const roots = [document, document.getElementById('component').shadowRoot, document.getElementById('frame').contentDocument];
    const snapshot = () => JSON.stringify(roots.map(root => [...root.querySelectorAll('*')].map(element => [element.tagName, [...element.attributes].map(attribute => [attribute.name, attribute.value]).sort()])));
    const before = snapshot();
    engine.search('aurora');
    engine.revealAll();
    const revealed = engine.matches.every(match => match.range.getClientRects().length > 0);
    const opened = roots.map(root => root.querySelector('details').open);
    const unrelatedOpen = unrelated.open;
    engine.revealAll(3);
    const keptOpen = roots.every(root => root.querySelector('details').open);
    engine.close();
    const restored = before === snapshot();
    engine.search('aurora'); engine.revealAll();
    document.getElementById('display').style.setProperty('display', 'flex', 'important');
    engine.close();
    return { revealed, opened, unrelatedOpen, keptOpen, restored, pageChange: document.getElementById('display').style.display };
  });
  assert.deepEqual(result, { revealed: true, opened: [true, true, true], unrelatedOpen: false, keptOpen: true, restored: true, pageChange: 'flex' });
});
test('caps broad searches and clears highlights without altering page text', async t => {
  const page = await pageFor(t);
  assert.deepEqual(await page.evaluate(() => {
    const p = document.createElement('p'); p.textContent = 'many '.repeat(2100); document.body.append(p);
    const text = document.body.textContent;
    engine.search('many'); const result = [engine.matches.length, engine.capped]; engine.close();
    return [...result, document.body.textContent === text, document.querySelectorAll('[data-full-page-search-owned]').length];
  }), [2000,true,true,0]);
});
test('reports inaccessible cross-origin frames', async t => {
  const page = await pageFor(t);
  await page.evaluate(origin => { const frame = document.createElement('iframe'); frame.src = origin.replace('127.0.0.1','localhost') + '/frame.html'; document.body.append(frame); }, origin);
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => { engine.search('aurora'); return engine.skippedFrames; }), 1);
});
test('in-page panel navigates, restores changes and injects only once', async t => {
  const page = await pageFor(t, true);
  await page.locator('input[aria-label="Search page text"]').fill('nested aurora');
  await page.waitForFunction(() => document.querySelector('[data-full-page-search-owned="panel"]').shadowRoot.getElementById('count').textContent === '1 of 1 matches');
  assert.equal(await page.locator('#outer').getAttribute('open'), '');
  await page.addScriptTag({ path:path.join(__dirname, '../extension/content.js') });
  assert.equal(await page.locator('input[aria-label="Search page text"]').count(),1);
  await page.locator('input[aria-label="Search page text"]').press('Escape');
  assert.equal(await page.locator('#outer').getAttribute('open'),null);
  assert.equal(await page.locator('input[aria-label="Search page text"]').count(),0);
});
test('panel opens without indexing a large page and waits to scan until a query is entered', async t => {
  const page = await pageFor(t);
  await page.evaluate(() => {
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < 25000; i++) {
      const p = document.createElement('p'); p.textContent = `Large page section ${i}`; fragment.append(p);
    }
    document.getElementById('dynamic').append(fragment);
    const start = performance.now(); engine.index();
    window.indexTime = performance.now() - start;
    const index = FullPageSearchEngine.prototype.index;
    window.indexCalls = 0;
    FullPageSearchEngine.prototype.index = function () { window.indexCalls++; return index.call(this); };
  });
  const source = fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8');
  const startup = await page.evaluate(source => {
    const start = performance.now(); (0, eval)(source);
    return { elapsed: performance.now() - start, indexing: window.indexTime, scans: window.indexCalls,
      focused: document.querySelector('[data-full-page-search-owned="panel"]').shadowRoot.activeElement?.id };
  }, source);
  assert.equal(startup.scans, 0, 'opening must not traverse the page');
  assert.equal(startup.focused, 'query');
  t.diagnostic(`25,000-node page: panel startup ${startup.elapsed.toFixed(1)} ms; deferred indexing ${startup.indexing.toFixed(1)} ms`);
  await page.getByRole('checkbox', { name: 'Whole word' }).check();
  assert.equal(await page.evaluate(() => window.indexCalls), 0, 'empty searches must not scan either');
  await page.getByRole('searchbox', { name: 'Search page text' }).fill('section 24999');
  await page.waitForFunction(() => document.querySelector('[data-full-page-search-owned="panel"]').shadowRoot.getElementById('count').textContent === '1 of 1 matches');
  assert.equal(await page.evaluate(() => window.indexCalls), 1);
});
test('saved options load without delaying the panel or overwriting an early checkbox change', async t => {
  const page = await pageFor(t);
  await page.evaluate(() => {
    const stored = { matchCase: false, wholeWord: true, showAllResults: false };
    const stale = { ...stored };
    let firstRead = true;
    window.browser = { storage: { local: {
      get: defaults => {
        if (!firstRead) return Promise.resolve({ ...defaults, ...stored });
        firstRead = false;
        return new Promise(resolve => { window.resolvePreferences = () => resolve(stale); });
      },
      set: values => { Object.assign(stored, values); return Promise.resolve(); }
    } } };
    window.storedPreferences = stored;
  });
  await page.addScriptTag({ path: path.join(__dirname, '../extension/content.js') });
  const matchCase = page.getByRole('checkbox', { name: 'Match case' });
  const wholeWord = page.getByRole('checkbox', { name: 'Whole word' });
  const showAll = page.getByRole('checkbox', { name: 'Show all results' });
  const query = page.getByRole('searchbox', { name: 'Search page text' });
  assert.equal(await showAll.isChecked(), true, 'default before storage responds');
  await matchCase.check();
  await query.fill('orbit');
  await page.waitForFunction(() => document.querySelector('[data-full-page-search-owned="panel"]').shadowRoot.getElementById('count').textContent === '1 of 2 matches');
  await page.evaluate(() => window.resolvePreferences());
  await page.waitForFunction(() => document.querySelector('[data-full-page-search-owned="panel"]').shadowRoot.getElementById('count').textContent === '1 of 1 matches');
  assert.equal(await matchCase.isChecked(), true, 'early user choice wins over the stale read');
  assert.equal(await wholeWord.isChecked(), true);
  assert.equal(await showAll.isChecked(), false, 'an explicitly saved false overrides the default');
  assert.deepEqual(await page.evaluate(() => window.storedPreferences), { matchCase: true, wholeWord: true, showAllResults: false });
  await query.press('Escape');
  await page.addScriptTag({ path: path.join(__dirname, '../extension/content.js') });
  assert.equal(await matchCase.isChecked(), true);
  assert.equal(await wholeWord.isChecked(), true);
  assert.equal(await showAll.isChecked(), false);
});
test('updates search when page content changes, without an observer feedback loop', async t => {
  const page = await pageFor(t, true);
  await page.locator('input[aria-label="Search page text"]').fill('newly loaded aurora');
  await page.waitForFunction(() => document.querySelector('[data-full-page-search-owned="panel"]').shadowRoot.getElementById('count').textContent === 'No matches');
  await page.locator('#add').click();
  await page.waitForFunction(() => document.querySelector('[data-full-page-search-owned="panel"]').shadowRoot.getElementById('count').textContent === '1 of 1 matches');
  const changes = await page.evaluate(async () => {
    let count = 0; const observer = new MutationObserver(() => count++); observer.observe(document,{subtree:true,childList:true,attributes:true});
    await new Promise(resolve => setTimeout(resolve,700)); observer.disconnect(); return count;
  });
  assert.equal(changes,0);
});
test('Show all results keeps matches revealed through navigation and live updates, and restores on uncheck, query change and close', async t => {
  const page = await pageFor(t, true);
  const query = page.getByRole('searchbox', { name: 'Search page text' });
  const showAll = page.getByRole('checkbox', { name: 'Show all results' });
  const waitCount = text => page.waitForFunction(text => document.querySelector('[data-full-page-search-owned="panel"]').shadowRoot.getElementById('count').textContent === text, text);
  assert.equal(await showAll.isChecked(), true);
  await query.fill('aurora'); await waitCount('1 of 12 matches');
  await showAll.check();
  assert.equal(await page.locator('#outer').getAttribute('open'), '');
  assert.equal(await page.locator('#inner').getAttribute('open'), '');
  assert.equal(await page.locator('#attribute').getAttribute('hidden'), null);
  await page.getByRole('button', { name: 'Next match', exact: true }).click();
  await waitCount('2 of 12 matches');
  assert.equal(await page.locator('#inner').getAttribute('open'), '', 'navigation keeps other results open');
  await page.evaluate(() => {
    const section = document.createElement('div');
    section.id = 'new-hidden'; section.hidden = true; section.textContent = 'A fresh aurora.';
    document.getElementById('dynamic').append(section);
  });
  await waitCount('2 of 13 matches');
  assert.equal(await page.locator('#new-hidden').getAttribute('hidden'), null, 'new matching content is revealed');
  const changes = await page.evaluate(async () => {
    let count = 0;
    const observer = new MutationObserver(() => count++);
    observer.observe(document, { subtree: true, childList: true, attributes: true });
    await new Promise(resolve => setTimeout(resolve, 650)); observer.disconnect(); return count;
  });
  assert.equal(changes, 0, 'revealing all results must not trigger an observer feedback loop');
  await showAll.uncheck();
  assert.equal(await page.locator('#outer').getAttribute('open'), null);
  assert.equal(await page.locator('#attribute').getAttribute('hidden'), 'until-found');
  assert.equal(await page.locator('#new-hidden').getAttribute('hidden'), '');
  await showAll.check();
  await query.fill('nested aurora'); await waitCount('1 of 1 matches');
  assert.equal(await page.locator('#inner').getAttribute('open'), '');
  assert.equal(await page.locator('#attribute').getAttribute('hidden'), 'until-found', 'old matches are restored when the query changes');
  await query.fill('no matching phrase'); await waitCount('No matches');
  assert.equal(await page.locator('#outer').getAttribute('open'), null);
  await query.fill('aurora'); await waitCount('1 of 13 matches');
  assert.equal(await showAll.isChecked(), true);
  assert.equal(await page.locator('#inner').getAttribute('open'), '');
  await query.press('Escape');
  assert.equal(await page.locator('#outer').getAttribute('open'), null);
  assert.equal(await page.locator('#attribute').getAttribute('hidden'), 'until-found');
  assert.equal(await page.locator('#new-hidden').getAttribute('hidden'), '');
});
test('renders safely, shows snippets and supports match navigation', async t => {
  const page = await pageFor(t, true);
  await page.locator('input[aria-label="Search page text"]').fill('aurora');
  await page.waitForFunction(() => document.querySelector('[data-full-page-search-owned="panel"]').shadowRoot.getElementById('count').textContent.startsWith('1 of'));
  await page.locator('button[aria-label="Next match"]').click();
  assert.match(await page.locator('#count').textContent(), /^2 of/);
  await page.locator('input[aria-label="Search page text"]').press('Shift+Enter');
  assert.match(await page.locator('#count').textContent(), /^1 of/);
  fs.mkdirSync(path.join(__dirname,'../test-results'),{recursive:true});
  await page.screenshot({path:path.join(__dirname,'../test-results/search-panel.png')});
  await page.locator('input[aria-label="Search page text"]').fill('<img onerror=alert(1)>');
  await page.waitForFunction(() => document.querySelector('[data-full-page-search-owned="panel"]').shadowRoot.getElementById('count').textContent === 'No matches');
  assert.equal(await page.locator('img').count(),0);
});
