// Adapters for homelab integrations: servers, NAS, network, DNS filters,
// speed tests, monitors, UPS, printers, containers. They recognise sensors by
// translation key or object id, so they survive renamed entities and work
// with several integrations of the same kind.

import type { Adapter, AdapterContext, DataModel, MetricGroup, Row, Tone } from "../types";
import {
  byDevice,
  compact,
  domainOf,
  fmt,
  isAvailable,
  keyOf,
  num,
  pctMetric,
  pick,
  platformEntities,
  unitOf,
  uptimeOf,
  usageTone,
  valueMetric,
} from "./util";

export const PLATFORMS = {
  system: ["systemmonitor", "glances", "netdata"],
  proxmox: ["proxmoxve"],
  nas: ["truenas", "synology_dsm", "qnap", "qnap_qsw", "unraid", "openmediavault"],
  unifi: ["unifi"],
  dns: ["pi_hole", "adguard", "technitium"],
  speedtest: ["speedtestdotnet", "fastdotcom", "ookla_speedtest"],
  uptime: ["uptime_kuma", "uptimekuma"],
  ups: ["nut", "apcupsd"],
  printer: ["bambu_lab", "octoprint", "prusalink", "moonraker", "elegoo_printer"],
  containers: ["portainer", "monitor_docker", "docker"],
  router: ["fritz", "netgear", "asuswrt", "openwrt", "mikrotik", "opnsense", "pfsense"],
  vpn: ["tailscale", "wireguard"],
} as const;

const statusTone = (state: string | undefined): Tone => {
  const s = (state ?? "").toLowerCase();
  if (["on", "running", "online", "up", "connected", "home", "ok", "true"].includes(s)) return "ok";
  if (["paused", "pending", "maintenance", "warning", "degraded", "starting"].includes(s)) return "warn";
  if (["unavailable", "unknown", ""].includes(s)) return "off";
  return "bad";
};

const statusLabel = (ctx: AdapterContext, tone: Tone) =>
  ctx.t(
    tone === "ok"
      ? "w.state.online"
      : tone === "warn"
        ? "w.state.warning"
        : tone === "off"
          ? "w.state.unknown"
          : "w.state.offline",
  );

// ---- servers: System Monitor, Glances ----

export const systemAdapter: Adapter = (hass, ctx) => {
  const ids = platformEntities(hass, PLATFORMS.system);
  if (!ids.length) return null;
  const groups: MetricGroup[] = byDevice(hass, ids).map((dev) => {
    const disks = dev.ids.filter(
      (id) =>
        /disk_use_percent|disk_usage|used_percent/.test(keyOf(hass, id)) && unitOf(hass.states[id]) === "%",
    );
    return {
      id: dev.deviceId || dev.name,
      name: dev.name,
      sub: uptimeOf(hass.states[pick(hass, dev.ids, ["last_boot", "uptime"]) ?? ""]),
      metrics: compact([
        pctMetric(
          hass,
          pick(hass, dev.ids, ["processor_use", "cpu_use", "cpu_percent", "cpu_used", "cpu"]),
          ctx.t("w.cpu"),
          ctx.locale,
        ),
        pctMetric(
          hass,
          pick(hass, dev.ids, [
            "memory_use_percent",
            "memory_usage",
            "ram_used_percent",
            "memory_use",
            "ram",
          ]),
          ctx.t("w.memory"),
          ctx.locale,
        ),
        ...disks
          .slice(0, 3)
          .map((id, i) =>
            pctMetric(
              hass,
              id,
              disks.length > 1 ? `${ctx.t("w.disk")} ${i + 1}` : ctx.t("w.disk"),
              ctx.locale,
            ),
          ),
        valueMetric(
          hass,
          pick(hass, dev.ids, ["processor_temperature", "cpu_temp", "temperature"]),
          ctx.t("w.temperature"),
          ctx.locale,
          0,
        ),
        valueMetric(
          hass,
          pick(hass, dev.ids, ["load_15m", "load_5m", "load_1m", "load"]),
          ctx.t("w.load"),
          ctx.locale,
          2,
        ),
      ]),
    };
  });
  return { groups };
};

// ---- Proxmox: nodes, VMs, containers ----

export const proxmoxAdapter: Adapter = (hass, ctx) => {
  const ids = platformEntities(hass, PLATFORMS.proxmox);
  if (!ids.length) return null;
  let running = 0;
  let total = 0;
  const groups: MetricGroup[] = byDevice(hass, ids).map((dev) => {
    const statusId = pick(hass, dev.ids, ["status", "running", "state"]);
    const state = statusId ? hass.states[statusId]?.state : undefined;
    const tone = statusTone(state);
    total += 1;
    if (tone === "ok") running += 1;
    return {
      id: dev.deviceId || dev.name,
      name: dev.name,
      status: { label: statusLabel(ctx, tone), tone },
      entityId: statusId,
      sub: uptimeOf(hass.states[pick(hass, dev.ids, ["uptime"]) ?? ""]),
      metrics: compact([
        pctMetric(hass, pick(hass, dev.ids, ["cpu_used", "cpu"], "sensor"), ctx.t("w.cpu"), ctx.locale),
        pctMetric(
          hass,
          pick(hass, dev.ids, ["memory_used_perc", "memory_used_percentage", "memory"], "sensor"),
          ctx.t("w.memory"),
          ctx.locale,
        ),
        pctMetric(
          hass,
          pick(hass, dev.ids, ["disk_used_perc", "disk_used_percentage", "disk"], "sensor"),
          ctx.t("w.disk"),
          ctx.locale,
        ),
      ]).filter((m) => m.pct !== null),
    };
  });
  return {
    summary: [
      {
        label: ctx.t("w.running"),
        value: `${running}`,
        unit: `/ ${total}`,
        tone: running === total ? "ok" : "warn",
      },
    ],
    groups,
  };
};

// ---- NAS: TrueNAS, Synology, QNAP ----

export const nasAdapter: Adapter = (hass, ctx) => {
  const ids = platformEntities(hass, PLATFORMS.nas);
  if (!ids.length) return null;
  const groups: MetricGroup[] = byDevice(hass, ids).map((dev) => {
    const volumes = dev.ids.filter(
      (id) =>
        domainOf(id) === "sensor" &&
        unitOf(hass.states[id]) === "%" &&
        /pool|volume|usage|used|dataset/.test(keyOf(hass, id)) &&
        !/cpu|memory|ram|load/.test(keyOf(hass, id)),
    );
    const temps = dev.ids.filter((id) => hass.states[id]?.attributes.device_class === "temperature");
    const hottest = temps.reduce<string | undefined>(
      (best, id) => ((num(hass.states[id]) ?? -99) > (num(hass.states[best ?? ""]) ?? -99) ? id : best),
      undefined,
    );
    const statusId = pick(hass, dev.ids, ["status", "health", "state"]);
    const tone = statusId
      ? statusTone(hass.states[statusId]?.state === "normal" ? "ok" : hass.states[statusId]?.state)
      : undefined;
    return {
      id: dev.deviceId || dev.name,
      name: dev.name,
      sub: uptimeOf(hass.states[pick(hass, dev.ids, ["uptime", "last_boot"]) ?? ""]),
      ...(tone ? { status: { label: hass.states[statusId ?? ""]?.state ?? "", tone } } : {}),
      metrics: compact([
        ...volumes
          .slice(0, 4)
          .map((id) =>
            pctMetric(hass, id, hass.entities[id]?.name ?? keyOf(hass, id).replace(/_/g, " "), ctx.locale),
          ),
        pctMetric(
          hass,
          pick(hass, dev.ids, ["cpu_utilization", "cpu_load", "cpu"], "sensor"),
          ctx.t("w.cpu"),
          ctx.locale,
        ),
        pctMetric(
          hass,
          pick(hass, dev.ids, ["memory_usage", "memory_used_percent", "memory"], "sensor"),
          ctx.t("w.memory"),
          ctx.locale,
        ),
        valueMetric(hass, hottest, ctx.t("w.temperature"), ctx.locale, 0),
      ]),
    };
  });
  return { groups };
};

// ---- UniFi Network ----

export const unifiAdapter: Adapter = (hass, ctx) => {
  const ids = platformEntities(hass, PLATFORMS.unifi);
  if (!ids.length) return null;
  const trackers = ids.filter((id) => domainOf(id) === "device_tracker");
  const online = trackers.filter((id) => hass.states[id]?.state === "home").length;
  const devices = byDevice(
    hass,
    ids.filter((id) => domainOf(id) === "sensor"),
  ).filter((d) => d.ids.some((id) => /uptime|cpu|memory|clients|state/.test(keyOf(hass, id))));
  const groups: MetricGroup[] = devices.map((dev) => {
    const stateId = pick(hass, dev.ids, ["device_state", "state"]);
    const state = stateId ? hass.states[stateId]?.state : undefined;
    const tone = state ? statusTone(state) : undefined;
    return {
      id: dev.deviceId || dev.name,
      name: dev.name,
      sub: uptimeOf(hass.states[pick(hass, dev.ids, ["uptime"]) ?? ""]),
      ...(tone && state ? { status: { label: state, tone } } : {}),
      metrics: compact([
        valueMetric(hass, pick(hass, dev.ids, ["clients"]), ctx.t("w.clients"), ctx.locale, 0),
        pctMetric(hass, pick(hass, dev.ids, ["cpu_utilization", "cpu"]), ctx.t("w.cpu"), ctx.locale),
        pctMetric(hass, pick(hass, dev.ids, ["memory_utilization", "memory"]), ctx.t("w.memory"), ctx.locale),
        valueMetric(hass, pick(hass, dev.ids, ["temperature"]), ctx.t("w.temperature"), ctx.locale, 0),
      ]),
    };
  });
  const wlans = ids
    .filter(
      (id) =>
        domainOf(id) === "switch" && /wlan|ssid/.test(keyOf(hass, id) + (hass.entities[id]?.name ?? "")),
    )
    .map((id) => ({
      entityId: id,
      on: hass.states[id]?.state === "on",
      label: hass.entities[id]?.name ?? (hass.states[id]?.attributes.friendly_name as string) ?? id,
    }));
  const updates = ids.filter((id) => domainOf(id) === "update" && hass.states[id]?.state === "on").length;
  return {
    summary: compact([
      trackers.length ? { label: ctx.t("w.clients_online"), value: `${online}`, tone: "info" as Tone } : null,
      devices.length ? { label: ctx.t("w.devices"), value: `${devices.length}` } : null,
      updates ? { label: ctx.t("w.updates"), value: `${updates}`, tone: "warn" as Tone } : null,
    ]),
    groups,
    toggles: wlans,
  };
};

// ---- DNS filters: Pi-hole, AdGuard Home ----

export const dnsAdapter: Adapter = (hass, ctx) => {
  const ids = platformEntities(hass, PLATFORMS.dns);
  if (!ids.length) return null;
  const sensors = ids.filter((id) => domainOf(id) === "sensor");
  const queries = pick(hass, sensors, ["dns_queries_today", "dns_queries", "queries"]);
  const blocked = pick(
    hass,
    sensors,
    ["ads_blocked_today", "dns_queries_blocked", "ads_blocked", "blocked"].filter(Boolean),
  );
  const ratio = pick(hass, sensors, [
    "ads_percentage_blocked_today",
    "dns_queries_blocked_ratio",
    "percentage",
    "ratio",
  ]);
  const ratioValue = num(hass.states[ratio ?? ""]);
  const protection = pick(
    hass,
    ids.filter((id) => domainOf(id) === "switch"),
    ["protection", "pi_hole", "filtering", ""],
  );
  return {
    summary: compact([
      queries
        ? {
            label: ctx.t("w.queries"),
            value: fmt(ctx.locale, num(hass.states[queries]), 0),
            entityId: queries,
          }
        : null,
      blocked && blocked !== ratio
        ? {
            label: ctx.t("w.blocked"),
            value: fmt(ctx.locale, num(hass.states[blocked]), 0),
            entityId: blocked,
            tone: "info" as Tone,
          }
        : null,
      ratio
        ? {
            label: ctx.t("w.blocked_pct"),
            value: fmt(ctx.locale, ratioValue, 1),
            unit: "%",
            pct: ratioValue,
            entityId: ratio,
          }
        : null,
    ]),
    toggles: protection
      ? [{ entityId: protection, on: hass.states[protection]?.state === "on", label: ctx.t("w.protection") }]
      : [],
  };
};

// ---- speed test ----

export const speedtestAdapter: Adapter = (hass, ctx) => {
  const ids = platformEntities(hass, PLATFORMS.speedtest).filter((id) => domainOf(id) === "sensor");
  if (!ids.length) return null;
  return {
    summary: compact([
      valueMetric(hass, pick(hass, ids, ["download"]), ctx.t("w.download"), ctx.locale, 0),
      valueMetric(hass, pick(hass, ids, ["upload"]), ctx.t("w.upload"), ctx.locale, 0),
      valueMetric(hass, pick(hass, ids, ["ping", "latency"]), ctx.t("w.ping"), ctx.locale, 0),
    ]),
  };
};

// ---- Uptime Kuma ----

export const uptimeAdapter: Adapter = (hass, ctx) => {
  const ids = platformEntities(hass, PLATFORMS.uptime);
  if (!ids.length) return null;
  const rows: Row[] = byDevice(hass, ids)
    .map((dev) => {
      const statusId =
        pick(hass, dev.ids, ["status", "monitor_status"], "sensor") ??
        pick(hass, dev.ids, ["status", ""], "binary_sensor");
      const state = statusId ? hass.states[statusId]?.state : undefined;
      const tone = statusTone(state);
      const rt = pick(hass, dev.ids, ["response_time", "latency"]);
      return {
        id: dev.deviceId || dev.name,
        name: dev.name,
        value: rt
          ? `${fmt(ctx.locale, num(hass.states[rt]), 0)} ${unitOf(hass.states[rt])}`
          : statusLabel(ctx, tone),
        tone,
        ...(statusId ? { entityId: statusId } : {}),
      };
    })
    .sort((a, b) => (a.tone === "ok" ? 1 : 0) - (b.tone === "ok" ? 1 : 0));
  const down = rows.filter((r) => r.tone === "bad").length;
  return {
    summary: [
      {
        label: ctx.t("w.up"),
        value: `${rows.length - down}`,
        unit: `/ ${rows.length}`,
        tone: down ? "bad" : "ok",
      },
    ],
    rows,
  };
};

// ---- UPS ----

export const upsAdapter: Adapter = (hass, ctx) => {
  const ids = platformEntities(hass, PLATFORMS.ups);
  if (!ids.length) return null;
  const groups: MetricGroup[] = byDevice(hass, ids).map((dev) => {
    const statusId = pick(hass, dev.ids, ["ups_status", "status_display", "status"]);
    const status = statusId ? (hass.states[statusId]?.state ?? "") : "";
    const onBattery = /battery|ob\b|discharg/i.test(status);
    const runtime = pick(hass, dev.ids, ["battery_runtime", "timeleft", "runtime"]);
    return {
      id: dev.deviceId || dev.name,
      name: dev.name,
      status: { label: status, tone: onBattery ? "warn" : statusTone(status ? "ok" : "") },
      sub: runtime ? `${ctx.t("w.runtime")} ${uptimeOf(hass.states[runtime])}` : undefined,
      metrics: compact([
        (() => {
          const m = pctMetric(
            hass,
            pick(hass, dev.ids, ["battery_charge", "bcharge", "battery"]),
            ctx.t("w.battery"),
            ctx.locale,
          );
          return m ? { ...m, tone: usageTone(m.pct === null ? null : 100 - (m.pct ?? 0), 60, 80) } : null;
        })(),
        pctMetric(hass, pick(hass, dev.ids, ["load", "loadpct"]), ctx.t("w.load"), ctx.locale),
      ]),
    } satisfies MetricGroup;
  });
  return { groups };
};

// ---- 3D printers ----

export const printerAdapter: Adapter = (hass, ctx) => {
  const ids = platformEntities(hass, PLATFORMS.printer);
  if (!ids.length) return null;
  const rows: Row[] = byDevice(hass, ids).map((dev) => {
    const progress = pick(hass, dev.ids, ["print_progress", "job_percentage", "progress"], "sensor");
    const stage = pick(
      hass,
      dev.ids,
      ["current_stage", "print_status", "current_state", "state", "status"],
      "sensor",
    );
    const remaining = pick(hass, dev.ids, ["remaining_time", "time_remaining", "estimated_finish"], "sensor");
    const nozzle = pick(hass, dev.ids, ["nozzle_temp", "tool0", "hotend", "extruder"], "sensor");
    const pct = num(hass.states[progress ?? ""]);
    const state = hass.states[stage ?? ""]?.state ?? "";
    const printing = pct !== null && pct > 0 && pct < 100;
    return {
      id: dev.deviceId || dev.name,
      name: dev.name,
      sub: compact([
        state,
        remaining ? uptimeOf(hass.states[remaining]) : null,
        nozzle ? `${fmt(ctx.locale, num(hass.states[nozzle]), 0)} °C` : null,
      ]).join(" · "),
      value: pct !== null ? `${fmt(ctx.locale, pct, 0)} %` : state,
      tone: printing ? "active" : statusTone(isAvailable(hass.states[stage ?? ""]) ? "ok" : "unavailable"),
      pct: printing ? pct : null,
      ...(stage ? { entityId: stage } : {}),
    };
  });
  return { rows };
};

// ---- containers ----

export const containerAdapter: Adapter = (hass, ctx) => {
  const ids = platformEntities(hass, PLATFORMS.containers);
  if (!ids.length) return null;
  const switches = ids.filter((id) => domainOf(id) === "switch");
  const source = switches.length
    ? switches
    : ids.filter((id) => domainOf(id) === "binary_sensor" || /state|status/.test(keyOf(hass, id)));
  const rows: Row[] = source.map((id) => {
    const s = hass.states[id];
    const on = ["on", "running"].includes(s?.state ?? "");
    return {
      id,
      name: (s?.attributes.friendly_name as string | undefined) ?? id,
      tone: on ? "ok" : statusTone(s?.state),
      value: on ? ctx.t("w.running") : ctx.t("w.stopped"),
      entityId: id,
      ...(domainOf(id) === "switch" ? { toggle: { entityId: id, on } } : {}),
    };
  });
  const up = rows.filter((r) => r.tone === "ok").length;
  return { summary: [{ label: ctx.t("w.running"), value: `${up}`, unit: `/ ${rows.length}` }], rows };
};

// ---- router / internet ----

export const routerAdapter: Adapter = (hass, ctx) => {
  const ids = platformEntities(hass, PLATFORMS.router);
  if (!ids.length) return null;
  const connection = pick(
    hass,
    ids,
    ["connection", "is_connected", "wan_status", "internet"],
    "binary_sensor",
  );
  const tone = connection ? statusTone(hass.states[connection]?.state) : undefined;
  return {
    summary: compact([
      tone
        ? {
            label: ctx.t("w.internet"),
            value: statusLabel(ctx, tone),
            tone,
            ...(connection ? { entityId: connection } : {}),
          }
        : null,
      valueMetric(
        hass,
        pick(hass, ids, ["kb_s_received", "download_speed", "rx", "received"], "sensor"),
        ctx.t("w.download"),
        ctx.locale,
        0,
      ),
      valueMetric(
        hass,
        pick(hass, ids, ["kb_s_sent", "upload_speed", "tx", "sent"], "sensor"),
        ctx.t("w.upload"),
        ctx.locale,
        0,
      ),
    ]),
    note: (() => {
      const ip = pick(hass, ids, ["external_ip", "wan_ip", "ip"], "sensor");
      const up = pick(hass, ids, ["connection_uptime", "uptime"], "sensor");
      return (
        compact([
          ip ? hass.states[ip]?.state : null,
          up ? `${ctx.t("w.uptime")} ${uptimeOf(hass.states[up])}` : null,
        ]).join(" · ") || undefined
      );
    })(),
  };
};

// ---- VPN: Tailscale ----

export const vpnAdapter: Adapter = (hass, ctx) => {
  const ids = platformEntities(hass, PLATFORMS.vpn);
  if (!ids.length) return null;
  const rows: Row[] = byDevice(hass, ids).map((dev) => {
    const online = pick(hass, dev.ids, ["client_online", "online", "connected"]);
    const tone = online ? statusTone(hass.states[online]?.state) : "off";
    return {
      id: dev.deviceId || dev.name,
      name: dev.name,
      tone,
      value: statusLabel(ctx, tone),
      ...(online ? { entityId: online } : {}),
    };
  });
  return {
    summary: [
      {
        label: ctx.t("w.clients_online"),
        value: `${rows.filter((r) => r.tone === "ok").length}`,
        unit: `/ ${rows.length}`,
      },
    ],
    rows,
  };
};

// ---- Zigbee2MQTT bridge ----

export const zigbeeAdapter: Adapter = (hass, ctx) => {
  const ids = Object.keys(hass.states).filter(
    (id) => id.includes("zigbee2mqtt_bridge") || id.includes("z2m_bridge"),
  );
  if (!ids.length) return null;
  const conn = pick(hass, ids, ["connection_state"], "binary_sensor");
  const version = pick(hass, ids, ["version"], "sensor");
  const join = pick(hass, ids, ["permit_join"], "switch");
  const tone = conn ? statusTone(hass.states[conn]?.state) : "off";
  const devices = Object.values(hass.entities).filter(
    (e) => e.platform === "mqtt" && e.entity_id.endsWith("_linkquality"),
  ).length;
  return {
    summary: compact([
      { label: ctx.t("w.bridge"), value: statusLabel(ctx, tone), tone, ...(conn ? { entityId: conn } : {}) },
      devices ? { label: ctx.t("w.devices"), value: `${devices}` } : null,
      version
        ? { label: ctx.t("w.version"), value: hass.states[version]?.state ?? "—", entityId: version }
        : null,
    ]),
    toggles: join
      ? [{ entityId: join, on: hass.states[join]?.state === "on", label: ctx.t("w.permit_join") }]
      : [],
  };
};

// ---- Home Assistant itself: updates and backups ----

export const updatesAdapter: Adapter = (hass, ctx) => {
  const pending = Object.keys(hass.states).filter(
    (id) => domainOf(id) === "update" && hass.states[id]?.state === "on",
  );
  const all = Object.keys(hass.states).filter((id) => domainOf(id) === "update");
  if (!all.length) return null;
  const rows: Row[] = pending.map((id) => {
    const s = hass.states[id];
    return {
      id,
      name:
        (s?.attributes.title as string | undefined) ||
        ((s?.attributes.friendly_name as string | undefined) ?? id),
      sub: `${(s?.attributes.installed_version as string | undefined) ?? ""} → ${(s?.attributes.latest_version as string | undefined) ?? ""}`,
      tone: "warn",
      entityId: id,
    };
  });
  return {
    summary: [
      { label: ctx.t("w.updates"), value: `${pending.length}`, tone: pending.length ? "warn" : "ok" },
    ],
    rows,
    ...(pending.length ? {} : { note: ctx.t("w.all_current") }),
  };
};

export const backupAdapter: Adapter = (hass, ctx) => {
  const ids = platformEntities(hass, ["backup"]);
  if (!ids.length) return null;
  const last = pick(hass, ids, ["last_successful_automatic_backup", "last_successful", "last_backup"]);
  const next = pick(hass, ids, ["next_scheduled_automatic_backup", "next"]);
  const state = pick(hass, ids, ["backup_manager_state", "manager_state", "state"]);
  const lastTime = Date.parse(hass.states[last ?? ""]?.state ?? "");
  const ageDays = Number.isFinite(lastTime) ? (Date.now() - lastTime) / 86400000 : null;
  const when = (id: string | undefined) => {
    const v = Date.parse(hass.states[id ?? ""]?.state ?? "");
    if (!Number.isFinite(v)) return "—";
    const day = new Date(v);
    const today = new Date();
    const diff = Math.round(
      (new Date(day.toDateString()).getTime() - new Date(today.toDateString()).getTime()) / 86400000,
    );
    const time = new Intl.DateTimeFormat(ctx.locale, { hour: "2-digit", minute: "2-digit" }).format(day);
    const label =
      diff === 0
        ? ctx.t("waste.today")
        : diff === 1
          ? ctx.t("waste.tomorrow")
          : diff === -1
            ? ctx.t("w.yesterday")
            : new Intl.DateTimeFormat(ctx.locale, { day: "numeric", month: "short" }).format(day);
    return `${label} ${time}`;
  };
  return {
    summary: compact([
      {
        label: ctx.t("w.last_backup"),
        value: when(last),
        tone: ageDays === null ? "off" : ageDays > 7 ? "bad" : ageDays > 2 ? "warn" : "ok",
        ...(last ? { entityId: last } : {}),
      },
      next ? { label: ctx.t("w.next_backup"), value: when(next), entityId: next } : null,
    ]),
    note: state ? hass.states[state]?.state : undefined,
  };
};

// ---- demo data for previews ----

export const DEMO: Record<string, (ctx: AdapterContext) => DataModel> = {
  system: (c) => ({
    groups: [
      {
        id: "1",
        name: "homeserver",
        sub: "12 d 4 h",
        metrics: [
          { label: c.t("w.cpu"), value: "23", unit: "%", pct: 23, tone: "ok" },
          { label: c.t("w.memory"), value: "61", unit: "%", pct: 61, tone: "ok" },
          { label: c.t("w.disk"), value: "82", unit: "%", pct: 82, tone: "warn" },
          { label: c.t("w.temperature"), value: "48", unit: "°C" },
        ],
      },
    ],
  }),
  proxmox: (c) => ({
    summary: [{ label: c.t("w.running"), value: "5", unit: "/ 6", tone: "warn" }],
    groups: [
      {
        id: "n",
        name: "pve",
        status: { label: c.t("w.state.online"), tone: "ok" },
        sub: "31 d 2 h",
        metrics: [
          { label: c.t("w.cpu"), value: "18", unit: "%", pct: 18, tone: "ok" },
          { label: c.t("w.memory"), value: "71", unit: "%", pct: 71, tone: "ok" },
        ],
      },
      {
        id: "a",
        name: "homeassistant",
        status: { label: c.t("w.state.online"), tone: "ok" },
        metrics: [
          { label: c.t("w.cpu"), value: "6", unit: "%", pct: 6, tone: "ok" },
          { label: c.t("w.memory"), value: "44", unit: "%", pct: 44, tone: "ok" },
        ],
      },
      {
        id: "b",
        name: "docker",
        status: { label: c.t("w.state.online"), tone: "ok" },
        metrics: [
          { label: c.t("w.cpu"), value: "31", unit: "%", pct: 31, tone: "ok" },
          { label: c.t("w.memory"), value: "88", unit: "%", pct: 88, tone: "warn" },
        ],
      },
      { id: "c", name: "test-vm", status: { label: c.t("w.state.offline"), tone: "bad" }, metrics: [] },
    ],
  }),
  nas: (c) => ({
    groups: [
      {
        id: "1",
        name: "TrueNAS",
        sub: "64 d 1 h",
        status: { label: "HEALTHY", tone: "ok" },
        metrics: [
          { label: "tank", value: "67", unit: "%", pct: 67, tone: "ok" },
          { label: "backup", value: "91", unit: "%", pct: 91, tone: "bad" },
          { label: c.t("w.cpu"), value: "9", unit: "%", pct: 9, tone: "ok" },
          { label: c.t("w.temperature"), value: "39", unit: "°C" },
        ],
      },
    ],
  }),
  unifi: (c) => ({
    summary: [
      { label: c.t("w.clients_online"), value: "37", tone: "info" },
      { label: c.t("w.devices"), value: "4" },
      { label: c.t("w.updates"), value: "1", tone: "warn" },
    ],
    groups: [
      {
        id: "1",
        name: "UDM Pro",
        status: { label: "connected", tone: "ok" },
        sub: "18 d 3 h",
        metrics: [
          { label: c.t("w.cpu"), value: "14", unit: "%", pct: 14, tone: "ok" },
          { label: c.t("w.memory"), value: "58", unit: "%", pct: 58, tone: "ok" },
          { label: c.t("w.temperature"), value: "54", unit: "°C" },
        ],
      },
      {
        id: "2",
        name: "AP Wohnzimmer",
        status: { label: "connected", tone: "ok" },
        metrics: [{ label: c.t("w.clients"), value: "21" }],
      },
      {
        id: "3",
        name: "AP Büro",
        status: { label: "connected", tone: "ok" },
        metrics: [{ label: c.t("w.clients"), value: "9" }],
      },
    ],
    toggles: [{ entityId: "switch.demo_guest", on: true, label: "Gast-WLAN" }],
  }),
  dns: (c) => ({
    summary: [
      { label: c.t("w.queries"), value: "48.213" },
      { label: c.t("w.blocked"), value: "7.904", tone: "info" },
      { label: c.t("w.blocked_pct"), value: "16,4", unit: "%", pct: 16.4 },
    ],
    toggles: [{ entityId: "switch.demo_dns", on: true, label: c.t("w.protection") }],
  }),
  speedtest: (c) => ({
    summary: [
      { label: c.t("w.download"), value: "243", unit: "Mbit/s" },
      { label: c.t("w.upload"), value: "41", unit: "Mbit/s" },
      { label: c.t("w.ping"), value: "12", unit: "ms" },
    ],
  }),
  uptime: (c) => ({
    summary: [{ label: c.t("w.up"), value: "7", unit: "/ 8", tone: "bad" }],
    rows: [
      { id: "1", name: "Nextcloud", value: c.t("w.state.offline"), tone: "bad" },
      { id: "2", name: "Home Assistant", value: "38 ms", tone: "ok" },
      { id: "3", name: "Jellyfin", value: "52 ms", tone: "ok" },
      { id: "4", name: "Portainer", value: "21 ms", tone: "ok" },
    ],
  }),
  ups: (c) => ({
    groups: [
      {
        id: "1",
        name: "APC Back-UPS",
        status: { label: "Online", tone: "ok" },
        sub: `${c.t("w.runtime")} 42 min`,
        metrics: [
          { label: c.t("w.battery"), value: "100", unit: "%", pct: 100, tone: "ok" },
          { label: c.t("w.load"), value: "27", unit: "%", pct: 27, tone: "ok" },
        ],
      },
    ],
  }),
  printer: () => ({
    rows: [
      {
        id: "1",
        name: "Bambu P1S",
        sub: "printing · 1 h 12 min · 220 °C",
        value: "64 %",
        tone: "active",
        pct: 64,
      },
    ],
  }),
  containers: (c) => ({
    summary: [{ label: c.t("w.running"), value: "11", unit: "/ 12" }],
    rows: [
      {
        id: "1",
        name: "nextcloud",
        value: c.t("w.running"),
        tone: "ok",
        toggle: { entityId: "switch.demo_1", on: true },
      },
      {
        id: "2",
        name: "jellyfin",
        value: c.t("w.running"),
        tone: "ok",
        toggle: { entityId: "switch.demo_2", on: true },
      },
      {
        id: "3",
        name: "old-wiki",
        value: c.t("w.stopped"),
        tone: "bad",
        toggle: { entityId: "switch.demo_3", on: false },
      },
    ],
  }),
  router: (c) => ({
    summary: [
      { label: c.t("w.internet"), value: c.t("w.state.online"), tone: "ok" },
      { label: c.t("w.download"), value: "3.420", unit: "kB/s" },
      { label: c.t("w.upload"), value: "512", unit: "kB/s" },
    ],
    note: `${c.t("w.uptime")} 9 d 3 h`,
  }),
  vpn: (c) => ({
    summary: [{ label: c.t("w.clients_online"), value: "3", unit: "/ 4" }],
    rows: [
      { id: "1", name: "phone", value: c.t("w.state.online"), tone: "ok" },
      { id: "2", name: "laptop", value: c.t("w.state.offline"), tone: "bad" },
    ],
  }),
  zigbee: (c) => ({
    summary: [
      { label: c.t("w.bridge"), value: c.t("w.state.online"), tone: "ok" },
      { label: c.t("w.devices"), value: "42" },
      { label: c.t("w.version"), value: "2.7.1" },
    ],
    toggles: [{ entityId: "switch.demo_join", on: false, label: c.t("w.permit_join") }],
  }),
  updates: (c) => ({
    summary: [{ label: c.t("w.updates"), value: "2", tone: "warn" }],
    rows: [
      { id: "1", name: "Home Assistant Core", sub: "2026.9.3 → 2026.10.1", tone: "warn" },
      { id: "2", name: "Zigbee2MQTT", sub: "2.7.1 → 2.8.0", tone: "warn" },
    ],
  }),
  backup: (c) => ({
    summary: [
      { label: c.t("w.last_backup"), value: "heute 04:45", tone: "ok" },
      { label: c.t("w.next_backup"), value: "morgen 04:45" },
    ],
    note: "idle",
  }),
};

export const HOMELAB_ADAPTERS: Record<string, Adapter> = {
  system: systemAdapter,
  proxmox: proxmoxAdapter,
  nas: nasAdapter,
  unifi: unifiAdapter,
  dns: dnsAdapter,
  speedtest: speedtestAdapter,
  uptime: uptimeAdapter,
  ups: upsAdapter,
  printer: printerAdapter,
  containers: containerAdapter,
  router: routerAdapter,
  vpn: vpnAdapter,
  zigbee: zigbeeAdapter,
  updates: updatesAdapter,
  backup: backupAdapter,
};
