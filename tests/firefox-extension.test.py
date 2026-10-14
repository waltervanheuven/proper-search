"""Exercise the packaged extension in Firefox without changing a user profile."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from tempfile import TemporaryDirectory
from zipfile import ZipFile
import json
import os
import signal
import socket
import subprocess
import time
import unittest

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.firefox.service import Service
from selenium.webdriver.support.ui import WebDriverWait

ROOT = Path(__file__).resolve().parent.parent


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class FirefoxExtensionTest(unittest.TestCase):
    def test_packaged_extension_and_scoped_website_access(self):
        with ZipFile(ROOT / "dist/Proper Search-firefox.zip") as archive:
            manifest = json.loads(archive.read("manifest.json"))
        self.assertEqual(manifest["permissions"], ["activeTab", "scripting", "storage"])
        self.assertNotIn("default_popup", manifest["action"], "toolbar activation must not open a popup")
        self.assertNotIn("host_permissions", manifest)
        gecko = manifest["browser_specific_settings"]["gecko"]
        self.assertEqual(gecko["data_collection_permissions"], {"required": ["none"]})
        addon_id = gecko["id"]
        server = ThreadingHTTPServer(("127.0.0.1", 0), partial(QuietHandler, directory=ROOT / "tests"))
        Thread(target=server.serve_forever, daemon=True).start()
        origin = f"http://127.0.0.1:{server.server_port}"
        options = webdriver.FirefoxOptions()
        options.binary_location = "/Applications/Firefox.app/Contents/MacOS/firefox"
        options.add_argument("-headless")
        (ROOT / "test-results").mkdir(exist_ok=True)
        profile = TemporaryDirectory(prefix="proper-search-firefox-", dir=ROOT / "test-results")
        options.add_argument("-profile")
        options.add_argument(profile.name)
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            marionette_port = listener.getsockname()[1]
        (Path(profile.name) / "user.js").write_text(f'user_pref("marionette.port", {marionette_port});\n')
        service = Service(
            service_args=["--allow-system-access", "--connect-existing", "--marionette-port", str(marionette_port)],
            log_output=str(ROOT / "test-results/firefox-driver.log"),
        )
        firefox_pid = None
        try:
            # LaunchServices lets Firefox use its normal macOS app permissions.
            # Direct exec currently fails before profile selection on macOS 27.
            subprocess.run([
                "/usr/bin/open", "-n", "-a", "/Applications/Firefox.app",
                "--env", "MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1", "--args",
                "-no-remote", "-headless", "-profile", profile.name, "-marionette",
            ], check=True, timeout=20)
            deadline = time.monotonic() + 30
            while True:
                try:
                    with socket.create_connection(("127.0.0.1", marionette_port), timeout=1):
                        break
                except OSError:
                    if time.monotonic() >= deadline:
                        self.fail("Firefox did not start its isolated Marionette test session")
                    time.sleep(0.2)
            with webdriver.Firefox(options=options, service=service) as driver:
                firefox_pid = driver.capabilities["moz:processID"]
                print(f"Firefox {driver.capabilities['browserVersion']}; isolated temporary profile", flush=True)
                driver.set_window_size(1280, 1000)
                driver.set_script_timeout(15)
                wait = WebDriverWait(driver, 15)
                installed_id = driver.install_addon(str(ROOT / "dist/Proper Search-firefox-unsigned.xpi"), temporary=True)
                self.assertEqual(installed_id, addon_id)
                driver.get(origin + "/fixture.html")
                fixture = driver.current_window_handle

                def tab_id():
                    with driver.context(driver.CONTEXT_CHROME):
                        return driver.execute_script("""
                            const policy = WebExtensionPolicy.getByID(arguments[0]);
                            return policy.extension.tabManager.getWrapper(window.gBrowser.selectedTab).id;
                        """, addon_id)

                fixture_tab_id = tab_id()
                with driver.context(driver.CONTEXT_CHROME):
                    popup_url = driver.execute_script("return WebExtensionPolicy.getByID(arguments[0]).getURL('popup.html');", addon_id)
                driver.switch_to.new_window("tab")
                driver.get(popup_url)
                probe = driver.current_window_handle
                wait.until(lambda d: d.find_element(By.ID, "retry").is_displayed())
                self.assertIn("Browser settings pages", driver.find_element(By.ID, "status").text)

                def can_inject(target_tab_id):
                    driver.switch_to.window(probe)
                    return driver.execute_async_script("""
                        const tabId = arguments[0], done = arguments[arguments.length - 1];
                        browser.scripting.executeScript({target: {tabId}, func: () => true})
                            .then(() => done(true), () => done(false));
                    """, target_tab_id)

                def activate(target_handle):
                    driver.switch_to.window(target_handle)
                    with driver.context(driver.CONTEXT_CHROME):
                        driver.execute_script("""
                            const {ExtensionParent} = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
                            const CustomizableUI = window.CustomizableUI ?? ChromeUtils.importESModule(
                                'moz-src:///browser/components/customizableui/CustomizableUI.sys.mjs'
                            ).CustomizableUI;
                            const extension = WebExtensionPolicy.getByID(arguments[0]).extension;
                            const action = ExtensionParent.apiManager.global.browserActionFor(extension);
                            CustomizableUI.addWidgetToArea(action.id, CustomizableUI.AREA_NAVBAR);
                            window.focus();
                            action.triggerAction(window);
                        """, addon_id)
                    wait.until(lambda d: panel_value("query", "value") is not None)
                    def popup_closed(_):
                        with driver.context(driver.CONTEXT_CHROME):
                            return driver.execute_script("""
                                const {ExtensionParent} = ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
                                const {ViewPopup} = ChromeUtils.importESModule('resource:///modules/ExtensionPopups.sys.mjs');
                                const extension = WebExtensionPolicy.getByID(arguments[0]).extension;
                                const action = ExtensionParent.apiManager.global.browserActionFor(extension);
                                return !action.pendingPopup && !ViewPopup.for(extension, window);
                            """, addon_id)
                    wait.until(popup_closed)

                def panel_value(element_id, property_name="textContent"):
                    return driver.execute_script("""
                        const panel = document.querySelector('[data-full-page-search-owned="panel"]');
                        return panel?.shadowRoot.getElementById(arguments[0])?.[arguments[1]] ?? null;
                    """, element_id, property_name)

                def search(text):
                    query = panel_value("query", "value")
                    self.assertIsNotNone(query)
                    element = driver.execute_script("""return document.querySelector('[data-full-page-search-owned="panel"]').shadowRoot.getElementById('query');""")
                    element.clear()
                    element.send_keys(text)
                    return element

                self.assertFalse(can_inject(fixture_tab_id), "access before toolbar activation")
                activate(fixture)
                wait.until(lambda d: panel_value("query", "value") is not None)
                self.assertTrue(panel_value("all", "checked"), "Show all results defaults to enabled")
                self.assertEqual(driver.execute_script("""return document.querySelector('[data-full-page-search-owned="panel"]').shadowRoot.querySelector('h2').textContent;"""), "Proper Search")
                search("aurora")
                wait.until(lambda d: panel_value("count") == "1 of 12 matches")
                self.assertTrue(panel_value("hidden").startswith("10 originally hidden"))
                query = search("nested aurora")
                wait.until(lambda d: d.execute_script("return document.getElementById('outer').open && document.getElementById('inner').open;"))
                activate(fixture)
                self.assertEqual(len(driver.find_elements(By.CSS_SELECTOR, '[data-full-page-search-owned="panel"]')), 1)
                for option in ("case", "word", "all"):
                    driver.execute_script("""
                        document.querySelector('[data-full-page-search-owned="panel"]').shadowRoot.getElementById(arguments[0]).click();
                    """, option)
                query.send_keys(Keys.ESCAPE)
                wait.until(lambda d: not d.find_elements(By.CSS_SELECTOR, '[data-full-page-search-owned="panel"]'))
                self.assertEqual(driver.execute_script("return [document.getElementById('outer').open, document.getElementById('inner').open];"), [False, False])

                driver.switch_to.new_window("tab")
                driver.get(origin + "/fixture.html")
                self.assertFalse(can_inject(tab_id()), "another tab has no grant")
                driver.switch_to.window(fixture)
                driver.get(origin.replace("127.0.0.1", "localhost") + "/fixture.html")
                self.assertFalse(can_inject(tab_id()), "navigation to another website revokes access")
                activate(fixture)
                wait.until(lambda d: panel_value("query", "value") is not None)
                wait.until(lambda d: panel_value("all", "checked") is False)
                self.assertTrue(panel_value("case", "checked"), "Match case remembered on another website")
                self.assertTrue(panel_value("word", "checked"), "Whole word remembered on another website")
                search("aurora")
                wait.until(lambda d: panel_value("count") == "1 of 12 matches")
                (ROOT / "test-results").mkdir(exist_ok=True)
                driver.save_screenshot(str(ROOT / "test-results/firefox-extension.png"))
                print("Verified installation, real toolbar activation, hidden search, restoration, tab isolation, and grant revocation.", flush=True)
        finally:
            server.shutdown()
            server.server_close()
            # --connect-existing leaves its browser open after WebDriver quits.
            # Terminate only the process from this test's isolated session.
            if firefox_pid is not None:
                try:
                    os.kill(firefox_pid, signal.SIGTERM)
                    for _ in range(50):
                        try:
                            os.kill(firefox_pid, 0)
                        except ProcessLookupError:
                            break
                        time.sleep(0.1)
                except ProcessLookupError:
                    pass
            profile.cleanup()


if __name__ == "__main__":
    unittest.main(verbosity=2)
