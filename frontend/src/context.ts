// What every page and module gets from the panel. Replaced as a whole when
// language, layout or screen size change, so components can compare by identity.

import type { EntityStore } from "./data/entity-store";
import type { Translate } from "./i18n";
import type { PageRoute } from "./router";

export interface PanelContext {
  store: EntityStore;
  t: Translate;
  locale: string;
  narrow: boolean;
  isAdmin: boolean;
  /** Shared layout settings (admin overrides of the automatic layout). */
  layout: Record<string, unknown>;
  navigate: (route: PageRoute) => void;
}
