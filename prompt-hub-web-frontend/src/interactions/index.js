// @ts-check
import "./prompt-engagement-controller.js";
import "./prompt-engagement-events.js";
import "./comment-model.js";
import "./comment-view.js";
import "./prompt-workflows.js";

export const interactions = Object.freeze({ engagement: window.TtalkakPromptEngagementController, events: window.TtalkakPromptEngagementEvents, comments: window.TtalkakCommentModel, commentView: window.TtalkakCommentView, workflows: window.TtalkakPromptWorkflows });
