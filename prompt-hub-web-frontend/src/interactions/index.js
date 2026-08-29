// @ts-check
import * as engagement from "./prompt-engagement-controller.mjs";
import * as events from "./prompt-engagement-events.mjs";
import * as comments from "./comment-model.mjs";
import * as commentView from "./comment-view.mjs";
import * as workflows from "./prompt-workflows.mjs";

export const interactions = Object.freeze({ engagement, events, commentModel: comments, commentView, workflows });
