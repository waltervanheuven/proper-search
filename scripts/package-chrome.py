"""Package the shared Manifest V3 extension for Chrome's Load unpacked workflow."""
from pathlib import Path
import json
import shutil
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
source = root / "extension"
destination = root / "dist/Proper Search-chrome"
destination.mkdir(parents=True, exist_ok=True)
manifest = json.loads((source / "manifest.json").read_text())
# Chrome MV3 uses a service worker rather than a background page.
manifest["background"].pop("scripts")
manifest_text = json.dumps(manifest, indent=2) + "\n"
(destination / "manifest.json").write_text(manifest_text)
files = [source / name for name in (
    "background.js", "popup.html", "popup.css", "popup.js",
    "search-engine.js", "content.js",
)] + sorted((source / "icons").glob("*.png")) + sorted((source / "icons").glob("*.svg"))

archive_path = root / "dist/Proper Search-chrome.zip"
with ZipFile(archive_path, "w", compression=ZIP_DEFLATED) as archive:
    archive.writestr("manifest.json", manifest_text)
    for file in files:
        relative = file.relative_to(source)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, target)
        archive.write(file, relative.as_posix())

print(f"Chrome folder: {destination}")
print(f"Chrome ZIP: {archive_path}")
