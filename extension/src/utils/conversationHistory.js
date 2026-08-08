export function buildImproveHistory(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .filter((message) => message && !message.isError && !message.excludeFromHistory)
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: String(message.role === "assistant" ? message.answer || message.content || "" : message.content || "").trim(),
    }))
    .filter((message) => message.content);
}
