import { useEffect, type ReactNode } from "react";
import { providerAction } from "../../../core/bridge";
import { useLocale, useT } from "../../../core/i18n";
import { levelColor, MONITOR_PROVIDER, NETWORK_BLUE, type MonitorState } from "../types";
import { Sparkline } from "./Sparkline";

const GIB = 1024 ** 3;

export function formatGb(bytes: number, locale: string) {
  const gb = bytes / GIB;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: gb >= 10 ? 0 : 1 }).format(gb)} GB`;
}

export function formatRate(bytesPerSec: number, locale: string) {
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let v = bytesPerSec;
  let u = 0;
  while (v >= 1000 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: v >= 100 || u === 0 ? 0 : 1 }).format(v)} ${units[u]}`;
}

/** CPU, memory, GPU and network, each with its last minute. */
export function MonitorPanel({ state }: { state: MonitorState | undefined }) {
  const t = useT();
  const locale = useLocale();

  // While the panel is open the backend publishes every sample.
  useEffect(() => {
    providerAction(MONITOR_PROVIDER, "watch", true);
    return () => void providerAction(MONITOR_PROVIDER, "watch", false);
  }, []);

  if (!state || (state.cpu == null && state.memoryUsed == null)) {
    return <div className="mon-loading">{t("monitor.loading")}</div>;
  }

  const memory = state.memoryUsed != null && state.memoryTotal ? (state.memoryUsed / state.memoryTotal) * 100 : null;
  const percent = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);

  return (
    <div className="mon-panel">
      <Tile
        label={t("monitor.cpu")}
        value={percent(state.cpu)}
        detail={t("monitor.threads", { n: state.cores })}
        color={levelColor(state.cpu ?? 0)}
        chart={<Sparkline values={state.history.cpu} color={levelColor(state.cpu ?? 0)} max={100} />}
      />
      <Tile
        label={t("monitor.memory")}
        value={percent(memory)}
        detail={
          state.memoryUsed != null && state.memoryTotal != null
            ? t("monitor.memoryDetail", { used: formatGb(state.memoryUsed, locale), total: formatGb(state.memoryTotal, locale) })
            : ""
        }
        color={levelColor(memory ?? 0)}
        chart={<Sparkline values={state.history.memory} color={levelColor(memory ?? 0)} max={100} />}
      />
      <Tile
        label={t("monitor.gpu")}
        value={percent(state.gpu)}
        detail={state.gpu == null ? t("monitor.unavailable") : ""}
        color={levelColor(state.gpu ?? 0)}
        chart={<Sparkline values={state.history.gpu} color={levelColor(state.gpu ?? 0)} max={100} />}
      />
      <Tile
        label={t("monitor.network")}
        value={`↓ ${formatRate(state.down ?? 0, locale)}`}
        detail={`↑ ${formatRate(state.up ?? 0, locale)}`}
        color={NETWORK_BLUE}
        small
        chart={<Sparkline values={state.history.down} color={NETWORK_BLUE} />}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  detail,
  color,
  chart,
  small,
}: {
  label: string;
  value: string;
  detail: string;
  color: string;
  chart: ReactNode;
  small?: boolean;
}) {
  return (
    <div className="mon-tile">
      <span className="mon-label">{label}</span>
      <span className={`mon-value ${small ? "is-small" : ""}`} style={{ color }}>
        {value}
      </span>
      <span className="mon-detail">{detail || " "}</span>
      {chart}
    </div>
  );
}
