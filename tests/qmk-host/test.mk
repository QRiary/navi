# Builds the NAVI-generated keymap files in $(NAVI_QMK_OUT) into QMK's unit test framework (see README.md).
include $(NAVI_QMK_OUT)/rules.mk

VPATH += $(NAVI_QMK_OUT)
OPT_DEFS += -DNAVI_CONFIG=\"$(abspath $(NAVI_QMK_OUT))/config.h\"
