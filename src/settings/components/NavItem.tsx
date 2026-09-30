import { motion } from "motion/react";
import type { ReactNode } from "react";
import { NavLink } from "react-router";

/** Sidebar entry; the pill slides to whichever one is active. */
export function NavItem({ to, icon, label, off }: { to: string; icon: ReactNode; label: string; off?: boolean }) {
  return (
    <NavLink to={to} end className={({ isActive }) => `settings-nav-item ${isActive ? "active" : ""} ${off ? "off" : ""}`}>
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span layoutId="nav-pill" className="settings-nav-pill" transition={{ type: "spring", stiffness: 500, damping: 38 }} />
          )}
          <span className="settings-nav-icon">{icon}</span>
          <span className="settings-nav-label">{label}</span>
        </>
      )}
    </NavLink>
  );
}
