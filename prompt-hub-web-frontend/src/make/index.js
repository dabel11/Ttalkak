// @ts-check
import "../utils/make-preview.js";
import "../utils/make-message-model.js";
import "./make-state.js";
import "./make-controller.js";
import "./make-focus.js";
import "./make-persistence.js";
import "./make-events.js";
import "./make-sync-workflows.js";
import "./make-folder-workflows.js";
import "./make-execution-workflows.js";
import "./make-recent-workflows.js";
import "./make-workflows.js";

export const make = Object.freeze({ preview: window.TtalkakMakePreview, messageModel: window.TtalkakMakeMessageModel, state: window.TtalkakMakeState, controller: window.TtalkakMakeController, focus: window.TtalkakMakeFocus, persistence: window.TtalkakMakePersistence, events: window.TtalkakMakeEvents, workflows: window.TtalkakMakeWorkflows });
