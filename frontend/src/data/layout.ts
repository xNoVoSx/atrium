// The home page is a list of modules. Order and visibility come from the
// shared layout settings (changed by admins); anything not mentioned there
// keeps its default place, so new modules appear without migrations.

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

export function homeModules(layout: Record<string, unknown> | undefined): HomeModule[] {
  const home = (layout?.home ?? {}) as HomeLayout;
  const known = (id: string): id is HomeModule => (HOME_MODULES as readonly string[]).includes(id);
  const ordered = (home.order ?? []).filter(known);
  const rest = HOME_MODULES.filter((id) => !ordered.includes(id));
  const hidden = new Set<string>(home.hidden ?? DEFAULT_HIDDEN);
  return [...ordered, ...rest].filter((id) => !hidden.has(id));
}
