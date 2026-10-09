import type { Lang } from ".";

const en = {
  htmlLang: "en",
  otherLang: { lang: "pt-br" as Lang, label: "Português" },
  meta: {
    title: "Dynamic Island for Windows",
    description:
      "An iPhone-style Dynamic Island for the top of your Windows desktop: music, Claude Code sessions, notifications and more.",
    privacyTitle: "Privacy Policy · Dynamic Island for Windows",
  },
  island: {
    waiting: "Waiting for you",
    request: "Claude Code wants to run",
    command: "bun run build",
    project: "windows-dynamic-island",
    allow: "Allow",
    always: "Always allow",
    deny: "Deny",
    working: "Building",
    denied: "Denied",
    track: "Midnight City",
    artist: "M83",
    replay: "Show the permission request again",
    hint: "Try the buttons. In the app, this is how you answer Claude Code without leaving what you're doing.",
  },
  hero: {
    title: "A Dynamic Island for the top of your Windows desktop",
    lead: "It shows what's playing, what your Claude Code sessions are doing and your notifications, and stays out of the way the rest of the time.",
    download: "Download for Windows",
    github: "View the source",
    note: "Free and open source, for Windows 10 and 11.",
  },
  features: {
    agents: {
      title: "Your Claude Code sessions, live",
      body: "See which session is working, which one is waiting for you and how much of your plan is left. Permission requests show up in the island with the command, file or URL, so you can allow or deny them from there.",
      alt: "AI Agents panel with plan limits, tokens used today, a 7-day chart and the live sessions",
    },
    music: {
      title: "Music from any player",
      body: "Spotify, browsers, Apple Music, VLC: anything in Windows' media controls. Track, artwork, a progress bar you can click and a visualizer. A YouTube video plays muted right in the island, and Pin pops it out into a small floating window.",
      alt: "Expanded music panel with album art, track, progress bar and controls",
    },
    ask: {
      title: "Ask Claude from anywhere",
      body: "Press Ctrl+Alt+Space and type. It uses your Claude Code login, so you don't need an API key, and it can attach a screenshot of the window you were in.",
      alt: "Compact island showing a Claude Code session waiting for permission, next to GitHub and music bubbles",
    },
    launcher: {
      title: "Many modules, little clutter",
      body: "Pin the modules you use most to the tab bar and keep the rest one click away in the launcher. Drag to reorder them, or turn off the ones you don't need.",
      alt: "Launcher showing every module as a tile",
    },
    shelf: {
      title: "A shelf and a clipboard",
      body: "Drop files on the island to keep them until you drag them into another app. What you copy shows up for a moment, and the last 20 items stay in a list.",
      alt: "Shelf holding a PDF, a folder and a picture",
    },
  },
  looks: {
    title: "A black notch or a glowing pill",
    body: "Keep it as a plain black notch hanging from the top edge, or switch to a floating pill with a rim in one of seven gradients, or two colors of your own.",
    items: ["Dynamic Island", "Windows Island, classic", "Windows Island, thin mono", "Windows Island, Aurora with glow"],
  },
  more: {
    title: "And also",
    items: [
      ["Notifications", "WhatsApp, Teams, Outlook, Discord and other apps, mirrored from Windows."],
      ["Calendar", "Your next meetings from Google Calendar or any iCal link, with a button to join."],
      ["GitHub", "Open issues for the repositories you follow."],
      ["System monitor", "CPU, memory, GPU and network, with a warning when something stays maxed out."],
      ["Live activities", "Volume, battery, Bluetooth headphones, and anything your scripts send to the local API."],
      ["Out of the way", "Hides during fullscreen games and videos, expands on hover and scrolls through tabs with the mouse wheel."],
    ],
  },
  privacy: {
    title: "Your data stays on your computer",
    body: "No account, no analytics, no telemetry. When a module needs an online service, like Google Calendar or GitHub, the app talks to it directly, and only after you turn that module on.",
    link: "Read the privacy policy",
  },
  footer: {
    version: "Latest version",
    license: "Licensed under GPL-3.0",
    privacy: "Privacy policy",
    issues: "Report a problem",
  },
  policy: {
    back: "Back to the home page",
  },
};

export default en;
export type Strings = typeof en;
