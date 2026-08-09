import { utils } from "./utils/index.js";
import { home } from "./home/index.js";
import { createSavedLibraryController } from "./saved/index.js";
import { createDiscoveryController } from "./discovery/index.js";
import { interactions } from "./interactions/index.js";
import { share } from "./share/index.js";
import { modal } from "./modal/index.js";
import { auth } from "./auth/index.js";
import { admin } from "./admin/index.js";
import { bootstrap } from "./bootstrap/index.js";
import { make } from "./make/index.js";
import "./demo-data.js";
import { api, apiContract } from "./api/index.js";
import { components } from "./ui/index.js";
import { events } from "./events/index.js";
import { effects } from "./effects/index.js";
import { state, domains } from "./state/index.js";
import { renderers } from "./renderers/index.js";
import { routing } from "./routing/index.js";

window.TtalkakModules = Object.freeze({ admin, api, apiContract, auth, bootstrap, components, discovery: { createDiscoveryController }, effects, events, home, interactions, make, modal, renderers, routing, saved: { createSavedLibraryController }, share, state: { api: state, domains }, utils });
await import("./app.js");

export { admin, api, apiContract, auth, bootstrap, components, createDiscoveryController, createSavedLibraryController, domains, effects, events, home, interactions, make, modal, renderers, routing, share, state, utils };
