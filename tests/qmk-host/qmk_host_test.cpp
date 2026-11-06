// Plays key sequences on the keymap.c NAVI generated (fixture.test.ts) inside QMK's unit test framework and checks
// the HID reports the computer would get. Positions are row 0 of the test matrix:
//   0 LT(1, KC_SPC)   1 LSFT_T(KC_P) hold-preferred   2 KC_C (layer 2: KC_V)
//   3 tap C(KC_Z) / hold layer 2 + Ctrl   4 tap S(KC_1) / hold Alt, hold-preferred   5 tap KC_A / hold C(KC_X)
//   6 LCTL_T(KC_D) holds when KC_C is pressed   7 KC_E   8 tap C(KC_C) / hold Ctrl, a stand-in on KC_ALTERNATE_ERASE
// Tap dances on rows 1 and 2 (position n = row n / 10, column n % 10):
//   10 tap C(KC_C)   11 tap KC_Q / hold LM(1, MOD_LSFT)   12 tap KC_SPC / hold KC_LSFT   13 KC_N (layer 1: KC_A)
//   14 tap KC_T / double tap TG(1) (layer 1: KC_B)   15 tap LT(1, KC_X)
//   16 every tap: "!" (Shift: "->"), "="   17 every tap: "a"   18 every tap: "a" (Shift: nothing)
//   19 every tap: HOST_KEY (the own lines tap KC_Z)   20 own C: host_each taps KC_X on the second tap   21 KC_LSFT
//   22 every tap: tap KC_A, tap KC_B   23 tap: the stand-in at 3 / hold: the stand-in at 4
// Combos (layers 1 and 2 read combo keys from themselves, layer 0 and 3 from layer 0):
//   30 MO(1)   31 MO(2)
//   32 33 Q W (layer 1: 1 2) → ESC   34 35 R T (layer 2: 3, transparent) → ENTER
//   36 37 Y U → G, only with layer 1 on top   38 39 I O → X on layer 0, Y on layer 1
//   24 LSFT_T(KC_A) holds when KC_Z is pressed   25 26 K L → Z
//   27 28 F H → the every-tap dance at 16
// Auto repeat (delay 300 ms, rate 50 ms), on layer 2 (hold 31):
//   5 MC_0 taps A, repeats   6 REP_KEY types "b", repeats   7 MC_1 taps C, doesn't repeat
#include <string>
#include <vector>

#include "keyboard_report_util.hpp"
#include "keycode.h"
extern "C" {
#include "keymap_introspection.h"
}
#include "test_common.hpp"
#include "test_fixture.hpp"
#include "test_keymap_key.hpp"

using testing::_;
using testing::Invoke;

// A report as text: modifiers and keys joined by +, "-" when nothing is down. Letters and digits by name.
static std::string report_text(const report_keyboard_t &r) {
    static const char *mod_names[] = {"LCTL", "LSFT", "LALT", "LGUI", "RCTL", "RSFT", "RALT", "RGUI"};
    std::vector<std::string> parts;
    for (int i = 0; i < 8; i++)
        if (r.mods & (1 << i)) parts.push_back(mod_names[i]);
    for (int i = 0; i < KEYBOARD_REPORT_KEYS; i++) {
        uint8_t k = r.keys[i];
        if (!k) continue;
        if (k >= KC_A && k <= KC_Z)
            parts.push_back(std::string(1, (char)('A' + k - KC_A)));
        else if (k >= KC_1 && k <= KC_9)
            parts.push_back(std::string(1, (char)('1' + k - KC_1)));
        else {
            char hex[8];
            snprintf(hex, sizeof hex, "0x%02X", k);
            parts.push_back(hex);
        }
    }
    if (parts.empty()) return "-";
    std::string s;
    for (auto &p : parts) s += (s.empty() ? "" : "+") + p;
    return s;
}

class NaviHost : public TestFixture {
   public:
    NaviHost() {
        for (uint8_t layer = 0; layer < keymap_layer_count_raw(); layer++)
            for (uint8_t row = 0; row < MATRIX_ROWS; row++)
                for (uint8_t col = 0; col < MATRIX_COLS; col++) add_key(KeymapKey(layer, col, row, keycode_at_keymap_location_raw(layer, row, col)));
        ON_CALL(driver, send_keyboard_mock(_)).WillByDefault(Invoke([this](report_keyboard_t &r) {
            std::string t = report_text(r);
            if (reports.empty() || reports.back() != t) reports.push_back(t);
        }));
    }

   protected:
    // Presses (+n) and releases (-n) one scan apart, n = row * 10 + col; "wait" waits out the tapping term,
    // "idle:N" waits N ms.
    // settle: wait out the tapping term at the end too (false: the reports as they are right after the last step).
    std::string play(const std::vector<std::string> &steps, bool settle = true) {
        for (auto &s : steps) {
            if (s == "wait") {
                idle_for(TAPPING_TERM + 1);
                continue;
            }
            if (s.rfind("idle:", 0) == 0) {
                idle_for(std::stoi(s.substr(5)));
                continue;
            }
            int n = std::stoi(s.substr(1));
            if (s[0] == '+')
                press_key(n % 10, n / 10);
            else
                release_key(n % 10, n / 10);
            run_one_scan_loop();
        }
        if (settle) idle_for(TAPPING_TERM + 1);
        std::string joined;
        for (auto &r : reports) joined += (joined.empty() ? "" : " ") + r;
        return joined;
    }

    testing::NiceMock<TestDriver> driver;
    std::vector<std::string>      reports;
};

// QMK's replay trap: the mod-tap's press and release were held back behind the undecided LT
TEST_F(NaviHost, hold_preferred_mod_tap_rolled_behind_an_undecided_layer_tap_holds) {
    EXPECT_EQ(play({"+0", "+1", "+2", "-1", "-2", "wait", "-0"}), "LSFT LSFT+C C -");
}

TEST_F(NaviHost, hold_preferred_mod_tap_rolled_alone_holds) {
    EXPECT_EQ(play({"+1", "+2", "-1", "-2"}), "LSFT LSFT+C C -");
}

TEST_F(NaviHost, hold_preferred_mod_tap_tapped_alone_taps) {
    EXPECT_EQ(play({"+1", "-1"}), "P -");
}

TEST_F(NaviHost, tap_of_a_layer_and_ctrl_key_sends_ctrl_z) {
    EXPECT_EQ(play({"+3", "-3"}), "LCTL LCTL+Z LCTL -"); // QMK sends a modded key's modifier first
}

TEST_F(NaviHost, hold_of_a_layer_and_ctrl_key_holds_ctrl_on_layer_2) {
    EXPECT_EQ(play({"+3", "wait", "+2", "-2", "-3"}), "LCTL LCTL+V LCTL -");
}

TEST_F(NaviHost, tap_of_an_alt_key_sends_shift_1) {
    EXPECT_EQ(play({"+4", "-4"}), "LSFT LSFT+1 LSFT -");
}

TEST_F(NaviHost, hold_of_an_alt_key_holds_alt) {
    EXPECT_EQ(play({"+4", "wait", "+2", "-2", "-4"}), "LALT LALT+C LALT -");
}

TEST_F(NaviHost, hold_preferred_stand_in_rolled_behind_an_undecided_layer_tap_holds) {
    EXPECT_EQ(play({"+0", "+4", "+2", "-4", "-2", "wait", "-0"}), "LALT LALT+C C -");
}

TEST_F(NaviHost, key_hold_stand_in_taps_its_tap) {
    EXPECT_EQ(play({"+5", "-5"}), "A -");
}

TEST_F(NaviHost, key_hold_stand_in_holds_its_key) {
    EXPECT_EQ(play({"+5", "wait", "-5"}), "LCTL LCTL+X LCTL -");
}

TEST_F(NaviHost, hold_key_rolled_behind_an_undecided_layer_tap_holds) {
    EXPECT_EQ(play({"+0", "+6", "+2", "-6", "-2", "wait", "-0"}), "LCTL LCTL+C C -");
}

TEST_F(NaviHost, other_key_rolled_behind_an_undecided_layer_tap_still_taps) {
    EXPECT_EQ(play({"+0", "+6", "+7", "-6", "-7", "wait", "-0"}), "D D+E E -");
}

// A stand-in whose base is a real key (KC_ALTERNATE_ERASE, 0x99): the base is never sent
TEST_F(NaviHost, stand_in_on_a_real_key_taps_its_tap) {
    EXPECT_EQ(play({"+8", "-8"}), "LCTL LCTL+C LCTL -");
}

TEST_F(NaviHost, stand_in_on_a_real_key_holds_ctrl) {
    EXPECT_EQ(play({"+8", "wait", "+7", "-7", "-8"}), "LCTL LCTL+E LCTL -");
}

// ── Tap dances ──

// H1: a modded key in a slot
TEST_F(NaviHost, tap_dance_tap_slot_sends_ctrl_c) {
    EXPECT_EQ(play({"+10", "-10"}), "LCTL LCTL+C LCTL -");
}

// H2: a layer + mods key in the hold slot
TEST_F(NaviHost, tap_dance_hold_slot_holds_layer_1_with_shift) {
    EXPECT_EQ(play({"+11", "wait", "+13", "-13", "-11"}), "LSFT LSFT+A LSFT -");
}

// H3: no double tap and no tap-hold: the tap fires on release, before the tapping term ends
TEST_F(NaviHost, tap_only_dance_taps_on_release) {
    EXPECT_EQ(play({"+12", "-12"}, false), "0x2C -");
    EXPECT_EQ(play({"+12", "-12"}, false), "0x2C - 0x2C -"); // a new dance, not a double tap
    EXPECT_EQ(play({}), "0x2C - 0x2C -");
}

TEST_F(NaviHost, tap_only_dance_holds_after_the_term) {
    EXPECT_EQ(play({"+12", "wait", "+13", "-13", "-12"}), "LSFT LSFT+N LSFT -");
}

// H4: a layer toggle on double tap doesn't press the key at the dance's spot on the new layer
TEST_F(NaviHost, tap_dance_double_tap_toggles_layer_1_without_its_key) {
    EXPECT_EQ(play({"+14", "-14", "+14", "-14", "wait"}), "");
    EXPECT_EQ(play({"+13", "-13"}), "A -");
}

// H5: a layer-tap in the tap slot taps its key
TEST_F(NaviHost, tap_dance_layer_tap_in_tap_slot_taps_x) {
    EXPECT_EQ(play({"+15", "-15"}), "X -");
}

// H6: every tap plays the next step at once, adding to what the earlier taps typed, then starts again
TEST_F(NaviHost, every_tap_dance_cycles_its_steps) {
    EXPECT_EQ(play({"+16", "-16"}, false), "LSFT LSFT+1 LSFT -");
    EXPECT_EQ(play({"+16", "-16", "+16", "-16"}), "LSFT LSFT+1 LSFT - 0x2E - LSFT LSFT+1 LSFT -");
}

TEST_F(NaviHost, every_tap_dance_shift_variant_plays_without_shift) {
    EXPECT_EQ(play({"+21", "+16", "-16", "-21"}), "LSFT 0x2D - LSFT LSFT+0x37 LSFT - LSFT -");
}

// H7: a variant not set falls back to no mods with the mods kept; one set empty types nothing
TEST_F(NaviHost, every_tap_dance_unset_shift_variant_keeps_shift) {
    EXPECT_EQ(play({"+21", "+17", "-17", "-21"}), "LSFT LSFT+A LSFT -");
}

TEST_F(NaviHost, every_tap_dance_empty_shift_variant_types_nothing) {
    EXPECT_EQ(play({"+21", "+18", "-18", "-21"}), "LSFT -");
}

// H8: a custom keycode played by a step reaches the own lines
TEST_F(NaviHost, every_tap_dance_custom_keycode_runs_own_code) {
    EXPECT_EQ(play({"+19", "-19"}), "Z -");
}

// H9: an own-C dance calls the user's function
TEST_F(NaviHost, own_c_dance_calls_own_function) {
    EXPECT_EQ(play({"+20", "-20", "+20", "-20"}), "X -");
}

// Keys an every-tap step plays don't end the dance (QMK takes any other key's press for an interruption)
TEST_F(NaviHost, every_tap_dance_with_key_steps_keeps_cycling) {
    EXPECT_EQ(play({"+22", "-22", "+22", "-22", "+22", "-22"}), "A - B - A -");
}

// Interrupted by another key = a tap, typed before that key (fast typing: dance down, N down, dance up, N up)
TEST_F(NaviHost, tap_only_dance_interrupted_taps_before_the_other_key) {
    EXPECT_EQ(play({"+12", "+13", "-12", "-13"}), "0x2C - N -");
    reports.clear();
    EXPECT_EQ(play({"+12", "+13", "-13", "-12"}), "0x2C - N -");
}

// A dance with a double tap, interrupted after one tap (released or still held): the tap, then the other key
TEST_F(NaviHost, double_tap_dance_interrupted_after_one_tap_taps_first) {
    EXPECT_EQ(play({"+14", "-14", "+13", "-13"}), "T - N -");
    reports.clear();
    EXPECT_EQ(play({"+14", "+13", "-14", "-13"}), "T - N -");
}

// Interrupted on the second tap: the double tap plays first (TG(1): the other key comes from layer 1)
TEST_F(NaviHost, double_tap_dance_interrupted_on_the_second_tap_plays_the_double_tap_first) {
    EXPECT_EQ(play({"+14", "-14", "+14", "+13", "-13", "-14"}), "A -");
}

// Stand-ins of tap-hold keys with actions in the slots: their tap and hold sides
TEST_F(NaviHost, tap_dance_stand_in_in_tap_slot_taps_its_tap) {
    EXPECT_EQ(play({"+23", "-23"}), "LCTL LCTL+Z LCTL -");
}

TEST_F(NaviHost, tap_dance_stand_in_in_hold_slot_holds_its_hold) {
    EXPECT_EQ(play({"+23", "wait", "+7", "-7", "-23"}), "LALT LALT+E LALT -");
}

// C1: layer 1 reads combo keys from itself (1 2), layer 0 from layer 0 (Q W)
TEST_F(NaviHost, combo_on_a_layer_reading_itself_fires_by_its_own_keys) {
    EXPECT_EQ(play({"+30", "+32", "+33", "-32", "-33", "-30"}), "0x29 -");
}

TEST_F(NaviHost, combo_fires_on_layer_0_by_layer_0_keys) {
    EXPECT_EQ(play({"+32", "+33", "-32", "-33"}), "0x29 -");
}

TEST_F(NaviHost, keys_of_a_layer_reading_itself_type_alone) {
    EXPECT_EQ(play({"+30", "+32", "-32", "-30"}), "1 -");
}

// C2: on layer 2 (reads itself) 35 is transparent: it reads layer 0's reference, so the combo still fires
TEST_F(NaviHost, combo_with_a_transparent_key_fires_on_a_layer_reading_itself) {
    EXPECT_EQ(play({"+31", "+34", "+35", "-34", "-35", "-31"}), "0x28 -");
}

// C3: limited to layer 1, which must be the highest active layer
TEST_F(NaviHost, combo_limited_to_layer_1_does_not_fire_under_layer_2) {
    EXPECT_EQ(play({"+30", "+31", "+36", "+37", "-36", "-37", "-31", "-30"}), "Y Y+U U -");
}

TEST_F(NaviHost, combo_limited_to_layer_1_fires_with_layer_1_on_top) {
    EXPECT_EQ(play({"+30", "+36", "+37", "-36", "-37", "-30"}), "G -");
}

// C4: the same keys, one combo per layer
TEST_F(NaviHost, same_keys_give_x_on_layer_0) {
    EXPECT_EQ(play({"+38", "+39", "-38", "-39"}), "X -");
}

TEST_F(NaviHost, same_keys_give_y_on_layer_1) {
    EXPECT_EQ(play({"+30", "+38", "+39", "-38", "-39", "-30"}), "Y -");
}

// C5: a mod-tap that holds when KC_Z is pressed, rolled into the combo whose result is KC_Z
TEST_F(NaviHost, mod_tap_rolled_into_a_combo_holds_for_its_result) {
    EXPECT_EQ(play({"+24", "+25", "+26", "-24", "-25", "-26"}), "LSFT LSFT+Z Z -");
}

TEST_F(NaviHost, mod_tap_rolled_into_a_combo_behind_an_undecided_layer_tap_holds) {
    EXPECT_EQ(play({"+0", "+24", "+25", "+26", "-24", "-25", "-26", "wait", "-0"}), "LSFT LSFT+Z Z -");
}

TEST_F(NaviHost, mod_tap_tapped_before_a_combo_taps) {
    EXPECT_EQ(play({"+24", "-24", "+25", "+26", "-25", "-26"}), "A - Z -");
}
// C6: a combo whose result is the every-tap dance at 16 ("!", Shift: "->"); alone it types "!"
TEST_F(NaviHost, combo_result_every_tap_dance_types_its_first_step) {
    EXPECT_EQ(play({"+27", "+28", "-27", "-28"}, false), "LSFT LSFT+1 LSFT -");
}

// A hold-preferred LSFT_T (1) rolled into the combo holds, and the dance plays its Shift variant
TEST_F(NaviHost, hold_preferred_mod_tap_rolled_into_a_tap_dance_combo_plays_the_shift_variant) {
    EXPECT_EQ(play({"+1", "+27", "+28", "-27", "-28", "-1"}), "LSFT 0x2D - LSFT LSFT+0x37 LSFT - LSFT -");
}

// C7: a combo whose result is a slots dance (TD 12: tap C(KC_C), hold KC_LSFT). A combo event sits at matrix 0,0,
// where the real key 0 (LT(1, KC_SPC)) is: the dance must not take its position. QMK keeps a combo whose keys are all
// down until COMBO_TERM runs out, and the dance's tapping term starts only then: a hold needs two waits.
TEST_F(NaviHost, combo_slots_dance_tapped_taps_ctrl_c) {
    EXPECT_EQ(play({"+9", "+29", "-9", "-29"}), "LCTL LCTL+C LCTL -");
}

TEST_F(NaviHost, combo_slots_dance_held_shifts_another_key) {
    EXPECT_EQ(play({"+9", "+29", "wait", "wait", "+7", "-7", "-9", "-29"}), "LSFT LSFT+E LSFT -");
}

TEST_F(NaviHost, combo_slots_dance_held_while_the_key_at_0_0_is_tapped) {
    EXPECT_EQ(play({"+9", "+29", "wait", "wait", "+0", "-0", "-9", "-29", "+32", "-32"}), "LSFT LSFT+0x2C LSFT - Q -");
}

TEST_F(NaviHost, combo_slots_dance_held_while_the_key_at_0_0_holds_its_layer) {
    EXPECT_EQ(play({"+9", "+29", "wait", "wait", "+0", "wait", "-9", "-29", "-0", "+32", "-32"}), "LSFT - Q -");
}

TEST_F(NaviHost, combo_slots_dance_tapped_on_the_layer_of_the_key_at_0_0) {
    EXPECT_EQ(play({"+0", "wait", "+9", "+29", "-9", "-29", "-0", "+32", "-32"}), "LCTL LCTL+C LCTL - Q -");
}

TEST_F(NaviHost, key_at_0_0_taps_normally_after_a_combo_slots_dance_hold) {
    EXPECT_EQ(play({"+9", "+29", "wait", "wait", "-9", "-29", "+0", "-0"}), "LSFT - 0x2C -");
}

// Auto repeat: a ticked key runs its action on press, again after the delay (300 ms), then every 50 ms until released.
TEST_F(NaviHost, repeating_macro_held_runs_again_after_the_delay_then_at_the_rate) {
    EXPECT_EQ(play({"+31", "+5", "idle:420", "-5", "idle:200", "-31"}), "A - A - A - A -");
}

TEST_F(NaviHost, repeating_macro_tapped_runs_once) {
    EXPECT_EQ(play({"+31", "+5", "-5", "idle:400", "-31"}), "A -");
}

TEST_F(NaviHost, repeating_custom_keycode_held_repeats_its_string) {
    EXPECT_EQ(play({"+31", "+6", "idle:320", "-6", "-31"}), "B - B -");
}

// One key repeats at a time: the last pressed. The earlier one does not come back when the newer is released.
TEST_F(NaviHost, repeating_key_pressed_last_takes_over_the_repeat) {
    EXPECT_EQ(play({"+31", "+5", "idle:100", "+6", "idle:320", "-6", "idle:400", "-5", "-31"}), "A - B - B -");
}

TEST_F(NaviHost, releasing_the_older_repeating_key_does_not_stop_the_newer) {
    EXPECT_EQ(play({"+31", "+5", "idle:100", "+6", "idle:50", "-5", "idle:270", "-6", "-31"}), "A - B - B -");
}

TEST_F(NaviHost, macro_not_ticked_does_not_repeat) {
    EXPECT_EQ(play({"+31", "+7", "idle:420", "-7", "-31"}), "C -");
}
