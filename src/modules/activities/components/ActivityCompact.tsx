import { motion } from "motion/react";
import { Badge } from "../../../components/Glyph";
import { Marquee } from "../../../components/Marquee";
import type { Activity } from "../types";

/** Left slot of the compact pill: badge + title (or nothing for a level). */
export function ActivityCompactLeft({ activity: a }: { activity: Activity }) {
  return (
    <>
      <Badge icon={a.icon} image={a.image} color={a.color ?? "#ffffff"} size={24} glyphSize={12} />
      {a.style !== "level" && <Marquee text={a.title} className="activity-compact-title" />}
    </>
  );
}

/** Right slot: a level bar (volume), or the progress in %. */
export function ActivityCompactRight({ activity: a }: { activity: Activity }) {
  const color = a.color ?? "#ffffff";
  if (a.style === "level" && a.progress != null) {
    return (
      <>
        <div className="activity-level">
          <motion.div
            className="activity-fill"
            style={{ background: color }}
            initial={false}
            animate={{ scaleX: a.progress }}
            transition={{ type: "spring", stiffness: 500, damping: 40 }}
          />
        </div>
        <span className="activity-compact-value">{Math.round(a.progress * 100)}</span>
      </>
    );
  }
  return a.progress != null ? <span className="activity-compact-value">{Math.round(a.progress * 100)}%</span> : null;
}
