// The parts of the frontend's `hass` object that Atrium uses.
// Home Assistant does not publish these types; they mirror the frontend source.

import type {
  Connection,
  HassConfig,
  HassEntities,
  HassEntity,
  MessageBase,
} from "home-assistant-js-websocket";

export type { HassEntity };

/**
 * One entry of `hass.entities`. Browsers get the compact "display" form
 * (`hidden: true`); the Companion app was seen delivering full registry
 * entries instead (`hidden_by`, `disabled_by`). Both must be understood.
 */
export interface EntityRegistryDisplayEntry {
  entity_id: string;
  hidden_by?: string | null;
  disabled_by?: string | null;
  name?: string | null;
  icon?: string;
  device_id?: string;
  area_id?: string;
  labels: string[];
  hidden?: boolean;
  entity_category?: "config" | "diagnostic";
  translation_key?: string;
  platform?: string;
  has_entity_name?: boolean;
}

export interface DeviceRegistryEntry {
  id: string;
  name: string | null;
  name_by_user: string | null;
  area_id: string | null;
}

export interface AreaRegistryEntry {
  area_id: string;
  name: string;
  floor_id?: string | null;
  icon?: string | null;
}

export interface CurrentUser {
  id: string;
  name: string;
  is_admin: boolean;
  is_owner: boolean;
}

export interface HomeAssistant {
  connection: Connection;
  states: HassEntities;
  entities: Record<string, EntityRegistryDisplayEntry>;
  devices: Record<string, DeviceRegistryEntry>;
  areas: Record<string, AreaRegistryEntry>;
  user?: CurrentUser;
  themes: { darkMode: boolean };
  language: string;
  config: HassConfig;
  auth: { external?: unknown };
  callService(
    domain: string,
    service: string,
    serviceData?: Record<string, unknown>,
    target?: Record<string, unknown>,
  ): Promise<unknown>;
  callWS<T>(msg: MessageBase): Promise<T>;
}

export interface PanelInfo {
  component_name: string;
  url_path: string;
  title: string | null;
  config: Record<string, unknown> | null;
}

export interface Route {
  prefix: string;
  path: string;
}
