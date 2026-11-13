/**
 * One setting's row, in two layouts that share the field, so a setting looks and changes the same everywhere:
 * - wide (the QMK settings and NAVI additions tabs): title — hint, the “?” and docs link, a kicker, the field;
 * - compact (“Settings for this key” in the narrow inspector and at the top of the feature tabs): title with the hint
 *   behind its “?”, a “changed” mark, the field on the same line, then the per-key values and a link to the
 *   setting's own place (`open`). Only the wide row carries the find id, so a jump lands on the canonical one.
 */
import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { t } from "../i18n";
import { findAttr } from "../lib/find";
import { openDocs } from "../lib/qmkDocs";
import { InfoTip } from "./InfoTip";

export interface SettingRowProps {
  title: string;
  /** Short text: after “ — ” in the wide row, the tip's first paragraph in the compact one. */
  hint?: ReactNode;
  /** Longer text behind the “?”. */
  tip?: ReactNode;
  tipLabel?: string;
  docs?: string;
  /** The wide row's middle column (the define, or what the number means); the compact tip's last line. */
  kicker: ReactNode;
  field: ReactNode;
  /** The wide row's grid columns. */
  cols?: string;
  findId?: string;
  compact?: boolean;
  /** Compact: set away from its default. */
  changed?: boolean;
  /** Compact: a word before the field (“others” when some keys have their own value). */
  fieldLabel?: string;
  /** Compact: lines under the row (per-key values). */
  below?: ReactNode;
  /** Compact: where the setting lives. */
  open?: { label: string; go: () => void };
}

export function SettingRow(p: SettingRowProps) {
  if (p.compact) {
    const cut = p.title.lastIndexOf(" ") + 1;
    return (
      <div className="setting-compact">
        <div className="setting-compact-line">
          <span className="setting-compact-title">
            {p.title.slice(0, cut)}
            {/* The last word, the “?” and the jump square never part (like Hint). */}
            <span className="with-tip-tail">
              {p.title.slice(cut)}
              <InfoTip docs={p.docs} label={p.title}>
                {p.hint && <p>{p.hint}</p>}
                {p.tip && <p>{p.tip}</p>}
                <p>
                  <code>{p.kicker}</code>
                </p>
              </InfoTip>
              {p.open && (
                <button
                  type="button"
                  className="setting-compact-open"
                  onClick={p.open.go}
                  title={t(
                    `Open on “${p.open.label}”`,
                    `Открыть на «${p.open.label}»`,
                  )}
                  aria-label={t(
                    `${p.title}: open on “${p.open.label}”`,
                    `${p.title}: открыть на «${p.open.label}»`,
                  )}
                >
                  <ArrowUpRight size={12} strokeWidth={1.5} aria-hidden />
                </button>
              )}
            </span>
            {p.changed && (
              <span className="badge badge--info">
                {t("changed", "изменено")}
              </span>
            )}
          </span>
          <span className="setting-compact-field">
            {p.fieldLabel && <span className="kicker">{p.fieldLabel}</span>}
            {p.field}
          </span>
        </div>
        {p.below}
      </div>
    );
  }
  return (
    <div
      className="row"
      {...(p.findId ? findAttr(p.findId) : {})}
      style={{
        ["--row-cols" as string]:
          p.cols ?? "minmax(0,1.3fr) minmax(0,1fr) auto",
      }}
    >
      <span>
        {p.title}
        {(p.hint || p.tip) && (
          <span className="field-hint">
            {p.hint && (
              <>
                {" — "}
                {p.hint}
              </>
            )}
            {p.tip && (
              <>
                {" "}
                <InfoTip label={p.tipLabel ?? p.title}>{p.tip}</InfoTip>
              </>
            )}
          </span>
        )}
        {p.docs && (
          <span className="row-docs">
            <button
              type="button"
              className="text-btn"
              onClick={() => openDocs(p.docs!)}
            >
              {t("QMK docs", "Документация QMK")} ↗
            </button>
          </span>
        )}
      </span>
      <code className="kicker">{p.kicker}</code>
      {p.field}
    </div>
  );
}
