// @ts-check
import * as controller from "./make-controller.mjs";
import * as events from "./make-events.mjs";
import { createMakeWorkflows } from "./make-workflows.mjs";
import { createMakePageAdapter } from "./make-page-adapter.mjs";

export const workflows = Object.freeze({ createMakeWorkflows });
export const pageAdapter = Object.freeze({ createMakePageAdapter });
export { controller, events };
