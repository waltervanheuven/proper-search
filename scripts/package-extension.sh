#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
cd extension
zip -r '../dist/Proper Search-webextension.zip' manifest.json background.js popup.html popup.css popup.js search-engine.js content.js icons
