# Atrium

A Home Assistant dashboard that lives in the sidebar as its own panel. It builds itself from your
areas, devices and entities, and admins can adjust everything directly in the panel: hide entities,
reorder tiles and rooms, switch modules on and off.

> **Status:** alpha. Usable day to day; settings and widget formats may still change.

## What it does

**Built automatically, changed in place.** Atrium reads your areas, devices and entities and builds
a home page, a page per room and category pages. Admins switch on edit mode and change things right
there: move, resize and set up widgets, add new ones from a catalogue, hide entities, reorder tiles,
rooms and sections. Nothing needs YAML.

**Pages made of widgets.** About 50 widgets, grouped:

| Group | Widgets |
|---|---|
| Overview | clock/weather/next bin header, alerts (open doors, gate, batteries), rooms, one room |
| Light and climate | lights and favourites, heating with direct target change, scenes (with an explanation), fans |
| Household | covers, robot vacuum/mower, appliances (running or done from their power), timers, switches, scripts and automations, plants, to-do/shopping list |
| Security | security at a glance, locks (unlock needs a second tap), alarm panel, cameras |
| Energy | solar now and today, animated energy flow, batteries |
| Information | weather forecast, calendar, people at home, large clock, sun, notifications, activity timeline |
| Network and servers | UniFi, router/internet, speed test, Pi-hole/AdGuard, Tailscale, Zigbee2MQTT, Proxmox, NAS (TrueNAS, Synology), server load (System Monitor, Glances), containers, Uptime Kuma, UPS, 3D printers, updates, backups |
| Build your own | chosen entities, history graph, gauge, note, quick links, web page |

Widgets for integrations you do not have show sample data in the catalogue, so you can see them
before installing anything.

**Your own pages and menu.** Create pages (empty or from a template such as "Information" or
"Network and servers"). The menu is a list you edit: pages, single rooms or categories, all rooms
expanded, links, headings, dividers; choose what goes into the phone's bottom bar.

**Views for different people.** Every user gets a view level — *simple* (large and calm), *standard*
or *expert* — assigned by an admin or chosen by the user. Widgets, pages and menu entries can be
limited to a level. Each user can also pick an accent colour and a size.

**Made for phones, desktops and wall tablets.** Bottom sheets and swiping on phones, dialogs and a
sidebar on desktop, a two-column layout on wide screens, Ctrl/⌘+K search over rooms, devices and
pages, and a screensaver with a drifting clock for wall tablets.

**Calm motion.** Lights fill with colour from the bulb, the heating badge flickers, fans turn,
values slide in, energy dots flow. All motion follows a per-user switch and the system's
"reduce motion" setting.

**Plus:** dark, light or follow Home Assistant; works remotely through Home Assistant Cloud and the
Companion app (it is a regular panel); only redraws what changed; open screens load a new Atrium
version by themselves; failed actions and lost connections are reported; English and German.

Requires Home Assistant 2026.9 or newer.

## Installation

### HACS (custom repository)

1. HACS → three-dot menu → **Custom repositories** → add `https://github.com/xNoVoSx/atrium`,
   type **Integration**.
2. Install **Atrium**, then restart Home Assistant.
3. **Settings → Devices & services → Add integration → Atrium.** The panel appears in the sidebar.

### Manual

Download `atrium.zip` from the latest [release](https://github.com/xNoVoSx/atrium/releases),
unpack it into `config/custom_components/atrium/`, restart Home Assistant and add the integration.

A source checkout does not contain the built frontend; use a release or build it yourself (below).

## Development

```text
custom_components/atrium/   integration (panel, settings storage, WebSocket API)
frontend/                   TypeScript + Lit, built with Vite into custom_components/atrium/frontend/
tests/                      Python tests (pytest-homeassistant-custom-component)
e2e/                        Playwright tests against a real Home Assistant
scripts/deploy.mjs          build and install on a development Home Assistant over SSH
```

```sh
# Frontend: type check, lint, unit tests, build
cd frontend && npm ci && npm run check && npm run build

# Python: lint and tests
python -m venv .venv && .venv/bin/pip install -r requirements_test.txt
.venv/bin/ruff check custom_components tests && .venv/bin/pytest

# Deploy to a development Home Assistant and run the end-to-end tests
cp .env.example .env   # fill in your instance, SSH target, test users and a test light
node --env-file=.env scripts/deploy.mjs
cd e2e && npm ci && npm run install-browser && npm test && npm run edit && npm run update-check
npm run tour           # screenshots of the main screens as an admin
```

The end-to-end tests log in as a non-admin test user and drive two clients at once: a phone in
Companion-app mode and a desktop browser. They switch only the configured test light and restore it.
`npm run edit` runs as an admin (edit mode, widgets, menu, pages, levels) and restores the shared
layout afterwards.

## License

[MIT](LICENSE)
