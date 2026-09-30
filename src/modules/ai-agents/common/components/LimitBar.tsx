import { motion } from "motion/react";
import { useT } from "../../../../core/i18n";
import { formatIn } from "../format";
import type { UsageLimit } from "../types";

/** Plan-limit meter: label, % used, animated bar and reset countdown. */
export function LimitBar({ limit, color, now }: { limit: UsageLimit; color: string; now: number }) {
  const t = useT();
  const pct = Math.max(0, Math.min(100, limit.usedPct));
  const tone = pct >= 90 ? "#ff5f57" : pct >= 75 ? "#ffbd2e" : color;

  return (
    <div className="agents-limit">
      <div className="agents-limit-head">
        <span className="agents-limit-label">{limit.label}</span>
        <span className="agents-limit-pct" style={{ color: tone }}>
          {Math.round(pct)}%
        </span>
      </div>
      <div className="agents-limit-track">
        <motion.div
          className="agents-limit-fill"
          style={{ background: tone }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: pct / 100 }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
      {limit.resetsAt && limit.resetsAt > now && (
        <span className="agents-limit-reset">{t("agents.limit.resetsIn", { time: formatIn(t, limit.resetsAt, now) })}</span>
      )}
    </div>
  );
}
