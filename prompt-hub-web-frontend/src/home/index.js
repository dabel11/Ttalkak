// @ts-check
import { HomeSearchModel as model } from "./home-search-model.mjs";
import * as controller from "./home-controller.mjs";
import * as events from "./home-events.mjs";
import * as backendStatus from "./backend-status.mjs";

export const home = Object.freeze({ backendStatus, model, controller, events });
