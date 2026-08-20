// @ts-check
import * as session from "./auth-session.mjs";
import * as validation from "./auth-validation.mjs";
import * as controller from "./auth-controller.mjs";
import * as events from "./auth-events.mjs";
import * as view from "./auth-view.mjs";

export const auth = Object.freeze({ session, validation, controller, events, view });
