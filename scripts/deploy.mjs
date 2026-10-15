// Build Atrium and install it on a Home Assistant over SSH, for development.
//
//   node --env-file=.env scripts/deploy.mjs [--restart] [--no-build]
//
// Copies custom_components/atrium to /config/custom_components/atrium in one
// swap, then reloads the config entry. If Python code or the manifest changed
// (or --restart is given), Home Assistant is restarted instead, because Python
// modules are only imported at startup. Settings: see .env.example.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { api, reloadEntry, ssh } from "./ha.mjs";

const root = new URL("..", import.meta.url).pathname;
const integrationDir = join(root, "custom_components", "atrium");
const remoteBase = "/config/custom_components";
const args = new Set(process.argv.slice(2));

function files(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === "__pycache__") return [];
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** Hash over everything that needs a restart when it changes. */
function backendHash(contents) {
  const hash = createHash("sha256");
  for (const [name, data] of [...contents].sort(([a], [b]) => a.localeCompare(b))) {
    if (name.endsWith(".py") || name === "manifest.json") hash.update(name).update(data);
  }
  return hash.digest("hex");
}

async function waitForHa() {
  for (let i = 0; i < 120; i++) {
    try {
      const cfg = await api("config");
      if (cfg.state === "RUNNING") return;
    } catch {
      // still restarting
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Home Assistant did not come back within 4 minutes");
}

async function main() {
  if (!args.has("--no-build")) {
    execFileSync("npm", ["run", "build"], { cwd: join(root, "frontend"), stdio: "inherit" });
  }

  const local = new Map(files(integrationDir).map((p) => [relative(integrationDir, p), readFileSync(p)]));
  const remoteSums = ssh(
    `cd ${remoteBase}/atrium 2>/dev/null && find . -type f \\( -name '*.py' -o -name manifest.json \\) ! -path '*/__pycache__/*' -exec sha256sum {} + || true`,
  );
  const remote = new Map(
    remoteSums
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        const [sum, name] = line.split(/\s+/);
        return [name.replace(/^\.\//, ""), sum];
      }),
  );
  const backendChanged =
    [...local].some(
      ([name, data]) =>
        (name.endsWith(".py") || name === "manifest.json") &&
        remote.get(name) !== createHash("sha256").update(data).digest("hex"),
    ) || [...remote.keys()].some((name) => !local.has(name));

  const tar = execFileSync("tar", ["-C", join(root, "custom_components"), "--exclude=__pycache__", "--owner=0", "--group=0", "-czf", "-", "atrium"]);
  ssh(
    [
      `set -e; cd ${remoteBase}`,
      "rm -rf atrium.new atrium.old",
      "mkdir atrium.new",
      "tar -xzf - -C atrium.new --strip-components=1",
      "if [ -d atrium ]; then mv atrium atrium.old; fi",
      "mv atrium.new atrium",
      "rm -rf atrium.old",
    ].join(" && "),
    tar,
  );
  console.log(`Copied ${local.size} files (backend hash ${backendHash(local).slice(0, 8)}).`);

  if (backendChanged || args.has("--restart")) {
    console.log("Python code or manifest changed: restarting Home Assistant ...");
    await api("services/homeassistant/restart", {}).catch(() => undefined);
    await new Promise((r) => setTimeout(r, 10000));
    await waitForHa();
    console.log("Home Assistant is running again.");
    return;
  }

  if (!(await reloadEntry())) {
    console.log("No Atrium entry yet: add the integration in Settings > Devices & services.");
    return;
  }
  const info = await api("config/config_entries/entry?domain=atrium");
  console.log(`Reloaded the Atrium entry (${info[0]?.state}). Open pages pick up the new bundle by themselves.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
