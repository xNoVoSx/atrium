// Entry point: registers Atrium's custom elements.

import { AtriumPanel } from "./atrium-panel";
import { AtriumClimateBody } from "./components/climate-body";
import { AtriumEntityList } from "./components/entity-list";
import { AtriumEntityTile } from "./components/entity-tile";
import { AtriumLightBody } from "./components/light-body";
import { AtriumSheet } from "./components/sheet";
import { AtriumLightTile } from "./components/light-tile";
import { AtriumClimateModule } from "./modules/climate-module";
import { AtriumHeaderModule } from "./modules/header-module";
import { AtriumLightsModule } from "./modules/lights-module";
import { AtriumRoomsModule } from "./modules/rooms-module";
import { AtriumScenesModule } from "./modules/scenes-module";
import { AtriumSolarModule } from "./modules/solar-module";
import { AtriumStatusModule } from "./modules/status-module";
import { AtriumWasteModule } from "./modules/waste-module";
import { AtriumEnergyPage } from "./pages/energy-page";
import { AtriumEnergySettings } from "./pages/energy-settings";
import { AtriumHomePage } from "./pages/home-page";
import { AtriumMediaPage, AtriumSecurityPage } from "./pages/security-media";
import { AtriumCameraTile } from "./components/camera-tile";
import { AtriumMediaCard } from "./components/media-card";
import { AtriumRoomPage } from "./pages/room-page";
import { AtriumWidgetPage } from "./pages/widget-page";
import { AtriumSearch } from "./components/search";
import { AtriumEnergyFlow } from "./components/energy-flow";
import { AtriumScreensaver } from "./components/screensaver";
import {
  AtriumHomeSettings,
  AtriumNavSettings,
  AtriumPagesSettings,
  AtriumUsersSettings,
} from "./pages/settings-sections";
import { AtriumWidgetEditor } from "./components/widget-editor";
import { AtriumWidgetPicker } from "./components/widget-picker";
import { AtriumDataWidget } from "./widgets/elements/data-widget";
import { AtriumActivityWidget, AtriumEnergyFlowWidget, AtriumRoomCardWidget } from "./widgets/elements/more";
import {
  AtriumCamerasWidget,
  AtriumEntitiesWidget,
  AtriumGaugeWidget,
  AtriumGraphWidget,
  AtriumLinksWidget,
  AtriumMediaWidget,
  AtriumNoteWidget,
  AtriumWebWidget,
} from "./widgets/elements/generic";
import {
  AtriumAlarmWidget,
  AtriumAppliancesWidget,
  AtriumCoversWidget,
  AtriumFansWidget,
  AtriumLocksWidget,
  AtriumScriptsWidget,
  AtriumSwitchesWidget,
  AtriumTimersWidget,
  AtriumVacuumWidget,
} from "./widgets/elements/house";
import {
  AtriumCalendarWidget,
  AtriumClockWidget,
  AtriumNotificationsWidget,
  AtriumPersonsWidget,
  AtriumSunWidget,
  AtriumTodoWidget,
  AtriumWeatherWidget,
} from "./widgets/elements/info";
import {
  AtriumCategoriesPage,
  AtriumCategoryPage,
  AtriumRoomsPage,
  AtriumSettingsPage,
} from "./pages/simple-pages";

export const ELEMENTS: Array<[string, CustomElementConstructor]> = [
  ["atrium-light-tile", AtriumLightTile],
  ["atrium-entity-tile", AtriumEntityTile],
  ["atrium-entity-list", AtriumEntityList],
  ["atrium-sheet", AtriumSheet],
  ["atrium-light-body", AtriumLightBody],
  ["atrium-climate-body", AtriumClimateBody],
  ["atrium-header-module", AtriumHeaderModule],
  ["atrium-status-module", AtriumStatusModule],
  ["atrium-climate-module", AtriumClimateModule],
  ["atrium-lights-module", AtriumLightsModule],
  ["atrium-scenes-module", AtriumScenesModule],
  ["atrium-waste-module", AtriumWasteModule],
  ["atrium-rooms-module", AtriumRoomsModule],
  ["atrium-energy-page", AtriumEnergyPage],
  ["atrium-energy-settings", AtriumEnergySettings],
  ["atrium-solar-module", AtriumSolarModule],
  ["atrium-camera-tile", AtriumCameraTile],
  ["atrium-media-card", AtriumMediaCard],
  ["atrium-security-page", AtriumSecurityPage],
  ["atrium-media-page", AtriumMediaPage],
  ["atrium-home-page", AtriumHomePage],
  ["atrium-rooms-page", AtriumRoomsPage],
  ["atrium-room-page", AtriumRoomPage],
  ["atrium-categories-page", AtriumCategoriesPage],
  ["atrium-category-page", AtriumCategoryPage],
  ["atrium-settings-page", AtriumSettingsPage],
  ["atrium-widget-page", AtriumWidgetPage],
  ["atrium-search", AtriumSearch],
  ["atrium-energy-flow", AtriumEnergyFlow],
  ["atrium-screensaver", AtriumScreensaver],
  ["atrium-home-settings", AtriumHomeSettings],
  ["atrium-nav-settings", AtriumNavSettings],
  ["atrium-pages-settings", AtriumPagesSettings],
  ["atrium-users-settings", AtriumUsersSettings],
  ["atrium-widget-editor", AtriumWidgetEditor],
  ["atrium-widget-picker", AtriumWidgetPicker],
  ["atrium-data-widget", AtriumDataWidget],
  ["atrium-activity-widget", AtriumActivityWidget],
  ["atrium-room-card-widget", AtriumRoomCardWidget],
  ["atrium-energy-flow-widget", AtriumEnergyFlowWidget],
  ["atrium-entities-widget", AtriumEntitiesWidget],
  ["atrium-graph-widget", AtriumGraphWidget],
  ["atrium-gauge-widget", AtriumGaugeWidget],
  ["atrium-note-widget", AtriumNoteWidget],
  ["atrium-links-widget", AtriumLinksWidget],
  ["atrium-web-widget", AtriumWebWidget],
  ["atrium-cameras-widget", AtriumCamerasWidget],
  ["atrium-media-widget", AtriumMediaWidget],
  ["atrium-covers-widget", AtriumCoversWidget],
  ["atrium-fans-widget", AtriumFansWidget],
  ["atrium-vacuum-widget", AtriumVacuumWidget],
  ["atrium-locks-widget", AtriumLocksWidget],
  ["atrium-alarm-widget", AtriumAlarmWidget],
  ["atrium-appliances-widget", AtriumAppliancesWidget],
  ["atrium-timers-widget", AtriumTimersWidget],
  ["atrium-switches-widget", AtriumSwitchesWidget],
  ["atrium-scripts-widget", AtriumScriptsWidget],
  ["atrium-weather-widget", AtriumWeatherWidget],
  ["atrium-calendar-widget", AtriumCalendarWidget],
  ["atrium-todo-widget", AtriumTodoWidget],
  ["atrium-persons-widget", AtriumPersonsWidget],
  ["atrium-clock-widget", AtriumClockWidget],
  ["atrium-sun-widget", AtriumSunWidget],
  ["atrium-notifications-widget", AtriumNotificationsWidget],
  ["atrium-panel", AtriumPanel],
];

// A new module URL (?v=) can load this file a second time in the same page.
for (const [name, ctor] of ELEMENTS) {
  if (!customElements.get(name)) customElements.define(name, ctor);
}
