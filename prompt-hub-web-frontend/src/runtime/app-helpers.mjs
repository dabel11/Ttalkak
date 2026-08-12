// @ts-check
/** @param {unknown} text @param {number} [maxLength] */
export function truncateText(text, maxLength = 80) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return clean.length > maxLength ? `${clean.slice(0, maxLength)}...` : clean;
}
/** @param {HTMLTextAreaElement} textarea */
export function autosizeTextarea(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
}
/** @param {TtalkakStateEntity[]} list @param {TtalkakStateEntity} prompt */
export function upsertPrompt(list, prompt) {
  const index = list.findIndex((item) => item.id === prompt.id);
  if (index >= 0) list[index] = { ...list[index], ...prompt };
  else list.unshift(prompt);
}
/** @param {unknown} value */
export function parseSharedTags(value) {
  return String(value || "").split(/[,\s]+/).map((tag) => tag.replace(/^#+/, "").trim()).filter(Boolean);
}
