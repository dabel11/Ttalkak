import { isExecutableMessage } from "../../../shared/make-message-model.js";

export function getMessageActionVisibility(message) {
  const isAssistant = message?.role === "assistant";
  const isAsk = message?.mode === "ask";
  const enabled = isAssistant && !message?.isError && !message?.isCancelled && !message?.isUnchanged;
  return {
    copy: enabled && !isAsk,
    save: enabled,
    execute: enabled && isExecutableMessage(message),
  };
}
