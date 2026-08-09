// @ts-check
import "./admin-events.js";
import "./admin-selectors.js";
import "./admin-controller.js";
import "./admin-view.js";

export const admin = Object.freeze({ events: window.TtalkakAdminEvents, selectors: window.TtalkakAdminSelectors, controller: window.TtalkakAdminController, view: window.TtalkakAdminView });
