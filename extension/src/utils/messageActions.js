import { getExecutablePrompt } from "./conversationMessages.js";

export function getMessageActionVisibility(message) {
  const isAssistant = message?.role === "assistant";
  const hasExecutablePrompt = Boolean(getExecutablePrompt(message));
  const enabled = isAssistant && !message?.isError && !message?.isCancelled && !message?.isUnchanged;
  return {
    copy: enabled && hasExecutablePrompt,
    save: enabled,
    execute: enabled && hasExecutablePrompt,
  };
}
