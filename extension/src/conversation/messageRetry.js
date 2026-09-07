// @ts-check
import { buildImproveHistory } from "../utils/conversationHistory.js";
export function createGuestRetryContext(messages, messageId, prompt) {
  const index = messages.findIndex((message) => message.id === messageId && message.role === "user");
  if (index < 0 || !prompt) return null;
  const baseMessages = messages.slice(0, index);
  return { baseMessages, editedUserMessage: { ...messages[index], content: prompt, editedAt: new Date().toISOString() }, history: buildImproveHistory(baseMessages) };
}
