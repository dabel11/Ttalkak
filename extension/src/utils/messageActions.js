import { isExecutableMessage } from "../../../shared/make-message-model.js";
import { getExecutablePrompt } from "./conversationMessages.js";

export function getMessageActionVisibility(message) {
  const isAssistant = message?.role === "assistant";
  // The existing Copy and Execute buttons must agree with the same central
  // executable policy as their click handlers. Keep the explicit prompt check.
  const hasExecutablePrompt = isExecutableMessage(message) && Boolean(getExecutablePrompt(message));
  const enabled = isAssistant && !message?.isError && !message?.isCancelled && !message?.isUnchanged;
  return {
    copy: enabled && hasExecutablePrompt,
    save: enabled,
    execute: enabled && hasExecutablePrompt,
  };
}
