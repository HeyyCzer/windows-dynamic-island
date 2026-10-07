import { motion } from "motion/react";
import { Badge } from "../../../components/Glyph";
import { providerAction } from "../../../core/bridge";
import { useIsland } from "../../../core/island";
import { ACTIVITIES_PROVIDER, type Activity } from "../types";

/** Opens what an activity points to: its link or app, or the module it came from. */
export function useOpenActivity() {
  const island = useIsland();
  return (a: Activity) => {
    if (a.source === "ask") island.expand("ask");
    else if (a.action) providerAction(ACTIVITIES_PROVIDER, "open", a.id);
  };
}

/** One activity, large: badge, caption, title, subtitle and progress. */
export function ActivityCard({ activity: a, compact = false }: { activity: Activity; compact?: boolean }) {
  const open = useOpenActivity();
  const color = a.color ?? "#ffffff";
  const clickable = !!a.action || a.source === "ask";
  return (
    <div
      className={`activity-card ${compact ? "is-row" : ""} ${clickable ? "is-clickable" : ""}`}
      onClick={(e) => {
        if (!clickable) return;
        e.stopPropagation();
        open(a);
      }}
    >
      <Badge icon={a.icon} image={a.image} color={color} size={compact ? 34 : 46} />
      <div className="activity-texts">
        {a.caption && <span className="activity-caption">{a.caption}</span>}
        <span className="activity-title">{a.title || " "}</span>
        {a.subtitle && <span className="activity-subtitle">{a.subtitle}</span>}
        {a.progress != null && (
          <div className="activity-progress">
            <div className="activity-track">
              <motion.div
                className="activity-fill"
                style={{ background: color }}
                initial={false}
                animate={{ scaleX: Math.min(1, Math.max(0, a.progress)) }}
                transition={{ type: "spring", stiffness: 260, damping: 30 }}
              />
            </div>
            <span className="activity-pct">{Math.round(a.progress * 100)}%</span>
          </div>
        )}
      </div>
      {!compact && a.expiresAt == null && (
        <button
          className="activity-dismiss"
          title="×"
          onClick={(e) => {
            e.stopPropagation();
            providerAction(ACTIVITIES_PROVIDER, "remove", a.id);
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}
