import { WaterDropIcon } from "../../../components/icons";
import { useT } from "../../../core/i18n";
import { useNow } from "../../ai-agents/common/format";

function remainingLabel(deadline: number, now: number) {
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

export function HydrationPanel({
  deadline,
  pausedRemaining,
  due,
  onConfirm,
  onSnooze,
  onStart,
  onResume,
  onPause,
}: {
  deadline: number | null;
  pausedRemaining: number | null;
  due: boolean;
  onConfirm: () => void;
  onSnooze: () => void;
  onStart: () => void;
  onResume: () => void;
  onPause: () => void;
}) {
  const t = useT();
  const now = useNow(1000, !!deadline && !due);
  const running = !!deadline && !due;
  const paused = pausedRemaining !== null;
  const pausedLabel = pausedRemaining === null ? null : remainingLabel(Date.now() + pausedRemaining, Date.now());

  return (
    <div className={`hydration-panel ${due ? "is-due" : ""}`} onClick={(e) => e.stopPropagation()}>
      <span className="hydration-icon"><WaterDropIcon size={21} /></span>
      <div className="hydration-copy">
        <span className="hydration-eyebrow">{due ? t("hydration.reminder") : paused ? t("hydration.paused") : t("hydration.next")}</span>
        <strong>{due ? t("hydration.titleDue") : running ? remainingLabel(deadline, now) : pausedLabel ?? t("hydration.paused")}</strong>
        <span className="hydration-message">{due ? t("hydration.message") : paused ? t("hydration.pausedStatus") : t("hydration.status")}</span>
      </div>
      <div className="hydration-actions">
        {due ? (
          <>
            <button className="hydration-button secondary" onClick={() => onSnooze()}>{t("hydration.snooze.action")}</button>
            <button className="hydration-button primary" onClick={() => onConfirm()}>{t("hydration.confirm")}</button>
          </>
        ) : running ? (
          <button className="hydration-button secondary" onClick={() => onPause()}>{t("hydration.pause")}</button>
        ) : paused ? (
          <>
            <button className="hydration-button secondary" onClick={() => onStart()}>{t("hydration.reset")}</button>
            <button className="hydration-button primary" onClick={() => onResume()}>{t("hydration.resume")}</button>
          </>
        ) : (
          <button className="hydration-button primary" onClick={() => onStart()}>{t("hydration.start")}</button>
        )}
      </div>
    </div>
  );
}
