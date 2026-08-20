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
/** @param {unknown} value @param {string} withdrawnLabel */
export function normalizeDisplayAuthorName(value, withdrawnLabel) {
  if (!value) return "";
  if (typeof value === "object") {
    const authorRecord = /** @type {Record<string, unknown>} */ (value);
    if (authorRecord.active === false || authorRecord.enabled === false || authorRecord.withdrawn === true) return withdrawnLabel;
    const author = String(authorRecord.nickname || authorRecord.name || authorRecord.userId || authorRecord.username || "").trim();
    return /^withdrawn_user_/i.test(author) ? withdrawnLabel : author;
  }
  const author = String(value).trim();
  return /^withdrawn_user_/i.test(author) ? withdrawnLabel : author;
}
