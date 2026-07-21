(function () {
  const core = window.TTALKAK_API_CORE;
  const normalizers = window.TTALKAK_API_NORMALIZERS;

  if (!core || !normalizers) {
    throw new Error("TTALKAK API core modules are not loaded. Check index.html script order.");
  }

  const context = {
    request: core.request,
    unwrapItems: core.unwrapItems,
    unwrapPageMeta: core.unwrapPageMeta,
    normalizers,
  };

  const api = {
    request: core.request,
    normalizePrompt: normalizers.normalizePrompt,
    ...window.TTALKAK_AUTH_API(context),
    ...window.TTALKAK_PROMPT_API(context),
    ...window.TTALKAK_COMMENT_API(context),
    ...window.TTALKAK_MYPAGE_API(context),
    ...window.TTALKAK_MAKE_API(context),
    ...window.TTALKAK_ADMIN_API(context),
  };

  window.TTALKAK_API = api;
})();
