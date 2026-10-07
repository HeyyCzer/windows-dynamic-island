/** Same list as `src-tauri/src/providers/music/youtube.rs`. */
const BROWSERS = ["chrome", "edge", "brave", "firefox", "opera", "vivaldi", "arc"];

export const isBrowserApp = (appName: string) => BROWSERS.includes(appName.toLowerCase());
