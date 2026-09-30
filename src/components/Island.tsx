import { AnimatePresence, motion, type Transition } from "motion/react";
import type { ReactNode } from "react";
import { modules } from "../modules";
import { useHitRects } from "../core/useHitRects";
import { useIslandController, type ModuleEntry } from "../core/useIslandController";
import type { IslandMode } from "../core/types";
import { command } from "../core/bridge";
import { GearIcon } from "./icons";
import { useSyncLocale, useT } from "../core/i18n";

const IDLE = { width: 150, height: 8, radius: 8, ear: 6 };
const COMPACT = { width: 300, height: 38, radius: 19, ear: 10 };
const EXPANDED = { width: 560, height: 190, radius: 32, ear: 14 };
const TAB_BAR = 46;

const shellSpring: Transition = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 };
const expandSpring: Transition = { type: "spring", stiffness: 330, damping: 27, mass: 0.9 };

function geometry(mode: IslandMode, focused: ModuleEntry | undefined, primary: ModuleEntry | undefined, tabs: boolean) {
  switch (mode) {
    case "hidden":
    case "idle":
      return IDLE;
    case "compact":
      return { ...COMPACT, width: primary?.view.compact?.width ?? COMPACT.width };
    case "peek":
    case "expanded": {
      const size = focused?.view.expandedSize ?? EXPANDED;
      const extra = mode === "expanded" && tabs ? TAB_BAR : 0;
      return { ...EXPANDED, width: size.width, height: size.height + extra };
    }
  }
}

export function Island() {
  const ctl = useIslandController(modules);
  const { mode, primary, secondary, focused } = ctl;
  useHitRects();
  useSyncLocale();

  // Always shown when expanded: it also hosts the settings button.
  const showTabs = true;
  const g = geometry(mode, focused, primary, showTabs);
  const big = mode === "expanded" || mode === "peek";
  const hidden = mode === "hidden";

  let contentKey: string;
  let content: ReactNode = null;
  if (mode === "compact" && primary?.view.compact) {
    contentKey = `compact:${primary.module.id}`;
    content = (
      <div className="compact">
        <div className="compact-slot">{primary.view.compact.left}</div>
        <div className="compact-slot right">{primary.view.compact.right}</div>
      </div>
    );
  } else if (big && focused) {
    contentKey = `big:${focused.module.id}`;
    content = (
      <div className="expanded">
        {mode === "expanded" && showTabs && (
          <Tabs entries={ctl.entries} current={ctl.tab} onSelect={ctl.setTab} />
        )}
        <div className="expanded-body">{focused.view.expanded}</div>
      </div>
    );
  } else {
    contentKey = "idle";
  }

  return (
    <div className="stage">
      <motion.div
        className="shell"
        {...(hidden ? {} : { "data-hit": true })}
        {...ctl.domHover}
        initial={false}
        animate={{
          width: g.width,
          height: g.height,
          opacity: hidden ? 0 : 1,
          y: hidden ? -g.height - 12 : 0,
        }}
        transition={big ? expandSpring : shellSpring}
        onClick={() => (mode === "compact" || mode === "idle") && ctl.expand()}
      >
        <motion.span className="ear left" initial={false} animate={{ width: g.ear, height: g.ear }} transition={shellSpring} />
        <motion.span className="ear right" initial={false} animate={{ width: g.ear, height: g.ear }} transition={shellSpring} />

        <motion.div
          className={`surface ${big ? "is-big" : ""}`}
          initial={false}
          animate={{ borderBottomLeftRadius: g.radius, borderBottomRightRadius: g.radius }}
          transition={big ? expandSpring : shellSpring}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={contentKey}
              className="content"
              style={{ width: g.width, height: g.height }}
              initial={{ opacity: 0, scale: 0.9, filter: "blur(10px)" }}
              animate={{
                opacity: 1,
                scale: 1,
                filter: "blur(0px)",
                transition: { duration: 0.32, delay: 0.06, ease: [0.2, 0.9, 0.3, 1] },
              }}
              exit={{
                opacity: 0,
                scale: 0.94,
                filter: "blur(8px)",
                transition: { duration: 0.16, ease: "easeIn" },
              }}
            >
              {content}
            </motion.div>
          </AnimatePresence>
        </motion.div>

        <AnimatePresence>
          {mode === "compact" && secondary && (
            <motion.button
              key={secondary.module.id}
              className="bubble"
              data-hit
              initial={{ opacity: 0, scale: 0.3, x: -40 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.3, x: -40 }}
              transition={shellSpring}
              onClick={(e) => {
                e.stopPropagation();
                ctl.expand(secondary.module.id);
              }}
            >
              {secondary.view.icon}
            </motion.button>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function Tabs({
  entries,
  current,
  onSelect,
}: {
  entries: ModuleEntry[];
  current: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  return (
    <div className="tabs">
      {entries.map(({ module, view }) => (
        <button
          key={module.id}
          className={`tab ${current === module.id ? "is-active" : ""}`}
          onClick={() => onSelect(module.id)}
        >
          {current === module.id && (
            <motion.span layoutId="tab-pill" className="tab-pill" transition={shellSpring} />
          )}
          <span className="tab-icon">{view.icon}</span>
          <span className="tab-label">{t(module.title)}</span>
          {view.active && <span className="tab-dot" />}
        </button>
      ))}
      <motion.button
        className="tab-gear"
        title={t("island.settings")}
        whileHover={{ rotate: 45 }}
        whileTap={{ scale: 0.85 }}
        transition={{ type: "spring", stiffness: 300, damping: 15 }}
        onClick={(e) => {
          e.stopPropagation();
          command("open_settings");
        }}
      >
        <GearIcon size={16} />
      </motion.button>
    </div>
  );
}
