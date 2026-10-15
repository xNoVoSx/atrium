// The navigation (rail on wide screens, bar at the bottom on phones) as a list
// admins can change: entries for pages, single rooms or categories, all rooms
// or all categories expanded, links, headings and dividers. Without a stored
// list the default applies, so new installs get a sensible menu.

import type { Level } from "./levels";
import { levelAllows } from "./levels";
import type { PageRoute } from "../router";

export type NavKind =
  | "home"
  | "rooms"
  | "categories"
  | "settings"
  | "search"
  | "room"
  | "category"
  | "page"
  | "link"
  | "heading"
  | "divider"
  | "all-rooms"
  | "all-categories";

export interface NavItem {
  id: string;
  kind: NavKind;
  /** Own label instead of the automatic one. */
  label?: string;
  /** Material Design icon ("mdi:…") instead of the automatic one. */
  icon?: string;
  areaId?: string;
  category?: string;
  pageId?: string;
  url?: string;
  minLevel?: Level;
  hidden?: boolean;
  /** Also in the phone's bottom bar. */
  bottom?: boolean;
}

export interface NavLayout {
  items?: NavItem[];
  /** Wide screens: "full" rail with labels, or "icons" only. */
  rail?: "full" | "icons";
}

export const CATEGORIES = [
  "light",
  "climate",
  "energy",
  "security",
  "media",
  "batteries",
  "homelab",
] as const;

export function defaultNav(): NavItem[] {
  return [
    { id: "home", kind: "home", bottom: true },
    { id: "rooms", kind: "rooms", bottom: true },
    { id: "categories", kind: "categories", bottom: true, minLevel: "standard" },
    { id: "search", kind: "search", minLevel: "standard" },
    { id: "settings", kind: "settings", bottom: true },
  ];
}

const navOf = (raw: Record<string, unknown> | undefined) => ((raw ?? {}) as { nav?: NavLayout }).nav ?? {};

/** The stored list (or the default), including hidden ones, for the editor. */
export function navItems(raw: Record<string, unknown> | undefined): NavItem[] {
  const items = navOf(raw).items;
  return items?.length ? items : defaultNav();
}

export const railMode = (raw: Record<string, unknown> | undefined) => navOf(raw).rail ?? "full";

export function setNav(raw: Record<string, unknown>, patch: NavLayout): Record<string, unknown> {
  return { ...raw, nav: { ...navOf(raw), ...patch } };
}

export const setNavItems = (raw: Record<string, unknown>, items: NavItem[]) => setNav(raw, { items });

/** What a user of this level sees, in order. */
export function visibleNav(raw: Record<string, unknown> | undefined, level: Level): NavItem[] {
  const items = navItems(raw).filter((i) => !i.hidden && levelAllows(level, i.minLevel));
  // Settings stay reachable for everyone (appearance, own view level) — but
  // only when an admin did not explicitly hide them.
  return items;
}

/** Route of an entry, or null for links, headings and dividers. */
export function navRoute(item: NavItem): PageRoute | null {
  switch (item.kind) {
    case "home":
      return { page: "home" };
    case "rooms":
      return { page: "rooms" };
    case "categories":
      return { page: "categories" };
    case "settings":
      return { page: "settings" };
    case "room":
      return item.areaId ? { page: "room", areaId: item.areaId } : null;
    case "category":
      return item.category ? { page: "category", category: item.category } : null;
    case "page":
      return item.pageId ? { page: "page", pageId: item.pageId } : null;
    default:
      return null;
  }
}

/** Is this entry the one for the shown page? */
export function navMatches(item: NavItem, route: PageRoute): boolean {
  switch (item.kind) {
    case "home":
      return route.page === "home";
    case "rooms":
      return route.page === "rooms" || route.page === "room";
    case "categories":
      return route.page === "categories" || route.page === "category";
    case "settings":
      return route.page === "settings";
    case "room":
      return route.page === "room" && route.areaId === item.areaId;
    case "category":
      return route.page === "category" && route.category === item.category;
    case "page":
      return route.page === "page" && route.pageId === item.pageId;
    default:
      return false;
  }
}

let n = 0;
export const navId = (kind: string) => `${kind}-${Date.now().toString(36)}${(n++ % 1296).toString(36)}`;
