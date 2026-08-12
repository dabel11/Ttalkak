// @ts-check
import "./make-controller.js";
import "./make-events.js";
import { createMakeWorkflows } from "./make-workflows.mjs";
import { createMakePageAdapter } from "./make-page-adapter.mjs";

export const workflows = Object.freeze({ createMakeWorkflows });
export const pageAdapter = Object.freeze({ createMakePageAdapter });
