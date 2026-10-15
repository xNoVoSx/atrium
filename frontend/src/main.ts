// Entry point: registers Atrium's custom elements.

import { AtriumPanel } from "./atrium-panel";
import { AtriumLightControl } from "./components/light-control";
import { AtriumLightTile } from "./components/light-tile";
import { AtriumHomePage } from "./pages/home-page";

const elements: Array<[string, CustomElementConstructor]> = [
  ["atrium-light-tile", AtriumLightTile],
  ["atrium-light-control", AtriumLightControl],
  ["atrium-home-page", AtriumHomePage],
  ["atrium-panel", AtriumPanel],
];

// A new module URL (?v=) can load this file a second time in the same page.
for (const [name, ctor] of elements) {
  if (!customElements.get(name)) customElements.define(name, ctor);
}
