import { useEffect, useState } from "react";
import { command, useTauriEvent } from "../../../core/bridge";

/** Whether the video is pinned to its own window (picture-in-picture). */
export function usePipOpen() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    command<boolean>("is_pip_open").then((v) => setOpen(!!v));
  }, []);
  useTauriEvent<boolean>("pip://changed", setOpen);
  return open;
}

export const openPip = () => command("open_pip");
export const closePip = () => command("close_pip");
/** Sent by the pinned window's "back to the island" button. */
export const PIP_RETURN_EVENT = "pip://return";
