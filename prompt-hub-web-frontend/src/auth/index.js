// @ts-check
import "./auth-session.js";
import "./auth-validation.js";
import "./auth-controller.js";
import "./auth-events.js";
import "./auth-view.js";

export const auth = Object.freeze({ session: window.TtalkakAuthSession, validation: window.TtalkakAuthValidation, controller: window.TtalkakAuthController, events: window.TtalkakAuthEvents, view: window.TtalkakAuthView });
