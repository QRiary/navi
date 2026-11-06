// Hold spots and the one-shot cancel (fixture.test.ts → optionsHostProject). Positions (n = row * 10 + col):
//   0 LT(1, KC_SPC)   1 LGUI_T(KC_Q): holds when a key at 5, 13 or 39 is pressed   2 KC_C   3 MO(1)
//   4 OSM(MOD_LSFT), a second tap cancels it   5 KC_E (layer 1: KC_A)   6 KC_X   13 KC_N   39 KC_S
#include "../navi_host.hpp"

// A press at a spot makes the tap-hold key a hold at once, whatever the key types there
TEST_F(NaviHost, hold_spot_press_makes_the_tap_hold_key_a_hold) {
    EXPECT_EQ(play({"+1", "+5", "-5", "-1"}), "LGUI LGUI+E LGUI -");
}

TEST_F(NaviHost, hold_spot_in_the_last_row_makes_the_tap_hold_key_a_hold) {
    EXPECT_EQ(play({"+1", "+39", "-39", "-1"}), "LGUI LGUI+S LGUI -");
}

TEST_F(NaviHost, hold_spot_counts_by_position_not_by_keycode_on_another_layer) {
    EXPECT_EQ(play({"+3", "+1", "+5", "-5", "-1", "-3"}), "LGUI LGUI+A LGUI -");
}

TEST_F(NaviHost, key_outside_the_spots_rolled_in_still_taps) {
    EXPECT_EQ(play({"+1", "+2", "-1", "-2"}), "Q Q+C C -");
}

// QMK's replay trap: the tap-hold key's press and release wait behind the undecided layer-tap
TEST_F(NaviHost, hold_spot_rolled_behind_an_undecided_layer_tap_holds) {
    EXPECT_EQ(play({"+0", "+1", "+39", "-1", "-39", "wait", "-0"}), "LGUI LGUI+S S -");
}

TEST_F(NaviHost, key_outside_the_spots_rolled_behind_an_undecided_layer_tap_still_taps) {
    EXPECT_EQ(play({"+0", "+1", "+2", "-1", "-2", "wait", "-0"}), "Q Q+C C -");
}

// A second tap of a one-shot mod cancels it
TEST_F(NaviHost, one_tap_of_a_one_shot_shift_shifts_the_next_key) {
    EXPECT_EQ(play({"+4", "-4", "+5", "-5"}), "LSFT+E -"); // the one-shot Shift is a weak mod: it goes out in the key's own report
}

TEST_F(NaviHost, second_tap_of_a_one_shot_shift_cancels_it) {
    EXPECT_EQ(play({"+4", "-4", "+4", "-4", "+5", "-5"}), "E -");
}

TEST_F(NaviHost, one_shot_shift_works_again_after_a_cancel) {
    EXPECT_EQ(play({"+4", "-4", "+4", "-4", "+4", "-4", "+5", "-5"}), "LSFT+E -");
}

TEST_F(NaviHost, cancel_leaves_a_held_shift_alone) {
    // The real Shift is the OSM key's own hold: held past the term it is a plain Shift, not a one-shot
    EXPECT_EQ(play({"+4", "wait", "+5", "-5", "-4"}), "LSFT LSFT+E LSFT -");
}
