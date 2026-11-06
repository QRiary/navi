# CLAUDE.md

NAVI — QMK keyboard configurator and flasher (Electron 44 + React 19 + TypeScript 7 + Vite 8 + zustand).
Code map and design: @docs/ARCHITECTURE.md
Owner's personal notes (not in git, may be missing): @CLAUDE.local.md

## Commands

```
npm test               # vitest: core + main process (~2 s)
npm run test:qmk       # generated tap-hold C in QMK's unit test framework (WSL: NAVI_WSL_DISTRO=QMK), tests/qmk-host
npm run typecheck      # tsc --noEmit
npm run build          # tsc + vite build → dist/
npm run app            # build + Electron window
npm run app:dev        # Vite :5190 + Electron with hot reload
npm run app:test       # build + open the worktree with the newest commit not on master (else master); --dry-run prints the pick
npm run device:probe   # build + hidden window: reads (read-only!) all VIA keyboards and prints JSON
npm run gen:qmk -- <qmk_firmware>   # regenerate src/core/qmk-data/* from QMK sources
npm run icon           # build/icon.svg → build/icon.png, public/icon.png, build/icon.ico
npm run check:docs     # opens every QMK docs link in src/ and checks the page and its #anchor exist (run after adding one)
npm run dist           # Windows installer (electron-builder)
```
After changes: `npm run typecheck; npm test; npm run build`.

## Rules

- Own firmware is pure QMK by default (`VIA_ENABLE = no`); VIA only when the user ticks it.
- Before the first flash of a keyboard whose firmware source is unknown — save the current firmware (`CURRENT.UF2`) of every half.
- Do not fake anything: connection/write/build/flash statuses only from facts (keyboard answer, read-back, exit code, device appearing).
- Do not invent hardware: unknown stays empty/“unknown”, guesses get evidence `heuristic`.
- Never write to a keyboard or flash without an explicit user action. Show the change plan before writing.
- QMK files are written only into the keymap folder (or a new target) and only after showing a diff; previous files are backed up. One exception (the owner's call, 2026-11-06): “build + flash” overwrites without asking a file that is exactly what NAVI wrote there last (`electron/keymapWrites.cjs`); any other file still gets its diff first.
- Layers are numbers in QMK: reorder/delete layers only through `src/core/project/ops.ts`.
- Build safety: make variables only from the allowlist; imported own code is held until “allow” (`firmware.customReview`). Do not weaken this.
- New project field = `PROJECT_SCHEMA_VERSION + 1` + migration in `migrate.ts` + test.
- The repository is English: code, comments, tests, docs and commit messages. Only the interface is bilingual: `t('English', 'Русский')`.
- Generated `keymap.c` must compile in real QMK without warnings (QMK builds with `-Werror`).

## Checking the interface

Run a separate test window that does not take focus and does not touch the user's data:

```
NAVI_USER_DATA=<temp folder> NAVI_TEST_WINDOW=x,y,width,height electron . --remote-debugging-port=9333
```

Drive it over CDP (`Input.dispatchMouseEvent` / `Runtime.evaluate` / `Page.captureScreenshot`) — the real cursor is not used.
For `mouseMoved` send `button: 'none'`, otherwise it is a drag (it once resized a panel).
Close it by killing only that process (a normal close may show the “unsaved changes” dialog).
