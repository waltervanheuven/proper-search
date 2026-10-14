"""Build a Firefox-specific Manifest V3 package from the shared extension source."""
from pathlib import Path
import json
import shutil
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
source = root / "extension"
destination = root / "dist/Proper Search-firefox"
destination.mkdir(parents=True, exist_ok=True)
manifest = json.loads((source / "manifest.json").read_text())
manifest["background"].pop("service_worker")
manifest["browser_specific_settings"] = {
    "gecko": {
        "id": "proper-search@local.propersearch",
        "strict_min_version": "140.0",
        "data_collection_permissions": {"required": ["none"]},
    },
    "gecko_android": {"strict_min_version": "142.0"},
}
manifest_text = json.dumps(manifest, indent=2) + "\n"
(destination / "manifest.json").write_text(manifest_text)
files = [source / name for name in (
    "background.js", "popup.html", "popup.css", "popup.js", "search-engine.js", "content.js",
)] + sorted((source / "icons").glob("*.png")) + sorted((source / "icons").glob("*.svg"))

archive_path = root / "dist/Proper Search-firefox.zip"
with ZipFile(archive_path, "w", compression=ZIP_DEFLATED) as archive:
    archive.writestr("manifest.json", manifest_text)
    for file in files:
        relative = file.relative_to(source)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(file, target)
        archive.write(file, relative.as_posix())

unsigned_xpi = root / "dist/Proper Search-firefox-unsigned.xpi"
shutil.copy2(archive_path, unsigned_xpi)
print(f"Firefox folder: {destination}")
print(f"Firefox ZIP: {archive_path}")
print(f"Unsigned XPI (requires Mozilla signing for permanent installation): {unsigned_xpi}")
