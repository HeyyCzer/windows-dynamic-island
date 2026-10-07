/** Mirrors `State` in `src-tauri/src/providers/notifications/mod.rs`. */
export interface NotificationItem {
  id: number;
  app: string;
  aumid: string;
  logo: string | null;
  title: string;
  body: string | null;
  receivedAt: number;
  read: boolean;
}

export type NotificationAccess = "noIdentity" | "denied" | "allowed" | "unavailable";

export interface NotificationsState {
  access: NotificationAccess;
  items: NotificationItem[];
  error: string | null;
}

export const NOTIFICATIONS_PROVIDER = "notifications";
export const NOTIFICATION_BLUE = "#0A84FF";
