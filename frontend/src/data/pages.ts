// Pages made of widgets: the home page and pages admins create. Stored in the
// shared layout under `pages`. Without a stored home page the old module
// settings (`layout.home`) decide, so existing installs keep their look.

import { withoutKey } from "../util/object";
import { homeModuleList } from "./layout";
import type { Level } from "./levels";

export type WidgetSize = "s" | "m" | "l";
export const WIDGET_SIZES: readonly WidgetSize[] = ["s", "m", "l"];

export interface WidgetInstance {
  /** Unique within the page. */
  id: string;
  type: string;
  size?: WidgetSize;
  /** Wide screens: left (1) or right (2) column for half and small widgets; default alternates. */
  col?: 1 | 2;
  /** Shown from this level on (overrides the widget's default). */
  minLevel?: Level;
  /** Own heading instead of the widget's name. */
  title?: string;
  /** Widget-specific settings, e.g. chosen entities. */
  options?: Record<string, unknown>;
  /** Switched off but kept with its settings. */
  disabled?: boolean;
}

export interface PageConfig {
  id: string;
  title?: string;
  /** Material Design icon name, e.g. "mdi:server". */
  icon?: string;
  minLevel?: Level;
  widgets: WidgetInstance[];
}

interface PagesLayout {
  pages?: Record<string, PageConfig>;
}

export const HOME_PAGE = "home";

/** Default sizes of the original home modules. */
/** The original two-column home page: lights and rooms on the right. */
const LEGACY_COL: Record<string, 1 | 2> = { climate: 1, solar: 1, scenes: 1, waste: 1, lights: 2 };

const LEGACY_SIZE: Record<string, WidgetSize> = {
  header: "l",
  status: "l",
  climate: "m",
  solar: "m",
  lights: "m",
  scenes: "m",
  waste: "m",
  rooms: "l",
};

let counter = 0;
/** A short id that is unique enough within one layout. */
export function newId(prefix = "w"): string {
  counter = (counter + 1) % 1296;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

const pagesOf = (raw: Record<string, unknown> | undefined) => (raw as PagesLayout | undefined)?.pages ?? {};

/** The home page as stored, or built from the old module settings. */
function homePage(raw: Record<string, unknown> | undefined): PageConfig {
  const stored = pagesOf(raw)[HOME_PAGE];
  if (stored) return stored;
  return {
    id: HOME_PAGE,
    widgets: homeModuleList(raw).map((m) => ({
      id: m.id,
      type: m.id,
      size: LEGACY_SIZE[m.id] ?? "m",
      ...(LEGACY_COL[m.id] ? { col: LEGACY_COL[m.id] } : {}),
      ...(m.enabled ? {} : { disabled: true }),
    })),
  };
}

/** Extra widgets below a room's automatic content live on the page "room:<area id>". */
export const roomPageId = (areaId: string) => `room:${areaId}`;

export function page(raw: Record<string, unknown> | undefined, id: string): PageConfig | undefined {
  if (id === HOME_PAGE) return homePage(raw);
  return pagesOf(raw)[id] ?? (id.startsWith("room:") ? { id, widgets: [] } : undefined);
}

/** Pages created by admins, in creation order. */
export function customPages(raw: Record<string, unknown> | undefined): PageConfig[] {
  return Object.values(pagesOf(raw)).filter((p) => p.id !== HOME_PAGE && !p.id.startsWith("room:"));
}

export function savePage(raw: Record<string, unknown>, config: PageConfig): Record<string, unknown> {
  return { ...raw, pages: { ...pagesOf(raw), [config.id]: config } };
}

export function createPage(
  raw: Record<string, unknown>,
  title: string,
  widgets: WidgetInstance[] = [],
): { layout: Record<string, unknown>; id: string } {
  const taken = new Set(Object.keys(pagesOf(raw)));
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "page";
  let id = base;
  for (let n = 2; taken.has(id) || id === HOME_PAGE; n++) id = `${base}-${n}`;
  return { layout: savePage(raw, { id, title, widgets }), id };
}

export function deletePage(raw: Record<string, unknown>, id: string): Record<string, unknown> {
  return { ...raw, pages: withoutKey(pagesOf(raw), id) };
}

function withWidgets(
  raw: Record<string, unknown>,
  pageId: string,
  change: (widgets: WidgetInstance[]) => WidgetInstance[],
): Record<string, unknown> {
  const current = page(raw, pageId);
  if (!current) return raw;
  return savePage(raw, { ...current, widgets: change(current.widgets) });
}

export const addWidget = (
  raw: Record<string, unknown>,
  pageId: string,
  widget: Omit<WidgetInstance, "id">,
): Record<string, unknown> => withWidgets(raw, pageId, (w) => [...w, { id: newId(), ...widget }]);

export const removeWidget = (raw: Record<string, unknown>, pageId: string, widgetId: string) =>
  withWidgets(raw, pageId, (w) => w.filter((x) => x.id !== widgetId));

export const updateWidget = (
  raw: Record<string, unknown>,
  pageId: string,
  widgetId: string,
  patch: Partial<Omit<WidgetInstance, "id">>,
) =>
  withWidgets(raw, pageId, (w) =>
    w.map((x) => {
      if (x.id !== widgetId) return x;
      const next: WidgetInstance = { ...x, ...patch };
      // Undefined means "back to default": drop the key so the stored layout stays small.
      return Object.fromEntries(
        Object.entries(next).filter(([, value]) => value !== undefined),
      ) as unknown as WidgetInstance;
    }),
  );

/** Put widgets in this order (ids not mentioned keep their relative place at the end). */
export const orderWidgets = (raw: Record<string, unknown>, pageId: string, ids: string[]) =>
  withWidgets(raw, pageId, (w) => {
    const byId = new Map(w.map((x) => [x.id, x]));
    const ordered = ids.map((id) => byId.get(id)).filter((x): x is WidgetInstance => Boolean(x));
    return [...ordered, ...w.filter((x) => !ids.includes(x.id))];
  });

export function moveWidget(raw: Record<string, unknown>, pageId: string, widgetId: string, delta: -1 | 1) {
  return withWidgets(raw, pageId, (w) => {
    const i = w.findIndex((x) => x.id === widgetId);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= w.length) return w;
    const next = [...w];
    const [item] = next.splice(i, 1);
    if (item) next.splice(j, 0, item);
    return next;
  });
}
