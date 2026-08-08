export function getMessageActionVisibility(message, hasExecutable = Boolean(String(message?.executablePrompt || "").trim())) {
  const isAssistant = message?.role === "assistant";
  const isAsk = message?.mode === "ask";
  const enabled = isAssistant && !message?.isError;
  return {
    copy: enabled && !isAsk,
    save: enabled,
    execute: enabled && hasExecutable && !isAsk,
  };
}
