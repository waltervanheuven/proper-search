/* Use the promise-based WebExtension API in Firefox, Safari, and Chrome. */
const api = globalThis.browser ?? globalThis.chrome;
async function openSearch() {
  document.getElementById('retry').hidden = true;
  try {
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab');
    await api.scripting.executeScript({
      target: { tabId: tab.id }, files: ['search-engine.js', 'content.js'], injectImmediately: true
    });
    window.close();
  } catch (error) {
    document.getElementById('status').textContent = 'Could not open search on this page. Try a normal website and click Proper Search again. Browser settings pages, extension stores, and built-in PDF viewers are not supported. Check the extension’s website or local-file access settings if needed.';
    document.getElementById('retry').hidden = false;
    console.warn('Proper Search:', error);
  }
}
document.getElementById('retry').addEventListener('click', openSearch);
openSearch();
