# Dilemma 4x6 clone (lucky_studio)

NAVI started as a tool for this keyboard, so it ships a template for it (Projects → new project → Template).
Everything below was read from a real keyboard over VIA (read-only) on 2026-10-22, or is marked as a guess.

## What is known

| | |
|---|---|
| USB | VID `0xAFC5`, PID `0xBFC5`, “lucky_studio Dilemma_4X6”, version 0.0.1 |
| Firmware | the seller's own QMK build with VIA (protocol 12); **source code is not available** |
| Matrix | 10 × 6 (5 rows per half) |
| Layers | 4 |
| Encoders | 2, encoder map on |
| Macros | 16, 3544-byte buffer |
| Lighting | RGB Matrix over VIA (channel 3), 44 effects (same set as the official Dilemma Max — a guess) |
| USB interfaces | keyboard, Raw HID (`0xFF60`), mouse, system/consumer |

Physically (from a photo): per half 24 keys + 3 thumb keys + a knob at the start of the thumb arc;
a round trackpad (≈ 40 mm) on the right half near the inner edge. Column stagger matches the official Dilemma Max.

## Differences from the official Dilemma Max (`bastardkb/dilemma/4x6_4`)

- Different USB IDs and firmware.
- The seller's keymap fills 5 thumb positions per half (`[4,1…5]`, `[9,0…4]`), but physically there are only 3 keys and a knob.
  `[4,3]` and `[9,2]` have no physical key; the knob presses are probably `[4,1]` and `[9,4]`.
- The right half is wired inside-out: `[5,0]` is the “6” key (in the official board it is column 5).
  Because of this the right half may come out mirrored with the official target.
- The microcontroller is not confirmed (the Dilemma Max uses an RP2040). Pins are not confirmed.

## Before flashing your own firmware

1. Save the current firmware of **both halves**: put one half into the bootloader (an `RPI-RP2` drive appears),
   open Firmware → flash → “save current firmware”. This is a full copy of the board's flash and is the only way back,
   because the seller's source is not available. Repeat for the other half.
2. The seller's keymap has no `QK_BOOT` key. Use the reset/BOOT button, or Bootmagic
   (hold the top-left key while plugging in — note that Bootmagic also clears the settings saved in the keyboard).

