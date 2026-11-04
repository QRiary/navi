#!/usr/bin/env bash
# Builds the generated keymap files in folder $1 into QMK's unit test framework and runs the host tests.
# Run by scripts/qmk-host-test.mjs (npm run test:qmk); needs qmk_firmware at $QMK_HOME or ~/qmk_firmware.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
out=$(cd "$1" && pwd)
qmk_home=${QMK_HOME:-$HOME/qmk_firmware}
build=$(mktemp -d /tmp/navi-qmk-host.XXXXXX)
trap 'rm -rf "$build"' EXIT
# The test build takes the test folder relative to qmk_firmware (absolute paths break its object paths)
rel=$(realpath --relative-to="$qmk_home" "$here")
if ! make -r -R -s -C "$qmk_home" -f builddefs/build_test.mk -j"$(nproc)" all \
    TEST=navi TEST_OUTPUT=navi TEST_PATH="$rel" FULL_TESTS=navi BUILD_DIR="$build" SILENT=false \
    NAVI_QMK_OUT="$out" >"$build/make.log" 2>&1; then
    grep -E 'error|warning|undefined' "$build/make.log" | head -40 || tail -40 "$build/make.log"
    exit 1
fi
"$build/test/navi.elf" --gtest_color=no "${@:2}"
