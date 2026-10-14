#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [ -d "safari/Proper Search/Proper Search.xcodeproj" ]; then
  echo "Safari project already exists and references the extension directory."
else
  xcrun safari-web-extension-converter extension --project-location safari --app-name "Proper Search" --bundle-identifier local.fullpagesearch --swift --macos-only --no-open --no-prompt
fi
python3 scripts/configure-safari.py
