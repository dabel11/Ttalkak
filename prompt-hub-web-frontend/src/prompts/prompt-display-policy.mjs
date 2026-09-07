export function getPromptAuthorId(prompt) {
  return String(prompt?.authorId || prompt?.author?.id || prompt?.raw?.author?.id || prompt?.raw?.authorId || prompt?.raw?.memberId || "");
}

export function isWithdrawnAuthorName(value, withdrawnLabel) {
  return String(value || "").trim() === withdrawnLabel;
}

export function getDisplayPromptAuthor(prompt, {
  currentUser = "",
  isLoggedIn = false,
  normalizeAuthor,
  withdrawnLabel,
}) {
  const author = normalizeAuthor(prompt?.author || prompt?.authorNickname || prompt?.nickname || prompt?.raw?.author, withdrawnLabel);
  const owner = normalizeAuthor(prompt?.owner || prompt?.ownerNickname || prompt?.raw?.owner, withdrawnLabel);
  const user = String(currentUser || "").trim();
  if (isLoggedIn && user && (owner === user || author === user || author === "나")) return "나";
  if (author && author !== "나") return author;
  if (owner && owner !== "나") return owner;
  return "익명 사용자";
}

export function renderAuthorControl(prompt, {
  admin = false,
  inlineAdmin = false,
  author,
  authorId,
  withdrawn,
  escapeHtml,
  escapeAttr,
}) {
  const safeAuthor = escapeHtml(author);
  const className = inlineAdmin ? "admin-inline-author-button" : `author-search-button${admin ? " admin-author-lookup-button" : ""}`;
  if (withdrawn) return `<span class="${className} disabled-author" aria-disabled="true">${safeAuthor}</span>`;
  const dataName = admin || inlineAdmin ? "data-admin-user-author" : "data-search-author";
  const idData = admin || inlineAdmin ? ` data-admin-user-id="${escapeAttr(authorId)}"` : "";
  return `<button class="${className}" type="button" ${dataName}="${escapeAttr(author)}"${idData}>${safeAuthor}</button>`;
}
