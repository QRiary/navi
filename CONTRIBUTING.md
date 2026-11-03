# Contributing to NAVI

Thanks for wanting to improve NAVI! Fork it, change it for your keyboard, send a pull request — all welcome.

## Set up

```
npm install
npm run app:dev      # interface with hot reload + Electron window
```

Use a separate data folder so you do not touch your real projects:

```
set NAVI_USER_DATA=C:\temp\navi-dev     (PowerShell: $env:NAVI_USER_DATA = 'C:\temp\navi-dev')
```

## Before sending changes

```
npm run typecheck
npm test
npm run build
```

If you changed the `keymap.c` / `rules.mk` / `config.h` generator, also build real firmware with QMK
(for example `bastardkb/dilemma/4x6_4`): QMK compiles with `-Werror`, so a warning is an error.

## Where things are

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). In short: pure logic in `src/core` (with tests next to it),
interface in `src/pages` and `src/components`, the Electron main process in `electron/`.

## Rules of the project

- **Do not fake results.** Show “written”, “built”, “flashed” only after a real confirmation
  (keyboard answer, read-back, exit code, device appearing). Unknown hardware stays “unknown”.
- **Never write to a keyboard or flash without a user action**, and show what will change first.
- **Keep the build safe.** A project must not be able to run programs through the build:
  do not widen the `rules.mk` allowlist to things like `CC`, `SHELL`, `CFLAGS`; keep the “allow” step for imported code.
- **Layers are numbers in QMK** — reorder/delete layers through `src/core/project/ops.ts`.
- **Project format changes** need `PROJECT_SCHEMA_VERSION + 1`, a migration in `src/core/project/migrate.ts` and a test.
- **Visible text is bilingual:** `t('English', 'Русский')`. If you do not speak Russian, write the English text twice —
  someone will translate it.
- Code, comments, docs and commit messages are in English.
- Small, focused commits with a clear message.

## Icon

The icon source is `build/icon.svg`. After editing it run `npm run icon` — it redraws `build/icon.png`, `public/icon.png`
and `build/icon.ico` (16–256 px; sizes up to 32 px use a simplified version).

## Reporting a bug

Tell us the keyboard (name, VID/PID, firmware: VIA / Vial / pure QMK), what you did, what you expected and what happened.
For VIA keyboards the output of `npm run device:probe` (read-only) helps a lot.
