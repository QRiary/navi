# QMK host tests

`npm run test:qmk` builds a keymap NAVI generated into QMK's own unit test framework and plays key sequences on it,
checking the HID reports the computer would get. It covers the C that `npm test` can only read as text: tap-hold
keys with actions (stand-in MT / LT keycodes) and the replay fix for keys that hold when another key is pressed.

- `fixture.test.ts` builds the test project (`hostProject()`, a 4x10 matrix like the test framework's) and writes
  its `keymap.c`, `rules.mk` and `config.h` to `NAVI_QMK_OUT`. Without that variable it is skipped, so `npm test`
  doesn't run it.
- `test.mk` and `config.h` make QMK's test build take those files; `qmk_host_test.cpp` holds the scenarios.
- `run.sh <folder>` builds and runs them (in a temp build folder; nothing is written into `qmk_firmware`).
- `scripts/qmk-host-test.mjs` does both steps. On Windows the build runs in WSL: set `NAVI_WSL_DISTRO` to the
  distro with QMK (e.g. `QMK`). `QMK_HOME` points at `qmk_firmware` when it isn't `~/qmk_firmware`.

Arguments after `--` go to the test binary: `npm run test:qmk -- --gtest_filter=*replay*`.
