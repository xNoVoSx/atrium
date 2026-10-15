// Admin overrides of the automatic layout (shared) and personal settings (per
// user). Everything not mentioned keeps its automatic place, so new entities,
// rooms and modules appear without migrations. All changes return new objects.

export const HOME_MODULES = ["header", "status", "climate", "lights", "scenes", "waste", "rooms"] as const;
export type HomeModule = (typeof HOME_MODULES)[number];

/**
 * Off unless an admin switches them on: rooms have their own page, the next
 * waste pickup already sits in the header, and scenes are not for everyone.
 */
export const DEFAULT_HIDDEN: readonly HomeModule[] = ["scenes", "waste", "rooms"];

export interface HomeLayout {
  /** Module ids in display order; unknown ids are ignored. */
  order?: string[];
  /** Module ids switched off; when missing, DEFAULT_HIDDEN applies. */
  hidden?: string[];
}

export interface Layout {
  home?: HomeLayout;
  /** Entities hidden in Atrium (Home Assistant is not changed). */
  hiddenEntities?: string[];
  /** Custom order per list, e.g. "lights:home", "lights:kitchen", "rooms". */
  order?: Record<string, string[]>;
  /** Areas hidden in Atrium. */
  hiddenAreas?: string[];
}

export interface UserSettings {
  /** Entity ids, in the user's order. */
  favorites?: string[];
}

const asLayout = (raw: Record<string, unknown> | undefined): Layout => (raw ?? {}) as Layout;

// ---- home modules ----

export function homeModules(layout: Record<string, unknown> | undefined): HomeModule[] {
  return homeModuleList(layout)
    .filter((m) => m.enabled)
    .map((m) => m.id);
}

/** All modules in order with their on/off state, for the settings page. */
export function homeModuleList(
  layout: Record<string, unknown> | undefined,
): Array<{ id: HomeModule; enabled: boolean }> {
  const home = asLayout(layout).home ?? {};
  const known = (id: string): id is HomeModule => (HOME_MODULES as readonly string[]).includes(id);
  const ordered = (home.order ?? []).filter(known);
  const rest = HOME_MODULES.filter((id) => !ordered.includes(id));
  const hidden = new Set<string>(home.hidden ?? DEFAULT_HIDDEN);
  return [...ordered, ...rest].map((id) => ({ id, enabled: !hidden.has(id) }));
}

export function setModuleEnabled(raw: Record<string, unknown>, id: HomeModule, enabled: boolean): Layout {
  const layout = asLayout(raw);
  const hidden = new Set<string>(layout.home?.hidden ?? DEFAULT_HIDDEN);
  if (enabled) hidden.delete(id);
  else hidden.add(id);
  return { ...layout, home: { ...layout.home, hidden: [...hidden] } };
}

export function moveModule(raw: Record<string, unknown>, id: HomeModule, delta: -1 | 1): Layout {
  const layout = asLayout(raw);
  const order = homeModuleList(raw).map((m) => m.id as string);
  return { ...layout, home: { ...layout.home, order: moveBy(order, id, delta) } };
}

// ---- hidden entities and areas ----

export const hiddenEntities = (raw: Record<string, unknown> | undefined) =>
  new Set(asLayout(raw).hiddenEntities ?? []);

export function setEntityHidden(raw: Record<string, unknown>, entityId: string, hidden: boolean): Layout {
  const layout = asLayout(raw);
  const set = new Set(layout.hiddenEntities ?? []);
  if (hidden) set.add(entityId);
  else set.delete(entityId);
  return { ...layout, hiddenEntities: [...set].sort() };
}

export const hiddenAreas = (raw: Record<string, unknown> | undefined) =>
  new Set(asLayout(raw).hiddenAreas ?? []);

export function setAreaHidden(raw: Record<string, unknown>, areaId: string, hidden: boolean): Layout {
  const layout = asLayout(raw);
  const set = new Set(layout.hiddenAreas ?? []);
  if (hidden) set.add(areaId);
  else set.delete(areaId);
  return { ...layout, hiddenAreas: [...set].sort() };
}

// ---- order ----

/**
 * Sort ids by a saved order: known ids in saved order first, the rest (new
 * ones) after them in their automatic order.
 */
export function applyOrder(ids: readonly string[], saved: readonly string[] | undefined): string[] {
  if (!saved?.length) return [...ids];
  const present = new Set(ids);
  const ordered = saved.filter((id) => present.has(id));
  const placed = new Set(ordered);
  return [...ordered, ...ids.filter((id) => !placed.has(id))];
}

export const savedOrder = (raw: Record<string, unknown> | undefined, key: string) =>
  asLayout(raw).order?.[key];

export function setOrder(raw: Record<string, unknown>, key: string, ids: string[]): Layout {
  const layout = asLayout(raw);
  return { ...layout, order: { ...layout.order, [key]: ids } };
}

/** Move one item within a list by one step. */
export function moveBy<T>(list: readonly T[], item: T, delta: -1 | 1): T[] {
  const i = list.indexOf(item);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return [...list];
  const next = [...list];
  next.splice(i, 1);
  next.splice(j, 0, item);
  return next;
}

// ---- favourites (per user) ----

export const favorites = (user: Record<string, unknown> | undefined) =>
  ((user ?? {}) as UserSettings).favorites ?? [];

export function toggleFavorite(user: Record<string, unknown>, entityId: string): UserSettings {
  const list = favorites(user);
  return {
    ...(user as UserSettings),
    favorites: list.includes(entityId) ? list.filter((id) => id !== entityId) : [...list, entityId],
  };
}

export function setFavoritesOrder(user: Record<string, unknown>, ids: string[]): UserSettings {
  return { ...(user as UserSettings), favorites: ids };
}
