(() => {
  const KEY = '__fullPageSearchPanel';
  if (globalThis[KEY]) { globalThis[KEY].focus(); return; }
  const engine = new FullPageSearchEngine();
  const host = document.createElement('div');
  host.setAttribute('data-full-page-search-owned', 'panel');
  host.style.cssText = 'all:initial!important;position:fixed!important;top:16px!important;right:16px!important;z-index:2147483647!important;display:block!important;width:min(400px,calc(100vw - 32px))!important;color-scheme:light!important;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:#17252d; }
      * { box-sizing:border-box; } button,input { font:inherit; }
      .panel { font:14px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; color:#17252d; background:#fff; border:1px solid #cbd5e1; border-radius:16px; box-shadow:0 12px 50px #0f172a30; overflow:hidden; }
      header { display:flex; align-items:center; justify-content:space-between; padding:16px 18px 10px; }
      h2 { font-size:15px; margin:0; } .badge { font-size:10px; font-weight:700; letter-spacing:.1em; color:#0e7490; margin-bottom:4px; }
      button { border:1px solid #d6dfe5; border-radius:8px; background:#f8fafc; color:#17252d; padding:7px 10px; cursor:pointer; }
      button:hover { background:#e6f2f5; } button:disabled { opacity:.45; cursor:default; }
      button:focus-visible,input:focus-visible { outline:2px solid #0891b2; outline-offset:2px; }
      .close { font-size:20px; border:0; background:transparent; padding:2px 8px; }
      .body { padding:4px 18px 16px; } .search { width:100%; border:1px solid #9eafb9; border-radius:9px; padding:11px 12px; background:#fff; color:#17252d; }
      .options { display:flex; flex-wrap:wrap; gap:10px 18px; margin:12px 0; font-size:12px; } label { display:flex; align-items:center; gap:5px; cursor:pointer; }
      input[type=checkbox] { accent-color:#0e7490; }
      .navigation { display:flex; align-items:center; justify-content:space-between; gap:8px; } .buttons { display:flex; gap:5px; }
      #count { font-size:13px; font-weight:600; } #hidden { font-size:12px; color:#0e7490; margin:8px 0; }
      #snippet { background:#f1f5f9; padding:10px 12px; border-radius:9px; line-height:1.5; max-height:105px; overflow:auto; overflow-wrap:anywhere; margin:10px 0; }
      #notice { color:#596976; font-size:11px; line-height:1.5; margin:10px 0 0; }
      .footer { padding:10px 18px; font-size:11px; color:#596976; background:#f8fafc; border-top:1px solid #e2e8f0; }
      [hidden] { display:none!important; }
      @media(prefers-reduced-motion:no-preference) { .panel { animation:appear .15s ease-out; } @keyframes appear { from { opacity:0; transform:translateY(-5px); } } }
    </style>
    <section class="panel" role="region" aria-label="Proper Search">
      <header><div><div class="badge">BEYOND VISIBLE TEXT</div><h2>Proper Search</h2></div><button class="close" id="close" aria-label="Close search">×</button></header>
      <div class="body">
        <input class="search" id="query" type="search" placeholder="Search the entire page…" aria-label="Search page text" autocomplete="off" spellcheck="false">
        <div class="options"><label><input id="case" type="checkbox">Match case</label><label><input id="word" type="checkbox">Whole word</label></div>
        <div class="options"><label><input id="all" type="checkbox" checked>Show all results</label></div>
        <div class="navigation"><span id="count" role="status" aria-live="polite">Type to search</span><div class="buttons"><button id="prev" aria-label="Previous match" title="Shift + Enter" disabled>↑</button><button id="next" aria-label="Next match" title="Enter" disabled>↓</button><button id="refresh" aria-label="Refresh page search" title="Search again">↻</button></div></div>
        <p id="hidden" hidden></p><p id="snippet" hidden></p>
        <p id="notice">Includes loaded hidden text, collapsed sections, and accessible embedded pages. Content not yet loaded and closed shadow roots cannot be searched.</p>
      </div><div class="footer">Enter: next · Shift + Enter: previous · Esc: close</div>
    </section>`;
  document.documentElement.append(host);
  const $ = id => shadow.getElementById(id);
  const preferenceKeys = { case: 'matchCase', word: 'wholeWord', all: 'showAllResults' };
  const defaults = { matchCase: false, wholeWord: false, showAllResults: true };
  const preferences = globalThis.__fullPageSearchPreferences ??= { ...defaults };
  const storage = (globalThis.browser ?? globalThis.chrome)?.storage?.local;
  const changedPreferences = new Set();
  for (const [id, key] of Object.entries(preferenceKeys)) $(id).checked = preferences[key];
  function savePreference(id) {
    const key = preferenceKeys[id], value = $(id).checked;
    changedPreferences.add(id); preferences[key] = value;
    // Save only this option, so a slow initial read cannot overwrite another.
    if (storage) storage.set({ [key]: value }).catch(error => console.warn('Proper Search preferences:', error));
  }
  let active = -1, timer, closed = false, visible = true;
  const observers = [];
  function pause() { for (const observer of observers) observer.disconnect(); observers.length = 0; }
  function isOwnMutation(record) {
    const inPanel = node => node === host || node?.getRootNode?.() === shadow || node?.closest?.('[data-full-page-search-owned]');
    if (inPanel(record.target)) return true;
    if (record.type === 'childList') return [...record.addedNodes, ...record.removedNodes].every(node => node.nodeType === 1 && inPanel(node));
    return false;
  }
  function observe() {
    if (closed || !$('query').value.trim()) return;
    for (const root of engine.roots) {
      const observer = new MutationObserver(records => {
        if (records.every(isOwnMutation)) return;
        clearTimeout(timer); timer = setTimeout(() => search(false), 200);
      });
      observer.observe(root, { childList:true, subtree:true, characterData:true, attributes:true, attributeFilter:['hidden','open','class','style','aria-hidden','inert'] });
      observers.push(observer);
    }
  }
  function update() {
    const total = engine.matches.length;
    $('prev').disabled = $('next').disabled = total === 0;
    $('count').textContent = !$('query').value.trim() ? 'Type to search' : total ? `${active + 1} of ${total.toLocaleString()}${engine.capped ? '+' : ''} matches` : 'No matches';
    const concealed = engine.matches.filter(match => match.hidden).length;
    $('hidden').hidden = !total;
    $('hidden').textContent = `${concealed.toLocaleString()} originally hidden or collapsed${total && !visible ? ' · See the text below' : ''}`;
    $('snippet').hidden = active < 0;
    $('snippet').textContent = engine.matches[active]?.snippet || '';
    const limits = ['Searches loaded page text, including hidden sections.'];
    if (engine.skippedFrames) limits.push(`${engine.skippedFrames} embedded page(s) inaccessible; open them in their own tab to search.`);
    limits.push('Unloaded content and closed shadow roots cannot be searched.');
    if (engine.capped) limits.push('Showing the first 2,000 matches; Show all results reveals these matches. Use a more specific query.');
    $('notice').textContent = limits.join(' ');
  }
  function reveal(scroll = true) {
    return active < 0 ? true : $('all').checked ? engine.revealAll(active, scroll) : engine.reveal(active, scroll);
  }
  function search(scroll = true) {
    if (closed) return;
    clearTimeout(timer); timer = undefined; pause();
    const previous = engine.matches[active]?.range.startContainer;
    engine.search($('query').value, { caseSensitive:$('case').checked, wholeWord:$('word').checked });
    const preserved = !scroll && previous ? engine.matches.findIndex(match => match.range.startContainer === previous) : -1;
    active = engine.matches.length ? Math.max(0, preserved) : -1;
    visible = reveal(scroll);
    update(); observe();
  }
  function navigate(delta) {
    if (timer) search(false);
    clearTimeout(timer); timer = undefined;
    if (!engine.matches.length) return;
    // Rebuild if a page replaced a matching node since the last observer callback.
    if (!engine.matches[active]?.range.startContainer.isConnected) search(false);
    if (!engine.matches.length) return;
    pause(); active = (active + delta + engine.matches.length) % engine.matches.length;
    visible = reveal(); update(); observe();
  }
  function close() {
    closed = true; clearTimeout(timer); pause(); engine.close(); host.remove();
    document.removeEventListener('keydown', escape, true);
    document.removeEventListener('load', loaded, true);
    delete globalThis[KEY];
  }
  function escape(event) {
    if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); close(); }
  }
  function loaded(event) {
    if (event.target?.localName === 'iframe') { clearTimeout(timer); timer = setTimeout(() => search(false), 200); }
  }
  $('query').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(search, 120); });
  $('query').addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      if (timer) { search(); timer = undefined; } else navigate(event.shiftKey ? -1 : 1);
    }
  });
  for (const id of ['case', 'word']) $(id).addEventListener('change', () => { savePreference(id); search(); });
  $('all').addEventListener('change', () => {
    savePreference('all');
    if (timer) search(false);
    pause(); visible = reveal(false); update(); observe();
  });
  $('prev').addEventListener('click', () => navigate(-1));
  $('next').addEventListener('click', () => navigate(1));
  $('refresh').addEventListener('click', () => search());
  $('close').addEventListener('click', close);
  document.addEventListener('keydown', escape, true);
  document.addEventListener('load', loaded, true);
  globalThis[KEY] = { focus:() => { $('query').focus(); $('query').select(); } };
  // Show and focus the panel immediately; index the page only when searching.
  $('query').focus();
  if (storage) storage.get(defaults).then(saved => {
    if (closed) return;
    let changed = false;
    for (const [id, key] of Object.entries(preferenceKeys)) {
      if (changedPreferences.has(id) || typeof saved[key] !== 'boolean') continue;
      changed ||= $(id).checked !== saved[key];
      $(id).checked = preferences[key] = saved[key];
    }
    if (changed && $('query').value.trim()) search(false);
  }).catch(error => console.warn('Proper Search preferences:', error));
})();
