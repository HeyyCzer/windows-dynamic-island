// Runs as the `version` lifecycle script of `bun pm version`: after package.json
// is bumped and before the commit/tag, so the staged Cargo files join that commit.
// Regex instead of Bun.TOML.stringify, which would drop Cargo.toml's comments and layout.
// Cargo.lock is patched here too rather than via `cargo update`, and staging is
// done via Bun.spawn: in git mode, bun's shell for lifecycle scripts can't
// resolve git/cargo on Windows, while a spawned child still can.
import pkg from "../package.json";

const crate = "dynamic-island";

async function setVersion(path: string, pattern: RegExp) {
  const text = await Bun.file(path).text();
  if (!pattern.test(text)) throw new Error(`version not found in ${path}`);
  await Bun.write(path, text.replace(pattern, `$1${pkg.version}$2`));
}

await setVersion("src-tauri/Cargo.toml", /(\[package\][^\[]*?\nversion = ")[^"]+(")/);
await setVersion(
  "src-tauri/Cargo.lock",
  new RegExp(`(\\nname = "${crate}"\\r?\\nversion = ")[^"]+(")`),
);

const add = Bun.spawnSync(["git", "add", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"], {
  stdio: ["inherit", "inherit", "inherit"],
});
if (add.exitCode !== 0) process.exit(add.exitCode ?? 1);

console.log(`Cargo version -> ${pkg.version}`);
