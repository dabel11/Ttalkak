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
import { startApp } from "./app.js";
import { clientErrorReporter, installGlobalErrorObservers } from "./observability/index.js";

installGlobalErrorObservers(window, clientErrorReporter);
const modules = Object.freeze({ admin, api, apiContract, auth, bootstrap, components, discovery: { createDiscoveryController }, effects, events, home, interactions, make, modal, observability: clientErrorReporter, renderers, routing, saved: { createSavedLibraryController }, share, state: { api: state, domains }, utils });
startApp(modules);

export { admin, api, apiContract, auth, bootstrap, clientErrorReporter, components, createDiscoveryController, createSavedLibraryController, domains, effects, events, home, interactions, make, modal, renderers, routing, share, startApp, state, utils };
