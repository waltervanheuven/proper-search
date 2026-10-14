(() => {
  if (globalThis.FullPageSearchEngine) return;
  const EXCLUDED = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION']);
  const BLOCKS = new Set(['ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'TABLE', 'TD', 'TH', 'TR', 'UL', 'DETAILS', 'SUMMARY']);
  const owned = element => element?.hasAttribute?.('data-full-page-search-owned');
  function parent(element) {
    return element.parentElement || element.getRootNode()?.host || element.ownerDocument?.defaultView?.frameElement;
  }
  function ancestors(element) {
    const result = [];
    while (element) { result.push(element); element = parent(element); }
    return result;
  }
  function hidden(node) {
    const element = node.parentElement;
    for (const ancestor of ancestors(element)) {
      const style = ancestor.ownerDocument.defaultView.getComputedStyle(ancestor);
      if (ancestor.hidden || ancestor.hasAttribute('inert') || ancestor.getAttribute('aria-hidden') === 'true' || style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0 || style.contentVisibility === 'hidden') return true;
      if (ancestor.localName === 'details' && !ancestor.open) {
        const summary = [...ancestor.children].find(child => child.localName === 'summary');
        if (!summary?.contains(element)) return true;
      }
      if (['hidden', 'clip'].includes(style.overflowY) && (style.maxHeight === '0px' || style.height === '0px')) return true;
    }
    return false;
  }
  class Engine {
    constructor(doc = document) {
      this.document = doc;
      this.matches = [];
      this.restores = [];
      this.highlightName = 'full-page-search-' + Math.random().toString(36).slice(2);
      this.visuals = [];
      this.roots = [];
    }
    index() {
      this.runs = [];
      this.roots = [];
      this.skippedFrames = 0;
      let nodes = [], length = 0;
      const flush = () => {
        if (nodes.length) this.runs.push({ nodes, text: nodes.map(entry => entry.node.data).join('') });
        nodes = []; length = 0;
      };
      const visit = node => {
        if (!node) return; // Immediate injection can run before the body exists.
        if (node.nodeType === 3) {
          if (node.data) { nodes.push({ node, start: length }); length += node.data.length; }
          return;
        }
        if (node.nodeType !== 1 && node.nodeType !== 9 && node.nodeType !== 11) return;
        if (owned(node) || EXCLUDED.has(node.tagName) || node.isContentEditable) { flush(); return; }
        const block = BLOCKS.has(node.tagName);
        if (block) flush();
        if (node.localName === 'iframe' || node.localName === 'frame') {
          flush();
          try {
            if (node.contentDocument?.body) {
              this.roots.push(node.contentDocument);
              visit(node.contentDocument.body);
            } else this.skippedFrames++;
          } catch { this.skippedFrames++; }
          flush();
        } else if (node.shadowRoot) {
          flush(); this.roots.push(node.shadowRoot); visit(node.shadowRoot); flush();
          // Assigned light-DOM text is indexed once, alongside the shadow tree.
          for (const child of node.childNodes) visit(child);
        } else {
          for (const child of node.childNodes) visit(child);
        }
        if (block) flush();
      };
      this.roots.push(this.document);
      visit(this.document.body);
      flush();
    }
    search(query, { caseSensitive = false, wholeWord = false } = {}) {
      this.restore(); this.clearHighlights(); this.matches = [];
      query = query.replace(/\s+/gu, ' ').trim();
      this.capped = false;
      if (!query) return this.matches;
      this.index();
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(escaped, caseSensitive ? 'gu' : 'giu');
      const word = char => char && /[\p{L}\p{N}\p{M}_]/u.test(char);
      for (const run of this.runs) {
        // Map normalized whitespace back to original DOM offsets.
        let text = '', offsets = [];
        for (let i = 0; i < run.text.length; i++) {
          const char = run.text[i];
          if (/\s/u.test(char)) {
            if (!text.endsWith(' ')) { text += ' '; offsets.push(i); }
          } else { text += char; offsets.push(i); }
        }
        pattern.lastIndex = 0;
        let found;
        while ((found = pattern.exec(text))) {
          const start = found.index, end = start + found[0].length;
          if (wholeWord && (word([...text.slice(0, start)].at(-1)) || word([...text.slice(end)][0]))) continue;
          if (this.matches.length === 2000) { this.capped = true; break; }
          const rawStart = offsets[start], rawEnd = offsets[end - 1] + 1;
          const first = run.nodes.findLast(entry => entry.start <= rawStart);
          const last = run.nodes.findLast(entry => entry.start < rawEnd);
          const range = first.node.ownerDocument.createRange();
          range.setStart(first.node, rawStart - first.start);
          range.setEnd(last.node, rawEnd - last.start);
          this.matches.push({ range, hidden: hidden(first.node) || hidden(last.node), snippet: text.slice(Math.max(0, start - 65), Math.min(text.length, end + 95)).trim() });
        }
        if (this.capped) break;
      }
      this.paint();
      return this.matches;
    }
    changeAttribute(element, name, value) {
      const before = element.getAttribute(name);
      if (value === null) element.removeAttribute(name); else element.setAttribute(name, value);
      this.restores.push(() => {
        if (element.getAttribute(name) !== value) return;
        if (before === null) element.removeAttribute(name); else element.setAttribute(name, before);
      });
    }
    changeStyle(element, property, value) {
      const before = element.style.getPropertyValue(property), priority = element.style.getPropertyPriority(property);
      const hadAttribute = element.hasAttribute('style');
      const originalAttribute = element.getAttribute('style');
      element.style.setProperty(property, value, 'important');
      const changedAttribute = element.getAttribute('style');
      this.restores.push(() => {
        if (element.getAttribute('style') === changedAttribute) {
          if (originalAttribute === null) element.removeAttribute('style'); else element.setAttribute('style', originalAttribute);
          return;
        }
        if (element.style.getPropertyValue(property) !== value || element.style.getPropertyPriority(property) !== 'important') return;
        if (before) element.style.setProperty(property, before, priority); else element.style.removeProperty(property);
        if (!hadAttribute && !element.style.length) element.removeAttribute('style');
      });
    }
    restore() {
      for (const restore of this.restores.reverse()) restore();
      this.restores = [];
    }
    revealAll(index = 0, scroll = false) {
      return this.reveal(index, scroll, true);
    }
    reveal(index, scroll = true, all = false) {
      this.restore();
      const match = this.matches[index];
      if (!match) return false;
      const targets = new Set();
      for (const result of all ? this.matches : [match]) {
        for (const node of [result.range.startContainer, result.range.endContainer]) {
          for (const ancestor of ancestors(node.parentElement).reverse()) targets.add(ancestor);
        }
      }
      // Open outer containers first so computed styles describe the inner ones.
      for (const element of targets) {
        if (element.localName === 'details' && !element.open) this.changeAttribute(element, 'open', '');
        for (const attr of ['hidden', 'inert']) if (element.hasAttribute(attr)) this.changeAttribute(element, attr, null);
        if (element.getAttribute('aria-hidden') === 'true') this.changeAttribute(element, 'aria-hidden', 'false');
        const style = element.ownerDocument.defaultView.getComputedStyle(element);
        if (style.display === 'none') this.changeStyle(element, 'display', 'block');
        if (style.visibility !== 'visible') this.changeStyle(element, 'visibility', 'visible');
        if (Number(style.opacity) === 0) this.changeStyle(element, 'opacity', '1');
        if (style.contentVisibility === 'hidden') this.changeStyle(element, 'content-visibility', 'visible');
        if (['hidden', 'clip'].includes(style.overflowY) && (style.maxHeight === '0px' || style.height === '0px')) {
          this.changeStyle(element, 'max-height', 'none');
          this.changeStyle(element, 'height', 'auto');
          this.changeStyle(element, 'overflow', 'visible');
        }
      }
      if (scroll) {
        for (const ancestor of ancestors(match.range.startContainer.parentElement).reverse()) {
          if (ancestor.localName === 'iframe') ancestor.scrollIntoView({ block: 'center', inline: 'nearest' });
        }
        const rect = match.range.getBoundingClientRect(), win = match.range.startContainer.ownerDocument.defaultView;
        // Position the actual text, including in long text nodes and scroll containers.
        match.range.startContainer.parentElement.scrollIntoView({ block: 'center', inline: 'nearest' });
        const after = match.range.getBoundingClientRect();
        if (rect.width || after.width) win.scrollBy({ top: after.top - win.innerHeight / 2, left: 0, behavior: 'instant' });
      }
      this.paint(index);
      return match.range.getClientRects().length > 0;
    }
    clearHighlights() {
      for (const root of this.roots) {
        const doc = root.ownerDocument || root;
        doc.defaultView?.CSS?.highlights?.delete(this.highlightName);
        doc.defaultView?.CSS?.highlights?.delete(this.highlightName + '-active');
      }
      for (const element of this.visuals) element.remove();
      this.visuals = [];
    }
    paint(active = -1) {
      this.clearHighlights();
      for (const root of this.roots) {
        const doc = root.ownerDocument || root, win = doc.defaultView;
        if (win.CSS?.highlights && win.Highlight) {
          // WebKit can paint ranges in collapsed content at unrelated layout positions.
          // Index every match, but paint only text that is currently revealed.
          const rendered = match => match.range.startContainer.ownerDocument === doc && !hidden(match.range.startContainer) && !hidden(match.range.endContainer);
          const ranges = this.matches.filter(rendered).map(match => match.range);
          win.CSS.highlights.set(this.highlightName, new win.Highlight(...ranges));
          const selected = this.matches[active];
          const highlight = new win.Highlight(...(selected && rendered(selected) ? [selected.range] : []));
          highlight.priority = 1;
          win.CSS.highlights.set(this.highlightName + '-active', highlight);
          const style = doc.createElement('style');
          style.setAttribute('data-full-page-search-owned', '');
          style.textContent = `::highlight(${this.highlightName}){background:#fde68a;color:#111827}::highlight(${this.highlightName}-active){background:#fb923c;color:#111827}`;
          (root.head || root).append(style);
          this.visuals.push(style);
        }
      }
      const selected = this.matches[active];
      if (selected) {
        const doc = selected.range.startContainer.ownerDocument;
        if (!doc.defaultView.CSS?.highlights) {
          // Older Safari fallback: a border over the active range without editing page text.
          for (const rect of selected.range.getClientRects()) {
            const box = doc.createElement('div');
            box.setAttribute('data-full-page-search-owned', '');
            box.style.cssText = `position:absolute;pointer-events:none;z-index:2147483646;outline:2px solid #f97316;background:#fbbf2433;left:${rect.left + doc.defaultView.scrollX}px;top:${rect.top + doc.defaultView.scrollY}px;width:${rect.width}px;height:${rect.height}px`;
            doc.body.append(box); this.visuals.push(box);
          }
        }
      }
    }
    close() { this.restore(); this.clearHighlights(); this.matches = []; }
  }
  globalThis.FullPageSearchEngine = Engine;
})();
