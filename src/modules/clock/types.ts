/** Mirrors `src-tauri/src/providers/calendar/mod.rs`. */
export interface CalEvent {
  /** Unique across calendars and instances of a recurring event. */
  id: string;
  /** `CalendarInfo.key` of its calendar. */
  calendar: string;
  title: string;
  /** Unix ms; `end` is exclusive. All-day events span local midnights. */
  start: number;
  end: number;
  allDay: boolean;
  location: string | null;
  /** Video call to join (Meet, Zoom, Teams…). */
  meetingUrl: string | null;
  /** The event in its calendar's web page. */
  url: string | null;
}

export type CalendarErrorCode =
  | "unauthorized"
  | "notFound"
  | "invalid"
  | "network"
  | "http"
  | "noClient"
  | "denied"
  | "cancelled"
  | "timeout";

export interface CalendarInfo {
  /** `google:<id>` or `ics:<feed id>`; key of the `calendar.visibility` setting. */
  key: string;
  name: string;
  color: string;
  source: "google" | "ics";
  defaultVisible: boolean;
  visible: boolean;
  error: CalendarErrorCode | null;
}

export interface CalendarState {
  google: {
    /** This build ships an OAuth client: signing in needs no setup. */
    builtinClient: boolean;
    hasClient: boolean;
    connected: boolean;
    account: string | null;
    error: CalendarErrorCode | null;
  };
  /** iCal links, without the link itself (it's a secret). */
  feeds: { id: string; host: string; name: string | null; error: CalendarErrorCode | null }[];
  calendars: CalendarInfo[];
  /** Visible calendars only, sorted by start. */
  events: CalEvent[];
  /** Unix ms span the events cover. */
  range: [number, number] | null;
  loading: boolean;
  updatedAt: number | null;
}

export const CALENDAR_PROVIDER = "calendar";
export const CLOCK_RED = "#FF453A";
