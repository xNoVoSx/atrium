// Pages inside the panel. Home Assistant passes `route.path` relative to the
// panel URL (/atrium), e.g. "/" or "/room/kitchen".

export type PageRoute =
  | { page: "home" }
  | { page: "rooms" }
  | { page: "room"; areaId: string }
  | { page: "categories" }
  | { page: "category"; category: string }
  | { page: "settings" }
  | { page: "page"; pageId: string };

export type PageName = PageRoute["page"];

export function parseRoute(path: string | undefined): PageRoute {
  const parts = (path ?? "/").split("/").filter(Boolean).map(decodeURIComponent);
  switch (parts[0]) {
    case "rooms":
      return { page: "rooms" };
    case "room":
      return parts[1] ? { page: "room", areaId: parts[1] } : { page: "rooms" };
    case "categories":
      return { page: "categories" };
    case "category":
      return parts[1] ? { page: "category", category: parts[1] } : { page: "categories" };
    case "settings":
      return { page: "settings" };
    case "page":
      return parts[1] ? { page: "page", pageId: parts[1] } : { page: "home" };
    default:
      return { page: "home" };
  }
}

export function routePath(route: PageRoute): string {
  switch (route.page) {
    case "home":
      return "";
    case "room":
      return `/room/${encodeURIComponent(route.areaId)}`;
    case "category":
      return `/category/${encodeURIComponent(route.category)}`;
    case "page":
      return `/page/${encodeURIComponent(route.pageId)}`;
    default:
      return `/${route.page}`;
  }
}

/** Navigate inside Home Assistant's frontend, like its own links do. */
export function navigate(prefix: string, route: PageRoute): void {
  const url = `${prefix}${routePath(route)}`;
  if (location.pathname === url) return;
  history.pushState(null, "", url);
  window.dispatchEvent(new CustomEvent("location-changed", { detail: { replace: false } }));
}

/** Which bottom-navigation entry a page belongs to. */
export function navSection(route: PageRoute): "home" | "rooms" | "categories" | "settings" {
  switch (route.page) {
    case "room":
    case "rooms":
      return "rooms";
    case "category":
    case "categories":
      return "categories";
    case "settings":
      return "settings";
    default:
      return "home";
  }
}
