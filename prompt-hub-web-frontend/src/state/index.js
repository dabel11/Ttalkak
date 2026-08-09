// @ts-check
import "./state-persistence.js";
import "./state-core.js";
import "./state-interaction.js";
import "./state-prompt.js";
import "./state-admin.js";
import "./state-make.js";
import "./app-state.js";

/** @type {TtalkakStateModule} */
export const state = window.TtalkakState;
export const domains = Object.freeze({ ...(window.TtalkakStateDomains || {}) });
