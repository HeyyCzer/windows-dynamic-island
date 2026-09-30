/** Fake provider feed for designing the UI in a regular browser. */
import { emitLocal, publishLocal } from "./bridge";

const art =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='120'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#ff6a3d'/><stop offset='1' stop-color='#7b2ff7'/></linearGradient></defs><rect width='120' height='120' fill='url(#g)'/><circle cx='60' cy='60' r='26' fill='rgba(0,0,0,.35)'/></svg>`,
  );

export function startMock() {
  const start = Date.now();
  let playing = true;

  const publish = () =>
    publishLocal("music", {
      available: true,
      playing,
      title: "Midnight City (Extended Version)",
      artist: "M83",
      album: "Hurry Up, We're Dreaming",
      appId: "Spotify.exe",
      appName: "Spotify",
      positionMs: ((Date.now() - start) % 240_000) + 30_000,
      positionAt: Date.now(),
      durationMs: 283_000,
      thumbnail: art,
      canNext: true,
      canPrevious: true,
    });

  publish();
  setInterval(publish, 1000);
  setInterval(() => {
    if (playing) emitLocal("music://level", 0.25 + Math.random() * 0.6);
  }, 33);

  // Space toggles playback in the mock to preview state changes.
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      playing = !playing;
      publish();
    }
  });
}
