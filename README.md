# <img src="extension/icons/search-128.png" alt="Proper Search icon" width="40" height="40"> Proper Search for Chrome, Firefox, and Safari

Proper Search searches the **complete website page text**, including collapsed and hidden content. Matching hidden sections open temporarily. Closing search restores the extension’s changes while preserving changes made by the page afterward.

## Install in Chrome

1. Download and extract `dist/Proper Search-chrome.zip`, or use the ready-made `dist/Proper Search-chrome/` folder.
2. Open `chrome://extensions` in Chrome and turn on **Developer mode**.
3. Click **Load unpacked** and select the folder containing `manifest.json`.
4. Open Chrome’s Extensions menu (the puzzle icon) and pin **Proper Search**.
5. Visit a website and click the Proper Search magnifier to open the search panel.

Keep the extracted folder in a permanent location; Chrome reads the extension from it. The installation remains available after restarting Chrome. Google’s [installation instructions](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world) explain loading unpacked extensions.

Chrome’s settings pages, Chrome Web Store pages, and built-in PDF viewer cannot be searched. To search a local HTML file, enable **Allow access to file URLs** under Proper Search’s **Details** on the Extensions page.

## Install in Firefox

Requires Firefox 140 or newer on desktop.

1. Open `about:debugging#/runtime/this-firefox` in Firefox.
2. Click **Load Temporary Add-on…**.
3. Select `dist/Proper Search-firefox.zip`, or select `manifest.json` inside `dist/Proper Search-firefox/`.
4. Open Firefox’s Extensions menu (the puzzle icon), find **Proper Search**, and use its settings menu to pin it to the toolbar.
5. Visit a website and click the Proper Search magnifier to open search.

**This installation lasts until Firefox restarts.** Repeat the steps above to load it again. Mozilla’s [temporary installation instructions](https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/) explain loading and reloading the package.

Browser-internal pages, protected Mozilla pages, and the built-in PDF viewer cannot be searched.

## Install directly in Safari

1. In **Safari → Settings → Advanced**, enable **Show features for web developers**.
2. In **Safari → Settings → Developer**, enable **Allow unsigned extensions**, completing authentication if prompted.
3. Click **Add Temporary Extension…**.
4. Select `dist/Proper Search-webextension.zip`, or the `extension/` folder.
5. Safari lists **Proper Search** under **Temporary** in Extensions and enables it. Click its magnifier toolbar button on a website to search.

If Full Page Search is already installed as a temporary extension, remove that old entry and add the new ZIP to load the renamed version.

**Safari removes temporary extensions when it quits or after 24 hours.** Repeat Add Temporary Extension with the ZIP to reload it. Apple’s [temporary installation instructions](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension) describe this setup.

## Install using the Safari app

The app requires macOS 13 or newer. Use Safari 17.2 or newer for highlighted matches.

1. If you have `Proper Search.app`, open it. You can copy it to Applications first if you want to keep it installed.
2. In **Safari → Settings → Advanced**, enable **Show features for web developers**.
3. In **Safari → Settings → Developer**, enable **Allow unsigned extensions**. Safari may require this again after restarting.
4. In **Safari → Settings → Extensions**, enable **Proper Search**.
5. Visit a website and click the extension’s magnifier in Safari’s toolbar to grant access to that tab and open search.

The app has a button that opens Safari’s extension settings. Apple’s [permissions guide](https://developer.apple.com/documentation/safariservices/managing-safari-web-extension-permissions) describes website access. If Safari does not accept the app, use the temporary installation above.

## Use

Click the Proper Search magnifier on a website, then type a word or phrase into the floating search panel. Matches are highlighted in yellow; the selected match is orange. The panel shows how many matches were originally hidden and a text snippet for the selected result.

- Use **Enter** / **Shift + Enter** or the arrow buttons to move through results.
- **Show all results** is enabled by default. It opens all hidden sections containing matches and keeps them open while you navigate. Uncheck it to reveal only the selected result.
- **Match case** and **Whole word** refine the search.
- The refresh button searches the page again. Changes to page text also update results automatically.
- **Escape** or **×** closes search and restores revealed sections.

Changing the query restores previously opened sections before revealing the new matches. With **Show all results** unchecked, moving to another match restores the previous result’s sections. Clicking the toolbar button again focuses the existing panel.

Your three checkbox settings are remembered across pages and browser restarts.

## What is searched

- Page text, including text outside the visible area.
- Collapsed sections and nested disclosures.
- Hidden text that the page has already loaded.
- Phrases that span differently formatted text or extra spaces.
- Text in accessible embedded page content.
- New page text added while search is open.

Proper Search can only search text the page has already loaded. If an accordion, tab, or scrolling list loads more text when opened or scrolled, load that content before searching.

Browser-internal pages, built-in PDF viewers, text drawn in images or canvases, editable fields, and some embedded content cannot be searched. Inaccessible embedded pages are reported in the panel; open them in a separate tab to search them.

Search shows up to **2,000 matches** and reports when more exist. Whole-word matching supports Unicode text but does not perform language-specific word segmentation. Unusual site layouts may prevent revealing a result; its text snippet is still available. On older browsers, the selected result may have an outline instead of a highlight.

## Privacy and permissions

Proper Search gets temporary access to the tab where you click its toolbar button. It does not request ongoing access to every website. In Chrome, this access ends when the tab closes or navigates to a different website.

Checkbox preferences are saved locally. Search terms and page text are not saved or sent anywhere. The extension has no telemetry, search history, server, or network requests.
