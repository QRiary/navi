# UI cleanup plan

Audit of the interface on top of the `key-lists` branch (d5d1b4f), 2026-11-05: code read by three read-only
passes, the app run in a hidden test window on the owner's real project (12 layers, 55 combos), screenshots of
Keyboard, Advanced (tap dance, tap-hold, combos), Layers, Settings, Firmware, plus Impeccable's detector over CDP.
Line numbers are from that commit.

**Branch:** this work goes on top of `key-lists`, on branch `ui-cleanup`; every step merges into it (`--no-ff`,
one merge commit per step, so the PR reads step by step) and the whole cleanup goes upstream as one PR, opened
only after every PR open now has merged, so it doesn't conflict with them. PRs #5-#13 are one stack (each contains the one before, `key-lists` = #13's head), so as long as upstream
merges them with merge commits (as #2-#4) the commits stay the same and `ui-cleanup` needs no rebase; its PR's
diff shrinks to the cleanup by itself. Rebase only if a PR in the stack gets squashed, rebased or changed.

**Ground rules for every session**
- Refinement, not a restyle: keep the look (mono palette, sidebar, deck). Fix how it reads and works.
- Field rules decide (WCAG AA contrast, platform conventions, Nielsen's heuristics); the owner judges behavior
  in use, not layouts. No draft rounds: the session builds, then hands over a screenshot and a test list.
- One session = one step below, run in waves (later steps use earlier ones: readable key names before
  combos, layer reach and search; the shared Tabs/Modal pieces before the pages that use them). Each step works
  on its own branch off `ui-cleanup` and is merged back into it when it lands:
  - Wave 1, in parallel: Steps 1, 2, 3 (Step 3's key-cap fitting, 3.4, waits for Step 1's type ramp).
  - Wave 2, one after the other: Step 4 (structure), then Step 5 (hints: annotates the restructured pages).
  - Wave 3: Steps 6 and 7 in parallel (both touch `LayoutPreview.tsx`: Step 6 adds clicks as optional
    props), then Step 8 alone.
  - Wave 4 (loose ends, added 2026-11-05 before opening the PR): Steps 9 and 10 in parallel, then Step 11
    (it moves the composer's kind chips that Step 9 retranslates).
- Each step lists what the owner reported (**R**) and what the audit found (**F**). Mark a line done in this
  file when its session lands; delete the file when all are done.

## Step 1: readability and window (🟡 5/10)

**R** text is too small to read; the window forgets its size and position every launch.

**F** (measured on the Keyboard page at 1600x1000):
- 76% of text elements are 9-11px (43 at 9px, 78 at 10px, 58 at 11px, 57 at 12.5px, 1 at 14px). Tokens:
  `src/styles/tokens.css:54-60` (`--fs-2xs` 10px, `--fs-xs` 11px used 63 times). Impeccable: 14 "undersized
  functional text" and 4 "tiny body text" findings on one page.
- Dim text `#6a6a6a` on `#050505`/`#0c0c0c` is 3.6-3.8:1, below WCAG AA's 4.5:1 (78 elements on that page, incl.
  sidebar numbers, field labels, kicker labels). Letter-spaced uppercase micro-labels (0.1em+) make it worse.
- A font scale exists (`typography.scale`, 0.8-1.3, `default.config.jsonc:61-64`, `applyTheme.ts:68`) but only in
  the JSONC config; the Settings main tab has no size control. No Ctrl+= / Ctrl+- / Ctrl+0, no Ctrl+wheel zoom.
- `electron/main.cjs:56-61`: fixed 1440x900, no saved bounds or maximized state.

**Do**
1. ✅ Raise the type ramp: nothing functional below 12px, body 14px, `--fs-2xs` only for non-interactive tags.
   Dim text to at least 4.5:1 on every panel color, in every palette (check `paper` too).
2. ✅ "Interface size" on Settings → main (80-200%, steps of 10%), stored in the config, applied as the Electron
   zoom factor (scales everything evenly, keyboard drawing included). Ctrl+= / Ctrl+- / Ctrl+0 and Ctrl+wheel
   change the same value. Keep `typography.scale` for text-only scaling or fold it in (one of the two, not both
   visible).
3. ✅ Save window bounds (`getNormalBounds()`) and the maximized flag in userData on move/resize/close; restore at
   start if the rectangle is still on a connected display, else center on the primary display at the default
   size.
4. ✅ Check: rerun `impeccable detect --cdp` on Keyboard, Advanced and Firmware: zero low-contrast and
   undersized-text findings.

## Step 2: desktop basics that don't work (🟡 5/10)

**R** selected text on a key can't be copied with Ctrl+C; native dialogs look out of place and print both
languages (closing with unsaved changes).

**F**
- Ctrl+C / Ctrl+V / Ctrl+A on the Keyboard page are taken by key copy/paste/select-all whenever focus isn't in
  an input (`src/lib/useShortcuts.ts:47-59`, `keymapActions.ts:106-122`): with a key selected, Ctrl+C copies the
  key's QMK code instead of the selected text, and overwrites the clipboard silently.
- No right-click menu anywhere (no Copy/Paste in inputs); the canvas blocks `contextmenu` (`KeyboardCanvas.tsx:259`).
- Unsaved-changes on close: `main.cjs:83-92`, a native box with "Закрыть / Close", Russian then English text,
  only Close/Stay (no Save). The main process never learns the UI language.
- Three in-app modals (`WriteDialog.tsx:53`, `LinkConflictDialog.tsx:32`, `FilesTab.tsx:204`) are copy-pasted
  markup: no Esc, no focus trap, no focus return, backdrop click does nothing, and global shortcuts (Ctrl+Z, Del,
  T) still edit the project behind them.
- The editor's Tab key inserts spaces (`CodeEditor.tsx:22-25`) and so traps keyboard navigation (no escape key).

**Do**
1. ✅ Key shortcuts yield to text: if the window has a non-empty text selection, or focus is outside the keyboard
   canvas/picker, Ctrl+C/V/A do the native thing.
2. ✅ Context menu (main process `context-menu` event): Cut/Copy/Paste/Select all for inputs and selected text, in
   the UI language.
3. ✅ One `<Modal>` component: Esc closes (unless busy), focus trapped and returned, background `inert`, shortcuts
   paused while open. Move the three modals onto it.
4. ✅ Unsaved changes on close: an in-app modal in the UI language with Save / Don't save / Cancel (the window's
   close is held until the renderer answers). The trust-folder dialog stays native on purpose (build safety:
   granted only through a main-process dialog) and already uses one language.
5. ✅ Esc leaves the code editor's Tab capture (or Ctrl+Tab / Tab after Esc moves focus), as VS Code does.

## Spacing pass (owner's report, added 2026-11-05) ✅

**R** paddings and margins are off in many places (Settings: the "language" label touches its button).

**F** (CDP audit of all 33 pages/tabs on the owner's project): 137 padding/margin/gap values off any grid (3, 5,
6, 7, 9, 10, 14, 18, 22px); `.lang-switch` had no CSS at all; blocks inside `.section` (hint, box, field row)
touched each other; the Keyboard page's 12 layer tabs forced the editor wider than its column (keyboard,
legend and catalog cut at the right); long button labels ran out of their box (Firmware → keyboard); custom
keycode and key override rows pushed their delete button out of the panel at 110% size.

**Done**
1. ✅ Every padding/margin/gap on the 4px grid (Material's 4/8dp rhythm); `--gap` 12px, `--pad` 24px; sidebar
   items line up at 20px. `src/styles/spacing.test.ts` keeps CSS and inline styles on the grid (`grid-ok`
   comment for alignment values that aren't spacing).
2. ✅ Language row laid out (8px gap, label 12px from its buttons); `.section` children 12px apart.
3. ✅ Layer tabs wrap to a second row; the editor stays inside its column.
4. ✅ Buttons wrap a long label instead of overflowing (min height 32px).
5. ✅ Custom keycode rows narrower; key override rows put the modifiers on a second line.

## Step 3: readable key names everywhere (🟠 6/10)

**R** raw keycodes everywhere, e.g. Advanced → tap-hold shows `LT(Qwerty, 0xC3)`, not what the user put on the layer.

**F**
- `LT(Qwerty, 0xC3)` is a tap-hold action's stand-in keycode (`tapHoldActions.ts:1-25`, bases 0x02/0x03/0xC3-0xCC);
  the real tap/hold lives in `project.tapHoldActions`. The code knows it (`tapHoldActionLookup`, `tapHoldSlots`,
  `labelContext` in `src/lib/projectContext.ts`), and the key drawing uses it, but `keyLabel().qmk`
  (`labels.ts:~262`) is computed before the tap-hold and alias branches, and every place that prints `.qmk`
  shows the stand-in and ignores aliases.
- Places printing raw codes: tap-hold chips (`components/advanced/common.tsx:99`, used by `TapHoldTab.tsx:144,241,316`
  and key lists: `TD(TDI_EXLM)`, `LGUI_T(0x02)`), combo list (`AdvancedPage.tsx:96`), Layers "reached by"
  (`LayersPage.tsx:49,133`), Key inspector layer stack (`KeyInspector.tsx:146,187`), Encoders tile
  (`EncodersPage.tsx:61-63,223`), write plan (`WriteDialog.tsx:92,97`), diff (`DiffView.tsx:35`), the canvas
  tooltip puts the code before the description (`KeyboardCanvas.tsx:365,418`).
- Every keycode input (`KeycodeField`, `common.tsx:22`: combo result, overrides, aliases, tap dance slots,
  composer) is a bare text box for QMK expressions: no picker, no preview of what it means.
- Key caps truncate names to 4-5 characters ("US C…", "HK_U…", "TH_L…", "OS_L…" on the owner's layer 0).
- Combo list rows show the combo's C name (`CM_HM_END_NEWTAB_AT2`) as the title.

**Do**
1. ✅ One core helper `friendlyName(spec, value, ctx)`: alias → tap-hold action ("Space · hold Num") → tap dance
   name → custom keycode name → `keyLabel().main` (+ hold part) → raw expression last. Tests on the owner's kinds
   of keys (stand-ins, `TD()`, `LT`, mod-taps, aliases).
2. ✅ Use it in every place above. The raw expression moves to a tooltip and a "QMK" toggle/secondary line where
   people writing C need it (Firmware tabs stay raw).
3. ✅ `KeycodeField`: friendly preview next to the box, a button that opens the keycode picker, and "pick from
   the keyboard" where a key position makes sense.
   Left over: `KeyChips`' "+ key" box has no preview or catalog button (`common.tsx`).
4. (Step 1 has landed: next.) Key caps: fit text (shrink to a floor, then two lines) before ellipsis; full name in the tooltip.

## Step 4: page structure and safety nets (🟠 6/10)

**F**
- 7 hand-written tab bars (`AdvancedPage.tsx:377`, `FirmwarePage.tsx:29`, `HardwarePage.tsx:522`,
  `ProjectsPage.tsx:611`, `SettingsPage.tsx:214`, `FilesTab.tsx:158`, `OwnTarget.tsx:82`), wrong ARIA
  (`role=tablist` on links without `aria-selected`), forced lowercase (`pages.css:66`). They scroll away with
  the page (`.page-scroll`, the only sticky element is `.inspector-head`).
- Advanced has 10 tabs on two wrapped rows; "NAVI behavior" and "Behavior (config.h)" are easy to confuse.
- The right panel shows "Firmware features" on every page except Keyboard (Layers, Advanced, Settings,
  Firmware...): a quarter of the width with nothing about the page.
- Layers page: layer previews are ~20px keys, unreadable.
- Changing tab remounts the page (`key={section/tab}` + `page-in` animation): scroll position and local edits
  are lost.
- Deletes in Advanced/Macros/Hardware are one click with silent undo (only `KeymapManager.tsx:59` says
  "Ctrl+Z to undo"); `FlashTab.tsx:192` deletes a stored firmware file from disk with no confirm and no undo.
- Error toasts vanish after 2.6-9 s, max 3, no copy; raw `err.message` / `String(err)` in several places
  (`DevicePage.tsx:199`, `LightingPage.tsx:90/161/201`, `KeycodeComposer.tsx:212/225`).
- Strings outside `t()`: `Sidebar.tsx:35,55`, `LightingPage.tsx:115`, `SettingsPage.tsx:150,206`,
  `TargetTab.tsx:116`, `KeycodeComposer.tsx:25-27,330,367`, `FeatureOverview.tsx:39`, `SetupTab.tsx:56/68/112`,
  `HardwarePage.tsx:372-386`.
- Titlebar and sidebar footer repeat a decorative tagline ("KEYS / LAYERS / FIRM…", truncated).
- Colors, sizes and effects beyond the palette are reachable only by editing JSONC (Settings main tab says
  "in the config").

**Do**
1. ✅ One `<Tabs>` component, sticky under the top bar, real ARIA, case as written; move the 7 bars onto it.
2. ✅ Advanced: grouped Keys (tap dance, tap-hold, combos, overrides, leader) · Codes (custom keycodes, aliases,
   unicode) · Behavior ("QMK settings" = config.h, "NAVI additions" = NAVI's own C); group captions sit above
   their tabs so the bar fits one row at 1600px / 110% in both languages.
3. ✅ Right panel only on Keyboard, Hardware and Firmware; the other pages get its width (no per-page panel).
4. ✅ Keep scroll and local state per tab (visited panels stay mounted and hidden; hidden tabs pause listeners).
5. ✅ Every delete: an "Undo" button in its toast; the firmware-file delete gets a confirm.
6. ✅ Error toasts stay until closed, with Copy, clickable over an open `<Modal>` (portal into `body`); messages
   say what failed and what to do, raw detail behind "details".
7. ✅ Wrap the stray strings in `t()`; the tagline only in the sidebar footer (wraps, no longer cut).
   Left as names: "RGB Matrix", "QMK CLI", "qmk_firmware", "keymap", `send-string`'s "hello" (ASCII only).
8. ✅ Settings main tab: colors (picker, hex, reset to palette, reset all), effect and surface sliders, sizes and
   shape (key size, radii, density, font).
9. ✅ Layers page: previews fill a wider column, height from the layout's proportions (~240px).
   Left over: tabs not visited yet have no panel, so their `aria-controls` points nowhere until opened; the
   layer tab bars (Deck, Keyboard page) and the composer's kind chips are not on `<Tabs>`.

## Step 5: hints, help and states (🟠 6/10)

**R** no hints or tooltips anywhere: tap-hold flavors aren't explained, nor any non-obvious feature; QMK docs
links would help (their examples are clear).

**F**
- Tap-hold columns "flavor", "quick tap", "hold when pressed", "key lists" have no explanation
  (`TapHoldTab.tsx:205-244`). Tap dance kinds "every-tap" / "own C" are unexplained (`TapDanceTab.tsx:67-76`);
  its intro is one dense paragraph (`:51`). Combos open with a jargon "reference layers" paragraph.
- Many `config.h` params have no hint (`configParams.ts`: `TAPPING_TOGGLE`, `ONESHOT_TIMEOUT`,
  `ONESHOT_TAP_TOGGLE`, Caps Word, `MOUSEKEY_*`, ...); some Russian titles stay English (`:51-63`).
- Hardware/Setup terms (USB VID/PID, RGB Matrix, QMK MSYS, userspace) unexplained.
- 41 disabled buttons with no reason (max reached, nothing selected, not connected...), e.g.
  `TapHoldTab.tsx:296` has two reasons and no text; `LayersPage.tsx:82` (32-layer cap).
- Empty lists (combos, tap dances, overrides, aliases, macros) show only an add button; no "what this is / how
  to start".
- Each Advanced tab opens with "Current firmware: UNKNOWN · your build: off (change)": unclear what is off and
  what to do, shown even when the project already uses the feature.

**Do**
1. ✅ One `InfoTip` ("?" next to a label: hover or focus shows 1-3 plain sentences + an optional "QMK docs" link,
   opened in the system browser). Every QMK concept and every non-obvious field gets one; each docs URL is opened
   and checked when added (`npm run check:docs`; it found 3 dead registry links, fixed).
2. ✅ Fill the missing `configParams` hints and Russian titles (all 41 shown params; docs links on 34).
3. ✅ Disabled controls say why (tooltip or inline text): one convention, applied to all 41 (`whyDisabled`, ~80
   sites; `hintsConvention.test.ts` rejects a bare `disabled={…}`).
4. ✅ Empty-state block for every list: one line on what it does, one example, the add button.
5. ✅ Rewrite the firmware-status banner as a plain sentence with the action ("Tap dance isn't in your firmware
   yet: it's added when you build and flash" / "...turned off: turn on").
   Left over: no tips on tap dance "every tap" Shift/Ctrl columns and `ModsInput`; Hardware's "other controls" list
   and the macro step list keep their old empty look; a disabled button's reason is a mouse tooltip only
   (keyboard and screen readers can't reach a disabled button); at the smallest window (980 px) the Firmware →
   Features table squeezes its "feature" and "needed by" columns to nothing (fixed columns too wide, was so before
   step 5 too).
   Follow-up (owner's review): a tip that lists options shows one per line with the term in bold (`TipText`), and
   a "?" never wraps away from its label; column heads with tips stay on one line, columns widened to fit both
   languages.

## Step 6: combos tab (🟠 7/10)

**R** unreadable with many combos; scrolling the list scrolls the keyboard away; no way to click a key and see
its combos; "new combo" says to select keys but keys can't be selected there.

**F**
- `CombosTab` (`AdvancedPage.tsx:34-150`): 12-row "reference layers" table first, so the list starts below the
  fold; list and editor share one page scroll (no sticky).
- New combo (`:81-89`) adds an empty combo; the preview (`LayoutPreview`) is `aria-hidden` with no click
  handlers. Keys come only from the Keyboard page's selection via "take selected keys (N)" (`:127`), explained
  only in that button's tooltip; the preview doesn't show the pending selection.
- No filter by key, no search, no overview of which keys carry combos; the list key text drops hold parts;
  `layers` (limit to layers) exists in the model but isn't editable here; names default to `combo_N`.

**Do**
1. ✅ Layout: keyboard on top, sticky; list below scrolls on its own. Reference layers move into a collapsed
   "advanced" section.
2. ✅ The keyboard is clickable: New combo enters key-pick mode (click keys, Enter/Done to finish, Esc cancels);
   editing a combo's keys works the same way.
3. ✅ Every key shows a small count of combos using it; clicking a key (outside pick mode) filters the list to
   its combos; a search box filters by name, key or result.
4. ✅ List rows read "Y + U → !" (Step 3 names), C name secondary; the combo's keys highlight on hover.
5. ✅ "Limited to layers" editable; default name built from keys and result.
   Done as: the keyboard, the open combo and the search/add bar stick together under the tab bar (not sticky below
   760px height or 1100px width); the list scrolls under them. "Take selected keys" (from the Keyboard page) is gone:
   the pick mode replaces it. Layer chips open behind "limit" so the sticky block stays short. A default name
   (CM_J_K_ESC) follows key/result edits until the user types one; old combo_N names follow too.
   Left over: Ctrl+F for the search box waits for Step 8; a filtered list can still show an open combo that isn't in it.
6. ✅ Layer filter beside the search (owner's ask): all · not limited to layers · layer N (combos whose limit
   includes N; unlimited ones aren't listed there), each with its count; key badges count only the filtered combos.

## Step 7: how to reach a layer (🟠 6/10)

**R** no way to see which keys lead to a layer (in code it's a global search for the layer name).

**F** `LayersPage.tsx:41-53,133` lists up to 6 raw `qmk` strings for plain layer keys only. Missed sources:
tap dances with layer slots, tap-hold actions, combos with layer results, encoders, overrides. `ops.ts`
already walks every layer reference for renumbering (`remapAllLayerRefs`, not exported; `remapLayerRef:141`).

**Do**
1. ✅ Core `layerRefs(project)` → `{layer, how (MO/LT/TG/TO/TT/OSL/DF/LM), source: key position | tap dance slot |
   combo | tap-hold action | encoder | override}`; renumbering shares the same walker. Tests.
2. ✅ "How to get here" panel for the current layer (Keyboard page right panel when no key is selected, and on the
   Layers page): each route as a sentence ("hold Space on Sturdy", "combo Y + U on any layer", "double tap
   TDI_NUM"), click → that layer opens with the key highlighted.
3. ✅ On the keyboard, hovering a layer tab highlights the keys that lead to it on the shown layer.
4. Check in after a few days of use.
   Done as: a route's source is where it's pressed (a key on a layer, an encoder, a combo); a tap dance or tap-hold
   action inside it is its `via` + `part` ("double tap TD_NUM"). Overrides are left out: QMK sends a replacement
   with `register_code`, which can't switch a layer (leader and own keycodes, `tap_code16`, likewise). Renumbering
   shares `layerTarget` (how a keycode points at a layer), not the whole walk: it rewrites 9 kinds of data, the walk
   reads 3; a test moves and deletes layers and checks both agree. Same sentences merge into one line, each layer a
   link ("hold Space on Sturdy, Qwerty"); an encoder link opens that encoder. The deck's layer buttons hover the
   same way as the Keyboard page's tabs.

## Step 8: search (🔴 8/10)

**R** finding anything across the tabs is very bothersome; wants per-tab and global search.

**F** only two search fields (keycode picker `KeycodePicker.tsx:91-109`, target keyboards `TargetTab.tsx:102`).
No search in combos, tap dances, tap-hold, overrides, macros, behavior params (~70), settings, projects. Section
titles are defined twice (`Sidebar.tsx:9-21`, `TopBar.tsx:10-22`) and tab lists inline in each page.

**Do**
1. ✅ One registry of sections and tabs (titles en/ru, icon, route) feeding sidebar, top bar and search.
2. ✅ Per-tab filter box on every list tab and on Behavior; Ctrl+F focuses it.
3. ✅ Global search, Ctrl+K: pages/tabs, settings, config params (title, define, hint), layers, keys (by friendly
   name, alias or keycode → "layer Nav, left hand row 2"), combos, tap dances, tap-hold settings, macros,
   aliases, custom keycodes. Enter jumps there and highlights the item.
4. Check in after a few days of use.
   Done as: `src/lib/sections.ts` holds sections and tabs; pages take their tab bars from it. Filter boxes on tap
   dance, tap-hold (one box for key lists and settings), combos (its search box), overrides, leader, custom
   keycodes, aliases, unicode, QMK settings, macros, layers, projects; Esc clears, a count shows shown / total.
   Ctrl+F opens the global search like Ctrl+K (owner's pick after trying it); filter boxes are clicked. The search also finds encoders, key lists, overrides,
   leader sequences, unicode entries and other projects, in both languages at once ("живая" finds Live write in
   English). A key result opens its layer with the key highlighted (as Step 7's links); others land on the row,
   scroll it below the sticky blocks and flash it.
   Left over: no filter on Encoders, Lighting, Hardware, Firmware (features table) and NAVI additions; the search
   doesn't look inside the config JSONC text.

## Step 9: key names and text, the rest (🟡 5/10)

Loose ends found 2026-11-05 (the earlier steps' "Left over" lines + a read-only code pass over Encoders, Lighting,
Macros, Hardware, Device, Projects, Firmware, the composer and the picker). Line numbers from 2fdeb75.

**Do**
1. Step 3.4, still open: key caps fit their text (shrink to a floor, then two lines) before the ellipsis
   (`KeyboardCanvas.tsx:346-388`, `trimLabel` + `maxChars`); full name stays in the tooltip.
2. Friendly name first, raw QMK in the tooltip only: encoder tile tooltip (`EncodersPage.tsx:66`, builds from
   `l.qmk` + `keyLabel`), encoder-press row tooltip (`:257`), preset chips (`:228-231`, `KC_VOLD / KC_VOLU`),
   the picker's parsed preview (`KeycodePicker.tsx:78`, `qmk · text`).
3. `KeyChips`' "+ key" box gets the `KeycodeField` preview and catalog button (Step 3 leftover, `common.tsx`).
4. Strings outside `t()`: the `enter` hint (`KeycodeComposer.tsx:404`, `EncodersPage.tsx:61`), `aria-label="Tap
   dance"` (`KeycodeComposer.tsx:367`), kind label `'tap dance'` (`:27`), `deviceStore.ts:120` "device not
   found", the pin check's bare `ok` (`PinsTab.tsx:336`, styled as a warning: make it a neutral "no problems").
5. Issue levels printed raw ("error"/"warning"/"err"/"warn"/"note": `HardwarePage.tsx:314`, `ProjectsPage.tsx:56`,
   `OwnTarget.tsx:98`, `PinsTab.tsx:332`, `BuildLog.tsx:49`): one shared level → `t()` label.

## Step 10: errors, deletes, keyboard access (🟡 5/10)

**Do**
1. Raw `err.message` / `String(err)` still shown (Step 4.6 missed these): device connect (`deviceStore.ts:62` →
   `DevicePage.tsx:203-205`), flash result (`FlashTab.tsx:163,179`, shown at `:392`), project import/open
   issues (`ProjectsPage.tsx:100,121,172,472`, `HardwarePage.tsx:620`: a raw `JSON.parse` error), composer
   (`KeycodeComposer.tsx:223,242`). A sentence saying what failed and what to do; raw text behind "details".
2. Deletes (Step 4.5 missed these): project delete (`ProjectsPage.tsx:404`, moved to `.trash`, toast without
   Undo: add restore; the armed second click also changes `aria-label`), "remove pin description"
   (`PinsTab.tsx:342`, silent), macro "clear" (`MacrosPage.tsx`, silent): `deletedToast` with Undo.
3. Encoder inline edit cancels on blur (`EncodersPage.tsx:60`): a right-click or stray click throws away a
   half-typed expression. Blur commits when valid, else keeps the text and the error.
4. Result and error notices announce themselves: `role="status"` / `role="alert"` on the flash result
   (`FlashTab.tsx:392`), device errors (`DevicePage.tsx:205`) and the other `.notice` blocks.
5. Disabled reasons reach the keyboard and screen readers (Step 5 leftover): `whyDisabled` keeps the button
   focusable (`aria-disabled` + blocked click) or ties the reason with `aria-describedby`.
   `hintsConvention.test.ts` also rejects a bare `disabled` attribute, not only `disabled={…}`.

## Step 11: structure leftovers (🟠 6/10)

**Do**
1. The layer tab bars (Deck, Keyboard page) and the composer's kind chips onto `<Tabs>` (Step 4 leftover); tabs
   not visited yet still get a panel element so `aria-controls` points somewhere.
2. Filter boxes on Encoders, Lighting, Hardware, Firmware → Features and NAVI additions, like Step 8's (Esc
   clears, shown / total count).
3. Combos: an open combo that the filter hides closes, or the list says it's filtered out (Step 6 leftover).
4. Firmware → Features at the smallest window (980px): "feature" and "needed by" columns keep a readable width
   (Step 5 leftover).
5. Tips on tap dance "every tap" Shift/Ctrl columns and `ModsInput`; the Step 5 empty-state block on Hardware's
   "other controls", the macro step list (`MacrosPage.tsx:208`) and the build env chips (`BuildTab.tsx:120`).

## Not in this plan
- A redesign or new visual style: the look stays.
- Touch/mobile layouts: desktop app; minimum window 980x640 stays.
