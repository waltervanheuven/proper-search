"""Keep the generated macOS container compatible and its bundle IDs consistent."""
from pathlib import Path
import re

root = Path(__file__).resolve().parent.parent
project = root / "safari/Proper Search/Proper Search.xcodeproj/project.pbxproj"
source = project.read_text()
# Xcode 27's packager can use the app name for the host ID despite --bundle-identifier.
source = source.replace("local.Full-Page-Search", "local.fullpagesearch")
source = source.replace("local.Proper-Search", "local.fullpagesearch")
source = re.sub(r"MACOSX_DEPLOYMENT_TARGET = [\d.]+;", "MACOSX_DEPLOYMENT_TARGET = 13.0;", source)
# Older generated projects launched search from a toolbar popup. Reuse that
# script resource for the direct toolbar-click handler. New converter projects
# already include background.js, so keep their existing references.
if "background.js in Resources" not in source:
    source = source.replace("popup.js", "background.js")
project.write_text(source)
