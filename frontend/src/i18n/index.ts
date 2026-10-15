// UI strings in English and German. English is the source and the fallback.

const en = {
  "theme.auto": "Auto",
  "theme.dark": "Dark",
  "theme.light": "Light",
  "theme.label": "Appearance",
  "menu.open": "Menu",
  "section.lights": "Lights",
  "area.none": "No area",
  "state.on": "On",
  "state.off": "Off",
  "state.unavailable": "Unavailable",
  "state.unknown": "Unknown",
  "control.light": "Light",
  "control.brightness": "Brightness",
  "control.close": "Close",
  "hint.controls": "Tap to switch · long press or right click for controls",
} as const;

export type MessageKey = keyof typeof en;

const de: Record<MessageKey, string> = {
  "theme.auto": "Auto",
  "theme.dark": "Dunkel",
  "theme.light": "Hell",
  "theme.label": "Darstellung",
  "menu.open": "Menü",
  "section.lights": "Licht",
  "area.none": "Ohne Bereich",
  "state.on": "An",
  "state.off": "Aus",
  "state.unavailable": "Nicht verfügbar",
  "state.unknown": "Unbekannt",
  "control.light": "Licht",
  "control.brightness": "Helligkeit",
  "control.close": "Schließen",
  "hint.controls": "Tippen schaltet · lange drücken oder Rechtsklick öffnet die Steuerung",
};

const catalogs: Record<string, Record<MessageKey, string>> = { en, de };

export type Translate = (key: MessageKey) => string;

/** Translator for a Home Assistant language code such as "de" or "en-GB". */
export function translator(language: string | undefined): Translate {
  const base = (language ?? "en").split("-")[0] ?? "en";
  const catalog = catalogs[base] ?? en;
  return (key) => catalog[key] ?? en[key];
}
