# Languages and the "my own program" text route

Advanced → Languages lists the languages the keyboard types in. The firmware can't read the computer's layout, so
it keeps its own idea of the current language (`navi_language()`). Only the language keys, or your own code calling
`navi_set_language()`, change it. Nothing is saved: after power-on the first language in the list is active.

A language with "plain keys" ticked (English on a US layout) types everything with ordinary key presses. In any
other language, text from macros, custom keycodes and leader strings, and the symbol keys on non-typing layers, go
through the text route. This page describes the route called "My own program": a program on your computer receives
the text and types it.

## What the firmware calls

With this route NAVI's generated C declares two functions and your code must define them (in `keymap.c` own lines,
or in your own files with the own pipeline):

```c
void navi_type_text_user(const char *text);
void navi_switch_language_user(uint8_t language);
```

`navi_switch_language_user(language)` is called when a language key is pressed (or your code calls
`navi_switch_language()`). `language` is the index in the Languages list, also available as `NAVI_LANG_<CODE>`
(`NAVI_LANG_RU`). Your program should switch the computer's layout to that language. The keyboard does not tap the
OS shortcut on this route.

`navi_type_text_user(text)` gets a zero-terminated string to type. How the bytes reach the computer (raw HID,
the console, anything else) is up to you; NAVI only produces them.

When the computer changes its language by other means and your program tells the keyboard, call
`navi_set_language(language)`. It changes the keyboard's language and its layer without calling
`navi_switch_language_user` back.

## The text format

`text` uses QMK's `send_string` byte format:

- UTF-8 text, any characters.
- `\n` is Enter, `\t` is Tab, `\b` is Backspace.
- `0x01 0x01 <kc>` taps a key, `0x01 0x02 <kc>` presses it, `0x01 0x03 <kc>` releases it. `<kc>` is a basic QMK
  keycode (`KC_A` = 0x04, `KC_LSFT` = 0xE1), the same as QMK's `SS_TAP`, `SS_DOWN` and `SS_UP`.

Macros hold basic keys only, so Ctrl+Enter in a macro is three steps (Ctrl down, Enter tap, Ctrl up) and arrives
as three codes. Your program should type the text and press or release the keys in the order they come.

### Macros

A macro step list is split in two. The steps before its first text step are played by the keyboard itself. From the
first text step on, every step goes into the string for your program, keys included, so a key the keyboard sends
can't overtake text the program is still typing. Delays are the exception: the string is cut at a delay, the
keyboard waits, and the rest arrives in the next call.

Example: tap `A`, type `hi`, tap `B`. In a non-plain language the keyboard taps `A` and then calls
`navi_type_text_user("hi\x01\x01\x05")`.

### Symbol keys

On a layer that isn't a typing layer (by default every layer except the base layer and the languages' layers), the
symbol keys `1`-`0` and `- = [ ] \ ; ' , . /` and the grave key type their US character through the route, so
the computer's layout can't change them. Shift picks the shifted character (`!` for `1`). With Ctrl, Alt or GUI
held they stay ordinary keys, for shortcuts. Held, they repeat at the auto repeat rate, one call per character.

### VIA macros

With VIA on, a VIA macro is read from the keyboard's memory and sent to your program in pieces of up to 32 bytes.
A piece never ends inside a UTF-8 character or a `0x01` key code, so each call is complete on its own.

## A minimal example

```c
void navi_type_text_user(const char *text) {
    // Send `text` to your program, for example over raw HID in 32-byte reports.
}

void navi_switch_language_user(uint8_t language) {
    // Tell your program to switch the computer to `language`.
}
```

If your messages to the program are smaller than the string, split them yourself without cutting a UTF-8 character
or a `0x01 <code> <kc>` sequence, or join the pieces on the computer before typing.
