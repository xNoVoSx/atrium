# Atrium

A Home Assistant dashboard that lives in the sidebar as its own panel. It builds itself from your
areas, devices and entities, and admins can adjust everything directly in the panel: hide entities,
reorder tiles and rooms, switch modules on and off.

> **Status:** early alpha. The skeleton works (panel, live data, light tiles, controls, themes,
> self-updating screens); the real home page, room pages and settings are being built.

## Highlights (planned and in progress)

- Home page for quick control: status, favorites, lights, heating, scenes, rooms
- A page per area, plus category pages (lights, heating, security, energy, media, batteries)
- Built automatically, editable by admins inside the panel, no YAML
- Phone and desktop first: bottom sheets and swiping on phones, dialogs and a sidebar on desktop
- Dark, light or follow Home Assistant
- Works remotely through Home Assistant Cloud and the Companion app, because it is a regular panel
- Only redraws what changed, so it stays smooth on cheap wall tablets
- Open screens load a new Atrium version by themselves
- English and German UI
- Later, optional: card slots that accept any Lovelace card

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
cp .env.example .env   # fill in your instance, SSH target, test user and a test light
node --env-file=.env scripts/deploy.mjs
cd e2e && npm ci && npm run install-browser && npm test && npm run update-check
```

The end-to-end tests log in as a non-admin test user and drive two clients at once: a phone in
Companion-app mode and a desktop browser. They switch only the configured test light and restore it.

## License

[MIT](LICENSE)
