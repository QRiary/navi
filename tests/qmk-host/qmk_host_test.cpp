// Plays key sequences on the keymap.c NAVI generated (fixture.test.ts) inside QMK's unit test framework and checks
// the HID reports the computer would get. Positions are row 0 of the test matrix:
//   0 LT(1, KC_SPC)   1 LSFT_T(KC_P) hold-preferred   2 KC_C (layer 2: KC_V)
//   3 tap C(KC_Z) / hold layer 2 + Ctrl   4 tap S(KC_1) / hold Alt, hold-preferred   5 tap KC_A / hold C(KC_X)
//   6 LCTL_T(KC_D) holds when KC_C is pressed   7 KC_E
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
            for (uint8_t col = 0; col < MATRIX_COLS; col++) add_key(KeymapKey(layer, col, 0, keycode_at_keymap_location_raw(layer, 0, col)));
        ON_CALL(driver, send_keyboard_mock(_)).WillByDefault(Invoke([this](report_keyboard_t &r) {
            std::string t = report_text(r);
            if (reports.empty() || reports.back() != t) reports.push_back(t);
        }));
    }

   protected:
    // Presses (+col) and releases (-col) one scan apart; "wait" waits out the tapping term.
    std::string play(const std::vector<std::string> &steps) {
        for (auto &s : steps) {
            if (s == "wait") {
                idle_for(TAPPING_TERM + 1);
                continue;
            }
            KeymapKey key(0, (uint8_t)std::stoi(s.substr(1)), 0, KC_NO);
            if (s[0] == '+')
                press_key(key.position.col, key.position.row);
            else
                release_key(key.position.col, key.position.row);
            run_one_scan_loop();
        }
        idle_for(TAPPING_TERM + 1);
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
