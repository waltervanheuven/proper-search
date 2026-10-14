/* Safari/Firefox use an event page; Chrome uses a service worker. */
const api = globalThis.browser ?? globalThis.chrome;

api.action.onClicked.addListener(async tab => {
  if (tab.id == null) return;
  try {
    await api.scripting.executeScript({
      target: { tabId: tab.id }, files: ['search-engine.js', 'content.js'], injectImmediately: true
    });
    await api.action.setTitle({ tabId: tab.id, title: 'Proper Search' });
  } catch (error) {
    console.warn('Proper Search:', error);
    // Explain inaccessible pages without opening another window.
    await api.action.setTitle({
      tabId: tab.id,
      title: 'Proper Search cannot search this page. Try a normal website and check the extension’s website access settings.'
    }).catch(() => {});
  }
});
