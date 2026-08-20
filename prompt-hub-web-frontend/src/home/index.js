// @ts-check
import { HomeSearchModel as model } from "./home-search-model.mjs";
import * as controller from "./home-controller.mjs";
import * as events from "./home-events.mjs";

export const home = Object.freeze({ model, controller, events });
