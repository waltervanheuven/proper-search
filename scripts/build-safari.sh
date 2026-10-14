#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
bash scripts/package-safari.sh
xcodebuild -project "safari/Proper Search/Proper Search.xcodeproj" -scheme "Proper Search" -configuration Debug -derivedDataPath "$PWD/build" MACOSX_DEPLOYMENT_TARGET=13.0 CODE_SIGN_IDENTITY=- CODE_SIGNING_ALLOWED=YES build
