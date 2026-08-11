(function () {
  const API_BASE_URL = window.__API_BASE_URL__ || window.TTALKAK_API_BASE_URL || "http://localhost:8080";
  // The backend may spend up to 75 seconds waiting for RAG. Keep a margin for
  // request transit and response serialization so the browser does not abort first.
  const API_TIMEOUT_MS = Number(window.TTALKAK_API_TIMEOUT_MS || 90000);

  function buildUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return `${API_BASE_URL}${path}`;
  }

  /** @param {string} path @param {RequestInit & { token?: string }} [options] */
  async function request(path, options = {}) {
    const { token, headers, ...fetchOptions } = options;
    const storedToken = (() => {
      try {
        return window.localStorage?.getItem("ttalkak_access_token") || "";
      } catch (_error) {
        return "";
      }
    })();
    const resolvedToken = token || storedToken;
    const defaultHeaders = fetchOptions.body ? { "Content-Type": "application/json" } : {};
    const controller = new AbortController();
    const externalSignal = fetchOptions.signal;
    let abortCause = "";
    const abortFromExternalSignal = () => {
      if (controller.signal.aborted) return;
      abortCause = "external";
      controller.abort(externalSignal?.reason);
    };
    if (externalSignal?.aborted) abortFromExternalSignal();
    else externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });
    const timeoutId = window.setTimeout(() => {
      if (controller.signal.aborted) return;
      abortCause = "timeout";
      controller.abort();
    }, API_TIMEOUT_MS);

    try {
      const response = await fetch(buildUrl(path), {
        ...fetchOptions,
        signal: controller.signal,
        headers: {
          ...defaultHeaders,
          ...(resolvedToken ? { Authorization: `Bearer ${resolvedToken}` } : {}),
          ...(headers || {}),
        },
      });

      if (!response.ok) {
        const error = Object.assign(new Error(`API request failed: ${response.status} ${response.statusText}`), { status: response.status, payload: null });
        try {
          error.payload = await response.json();
        } catch (_error) {
          error.payload = null;
        }
        throw error;
      }

      if (response.status === 204) return null;
      const text = await response.text();
      return text ? JSON.parse(text) : null;
    } catch (error) {
      if (error?.name === "AbortError" && abortCause === "timeout") {
        const timeoutError = Object.assign(new Error("백엔드 응답 시간이 초과되었습니다. 잠시 후 다시 시도해주세요."), { status: 0, code: "REQUEST_TIMEOUT", cause: error });
        throw timeoutError;
      }
      if (error?.name === "AbortError") {
        throw Object.assign(new Error("요청이 취소되었습니다."), { status: 0, code: "REQUEST_ABORTED", cause: error });
      }
      throw error;
    } finally {
      window.clearTimeout(timeoutId);
      externalSignal?.removeEventListener("abort", abortFromExternalSignal);
    }
  }

  function unwrapItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.content)) return payload.content;
    if (Array.isArray(payload?.result)) return payload.result;
    if (payload?.data && typeof payload.data === "object") {
      if (Array.isArray(payload.data.items)) return payload.data.items;
      if (Array.isArray(payload.data.content)) return payload.data.content;
    }
    return [];
  }

  function unwrapPageMeta(payload) {
    const root = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
    const source = root.data && typeof root.data === "object" && !Array.isArray(root.data) ? root.data : root;
    const page = source.page && typeof source.page === "object" ? source.page : {};
    const totalPages = source.totalPages ?? source.total_pages ?? page.totalPages ?? page.total_pages;
    const totalElements =
      source.totalElements ??
      source.total_elements ??
      source.total ??
      source.totalCount ??
      page.totalElements ??
      page.total_elements;
    const pageNumber = source.pageNumber ?? source.currentPage ?? page.number ?? page.pageNumber ?? (typeof source.page === "number" ? source.page : undefined);
    const pageSize = source.size ?? source.pageSize ?? page.size ?? page.pageSize;
    const meta = {};

    if (pageNumber !== undefined) meta.page = pageNumber;
    if (pageSize !== undefined) meta.size = pageSize;
    if (totalPages !== undefined) meta.totalPages = totalPages;
    if (totalElements !== undefined) meta.totalElements = totalElements;

    return meta;
  }

  window.TTALKAK_API_CORE = {
    request,
    unwrapItems,
    unwrapPageMeta,
  };
})();
