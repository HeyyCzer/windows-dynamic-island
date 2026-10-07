// Dynamic Island client for Node 18+ (uses the built-in fetch).
//   import { notify, activity, remove } from "./island.mjs";
//   await notify({ title: "Deploy ok", icon: "check", color: "#30D158" });

const BASE_URL = `http://127.0.0.1:${process.env.DYNAMIC_ISLAND_PORT ?? process.env.WINDOWS_ISLAND_PORT ?? 5199}`;

async function call(method, path, body) {
  const res = await fetch(BASE_URL + path, {
    method,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

/** Transient notification: { title, subtitle?, icon?, color?, duration?, action? } */
export const notify = (n) => call("POST", "/notify", n);

/** Create/update a live activity: { id, title?, subtitle?, icon?, color?, progress?, duration?, priority? } */
export const activity = (a) => call("POST", "/activity", a);

export const remove = (id) => call("DELETE", `/activity/${encodeURIComponent(id)}`);

export const status = () => call("GET", "/status");

// node island.mjs "Title" "Subtitle"
if (import.meta.url === `file:///${process.argv[1].replaceAll("\\", "/")}`) {
  const [title = "Hello from Node", subtitle] = process.argv.slice(2);
  console.log(await notify({ title, subtitle, icon: "code", color: "#FFD60A" }));
}
