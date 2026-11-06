#!/usr/bin/env bash
# NAVI's firmware test run (docs/firmware-tests.md → NAVI's runner): builds the test folder $1 (the player, the board
# stand-in test.mk / config.h NAVI wrote there) with the keymap folder it names into QMK's unit test framework, then
# runs it. $2 = qmk_firmware. Everything is built inside $1; nothing is written into qmk_firmware or the keymap folder.
# Exit: 0 every scenario passed, 1 some failed, 3 the test build failed (its first errors are printed after
# "NAVI-TESTS: build failed"), 4 bad arguments. The folder $1 is removed at the end.
set -u
dir=$1
qmk_home=$2
finish() {
    # Only a test folder NAVI staged (firmwareTests.cjs: <tmp>/navi-tests-<hex>) is removed, whatever $1 was.
    case "$dir" in
        */navi-tests-[0-9a-f]*) rm -rf -- "$dir" ;;
    esac
    # bash -l runs ~/.bash_logout on exit; its exit status must not replace ours.
    exit "$1"
}
if [ ! -f "$dir/test.mk" ] || [ ! -f "$qmk_home/builddefs/build_test.mk" ]; then
    echo "NAVI-TESTS: bad arguments"
    finish 4
fi
# QMK's test build takes the test folder relative to qmk_firmware (absolute paths break its object paths).
rel=$(realpath --relative-to="$qmk_home" "$dir")
if ! make -r -R -s -C "$qmk_home" -f builddefs/build_test.mk -j"$(nproc)" all \
    TEST=navi TEST_OUTPUT=navi TEST_PATH="$rel" FULL_TESTS=navi BUILD_DIR="$dir/build" SILENT=false \
    >"$dir/make.log" 2>&1; then
    echo "NAVI-TESTS: build failed"
    if ! grep -E 'error|undefined reference' "$dir/make.log" | head -40; then tail -40 "$dir/make.log"; fi
    finish 3
fi
"$dir/build/test/navi.elf" --gtest_color=no --gtest_brief=1
status=$?
[ "$status" -le 1 ] || status=1
finish "$status"
