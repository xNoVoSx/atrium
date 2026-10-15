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
  /** The current user's own settings (favourites). */
  user: Record<string, unknown>;
  /** Edit mode: tiles show star/hide, can be dragged, do not switch. */
  editing: boolean;
  /** Entities hidden in Atrium (shown dimmed in edit mode). */
  hiddenEntities: Set<string>;
  navigate: (route: PageRoute) => void;
  /** Save shared layout (admins); the change comes back through the subscription. */
  saveLayout: (layout: object) => void;
  /** Save the user's own settings. */
  saveUser: (settings: object) => void;
}
