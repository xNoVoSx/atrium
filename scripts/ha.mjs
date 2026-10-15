// Access to the development Home Assistant for scripts and e2e tests:
// REST API with the admin token, and SSH into the box. Settings: .env.example.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

export function env(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (see .env.example)`);
  return value;
}

export const haUrl = () => env("ATRIUM_HA_URL").replace(/\/$/, "");
const adminToken = () => readFileSync(env("ATRIUM_ADMIN_TOKEN_FILE"), "utf8").trim();

export async function api(path, body) {
  const res = await fetch(`${haUrl()}/api/${path}`, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${adminToken()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json();
}

function sshOptions() {
  const opts = (process.env.ATRIUM_SSH_OPTS ?? "").split(" ").filter(Boolean);
  if (process.env.ATRIUM_SSH_VIA_HTTP_PROXY === "1") {
    const proxy = new URL(process.env.HTTP_PROXY ?? "");
    const auth = `${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`;
    opts.push(
      "-o",
      `ProxyCommand=socat - PROXY:${proxy.hostname}:%h:%p,proxyport=${proxy.port},proxyauth=${auth}`,
    );
  }
  return opts;
}

export function ssh(command, input) {
  const result = spawnSync("ssh", [...sshOptions(), env("ATRIUM_SSH_TARGET"), command], {
    input,
    encoding: "buffer",
  });
  if (result.status !== 0) throw new Error(`ssh failed: ${result.stderr.toString()}`);
  return result.stdout.toString();
}

export async function reloadEntry() {
  const [entry] = await api("config/config_entries/entry?domain=atrium");
  if (!entry) return null;
  await api(`config/config_entries/entry/${entry.entry_id}/reload`, {});
  return entry.entry_id;
}
