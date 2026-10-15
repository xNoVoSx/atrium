// Entry point: registers Atrium's custom elements.

import { AtriumPanel } from "./atrium-panel";
import { AtriumClimateBody } from "./components/climate-body";
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
import { AtriumRoomPage } from "./pages/room-page";
import {
  AtriumCategoriesPage,
  AtriumCategoryPage,
  AtriumRoomsPage,
  AtriumSettingsPage,
} from "./pages/simple-pages";

export const ELEMENTS: Array<[string, CustomElementConstructor]> = [
  ["atrium-light-tile", AtriumLightTile],
  ["atrium-entity-tile", AtriumEntityTile],
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
  ["atrium-home-page", AtriumHomePage],
  ["atrium-rooms-page", AtriumRoomsPage],
  ["atrium-room-page", AtriumRoomPage],
  ["atrium-categories-page", AtriumCategoriesPage],
  ["atrium-category-page", AtriumCategoryPage],
  ["atrium-settings-page", AtriumSettingsPage],
  ["atrium-panel", AtriumPanel],
];

// A new module URL (?v=) can load this file a second time in the same page.
for (const [name, ctor] of ELEMENTS) {
  if (!customElements.get(name)) customElements.define(name, ctor);
}
