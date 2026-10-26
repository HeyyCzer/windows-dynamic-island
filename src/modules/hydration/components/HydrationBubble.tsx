import { WaterDropIcon } from "../../../components/icons";
import { useNow } from "../../ai-agents/common/format";

function remainingLabel(deadline: number, now: number) {
  const seconds = Math.max(0, Math.ceil((deadline - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}h${String(minutes).padStart(2, "0")}` : `${minutes}:${rest}`;
}

/** Persistent countdown shown in the ambient bubble slot. */
export function HydrationBubble({ deadline, due }: { deadline: number | null; due: boolean }) {
  const now = useNow(1000, !!deadline && !due);
  return (
    <span className={`hydration-bubble ${due ? "is-due" : ""}`}>
      {deadline && !due ? <span>{remainingLabel(deadline, now)}</span> : <WaterDropIcon size={17} />}
    </span>
  );
}
