#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${ROOT_DIR}/build"
DERIVED_DATA_DIR="${BUILD_DIR}/DerivedData"
PAYLOAD_DIR="${BUILD_DIR}/Payload"
APP_PATH="${DERIVED_DATA_DIR}/Build/Products/Release-iphoneos/ChatGPTWebView.app"
IPA_PATH="${BUILD_DIR}/ChatGPTWeb-unsigned.ipa"

rm -rf "${DERIVED_DATA_DIR}" "${PAYLOAD_DIR}" "${IPA_PATH}"

xcodebuild \
    -project "${ROOT_DIR}/ChatGPTWeb.xcodeproj" \
    -scheme ChatGPTWeb \
    -configuration Release \
    -sdk iphoneos \
    -derivedDataPath "${DERIVED_DATA_DIR}" \
    CODE_SIGNING_ALLOWED=NO \
    CODE_SIGNING_REQUIRED=NO \
    clean build

if [[ ! -d "${APP_PATH}" ]]; then
    echo "Build succeeded but the app bundle was not found: ${APP_PATH}" >&2
    exit 1
fi

mkdir -p "${PAYLOAD_DIR}"
cp -R "${APP_PATH}" "${PAYLOAD_DIR}/"
(
    cd "${BUILD_DIR}"
    /usr/bin/zip -qry "${IPA_PATH}" Payload
)
rm -rf "${PAYLOAD_DIR}"

echo "Unsigned IPA: ${IPA_PATH}"
