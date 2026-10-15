# Atrium

A Home Assistant dashboard that lives in the sidebar as its own panel. It builds itself from your
areas, devices and entities, and every part of it can be switched off, reordered or replaced by any
Lovelace card.

> **Status:** early development. Nothing here is usable yet.

## Planned

- Home page for quick control: status, favorites, lights, heating, scenes, rooms
- A page per area, plus category pages (lights, heating, security, energy, media, batteries)
- Settings inside the panel, no YAML: modules, rooms, entities, favorites, card slots, appearance
- Card slots that accept any Lovelace card (e.g. Mushroom, mini-graph-card)
- Phone and desktop first; wall tablet and floor plan later
- Works remotely through Home Assistant Cloud and the Companion app, because it is a regular panel
- English and German UI
- Installation through HACS

## Development

`dev/compose.yaml` starts a disposable Home Assistant instance for testing. See the comments in the
file for the available variables.

## License

[MIT](LICENSE)
