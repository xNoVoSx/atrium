// The widget catalogue: every block a page can hold. A definition says what a
// widget is (name, group, size), when it makes sense (integration present) and
// how to render it. Widgets that only show data get it from an adapter (hass →
// model); the same model type has demo data for previews.

import type { TemplateResult } from "lit";
import type { PanelContext } from "../context";
import type { Level } from "../data/levels";
import type { WidgetInstance, WidgetSize } from "../data/pages";
import type { MessageKey, Translate } from "../i18n";
import type { HomeAssistant } from "../types/hass";

export const WIDGET_GROUPS = [
  "overview",
  "comfort",
  "household",
  "security",
  "energy",
  "media",
  "info",
  "network",
  "server",
  "custom",
] as const;
export type WidgetGroup = (typeof WIDGET_GROUPS)[number];

export type OptionKind = "entity" | "entities" | "text" | "number" | "select" | "boolean" | "area" | "url";

export interface OptionField {
  key: string;
  label: MessageKey;
  kind: OptionKind;
  /** entity/entities: allowed domains. */
  domains?: string[];
  /** select: value and label. */
  choices?: Array<[string, MessageKey]>;
  min?: number;
  max?: number;
  /** Shown when the field is empty. */
  placeholder?: string;
}

export interface WidgetDef {
  type: string;
  group: WidgetGroup;
  /** SVG path (24×24). */
  icon: string;
  name: MessageKey;
  description: MessageKey;
  size: WidgetSize;
  /** Sizes that make sense; default all. */
  sizes?: WidgetSize[];
  /** Hidden below this level unless the instance says otherwise. */
  minLevel: Level;
  /** Integrations (platform names) this widget is built for, for the catalogue. */
  integrations?: string[];
  /** Does this house have what the widget needs? */
  available: (hass: HomeAssistant) => boolean;
  /** Has a preview with sample data (shown in the catalogue). */
  demo?: boolean;
  options?: OptionField[];
  /** Only one per page makes sense (e.g. header). */
  single?: boolean;
  render: (ctx: PanelContext, config: WidgetInstance, demo: boolean) => TemplateResult;
}

// ---- models for data widgets ----

export type Tone = "ok" | "warn" | "bad" | "off" | "info" | "active";

export interface Metric {
  label: string;
  value: string;
  unit?: string;
  /** 0–100: draws a bar. */
  pct?: number | null;
  tone?: Tone;
  entityId?: string;
}

export interface MetricGroup {
  id: string;
  name: string;
  sub?: string;
  status?: { label: string; tone: Tone };
  metrics: Metric[];
  entityId?: string;
}

export interface Toggle {
  entityId: string;
  on: boolean;
}

export interface Row {
  id: string;
  name: string;
  sub?: string;
  value?: string;
  tone?: Tone;
  entityId?: string;
  toggle?: Toggle;
  /** 0–100: thin progress bar under the row. */
  pct?: number | null;
}

export interface DataModel {
  /** Big numbers on top. */
  summary?: Metric[];
  groups?: MetricGroup[];
  rows?: Row[];
  /** Switches for the whole thing (e.g. ad blocking on/off). */
  toggles?: Array<Toggle & { label: string }>;
  /** Line under the heading. */
  note?: string;
  /** Nothing to show (yet). */
  empty?: string;
}

export interface AdapterContext {
  t: Translate;
  locale: string;
  options: Record<string, unknown>;
}

export type Adapter = (hass: HomeAssistant, ctx: AdapterContext) => DataModel | null;
