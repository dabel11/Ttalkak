export function getSearchPlaceholder(scope) {
  if (scope === "tag") return "해시태그를 입력하세요...";
  if (scope === "keyword") return "프롬프트 제목이나 내용을 검색하세요...";
  if (scope === "author") return "작성자 닉네임을 입력하세요...";
  return "프롬프트를 검색하세요...";
}

export const getTotalPages = (count, pageSize) => Math.max(1, Math.ceil(count / pageSize));

export function getBackendTotalPages(pageMeta) {
  const totalPages = Number(pageMeta?.totalPages);
  return Number.isFinite(totalPages) && totalPages > 0 ? Math.floor(totalPages) : 1;
}

export function normalizeBackendPageMeta(payload = {}, { fallbackPage, pageSize, itemCount }) {
  const rawPage = Number(payload.page ?? payload.currentPage ?? payload.pageNumber ?? fallbackPage);
  const rawSize = Number(payload.size ?? payload.pageSize ?? pageSize);
  const rawTotalPages = Number(payload.totalPages ?? payload.total_pages ?? payload.page?.totalPages ?? payload.page?.total_pages);
  const rawTotalElements = Number(payload.totalElements ?? payload.total_elements ?? payload.total ?? payload.totalCount ?? payload.page?.totalElements ?? payload.page?.total_elements);
  const totalPages = Number.isFinite(rawTotalPages) && rawTotalPages > 0 ? Math.floor(rawTotalPages) : 1;
  return {
    page: Math.min(Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : fallbackPage, totalPages),
    size: Number.isFinite(rawSize) && rawSize > 0 ? Math.floor(rawSize) : pageSize,
    totalPages,
    totalElements: Number.isFinite(rawTotalElements) && rawTotalElements >= 0 ? Math.floor(rawTotalElements) : itemCount,
  };
}
