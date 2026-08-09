(function attachHomeSearchModel(global) {
  "use strict";

  const VALID_SEARCH_SCOPES = new Set(["all", "tag", "keyword", "author"]);

  function getValidSearchScope(scope) {
    return VALID_SEARCH_SCOPES.has(scope) ? scope : "all";
  }

  function parsePromptSearchQuery(query, scope = "all", normalizers = {}) {
    const normalizeTag = normalizers.normalizeTag || ((value) => String(value || "").toLowerCase());
    const normalizeText = normalizers.normalizeText || ((value) => String(value || "").toLowerCase());
    const searchScope = getValidSearchScope(scope);
    const criteria = { tagTokens: [], keywordTokens: [], authorTokens: [], allTokens: [] };

    String(query || "")
      .split(/[,\s]+/)
      .map((token) => token.trim())
      .filter(Boolean)
      .forEach((token) => {
        if (searchScope === "tag" || token.startsWith("#")) {
          const tag = normalizeTag(token);
          if (tag) criteria.tagTokens.push(tag);
          return;
        }

        const normalized = normalizeText(token);
        if (!normalized) return;
        if (searchScope === "keyword") criteria.keywordTokens.push(normalized);
        else if (searchScope === "author") criteria.authorTokens.push(normalized);
        else criteria.allTokens.push(normalized);
      });

    return criteria;
  }

  function hasPromptSearchCriteria(criteria = {}) {
    return [criteria.tagTokens, criteria.keywordTokens, criteria.authorTokens, criteria.allTokens]
      .some((tokens) => Array.isArray(tokens) && tokens.length > 0);
  }

  function uniquePrompts(prompts = []) {
    const seen = new Set();
    return prompts.filter((prompt) => {
      const key = prompt.id || `${prompt.title}-${prompt.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function filterPrompts(prompts, criteria, options = {}) {
    const normalizeTag = options.normalizeTag || ((value) => String(value || "").toLowerCase());
    const normalizeText = options.normalizeText || ((value) => String(value || "").toLowerCase());
    const getAuthor = options.getAuthor || ((prompt) => prompt.author || "");

    if (!hasPromptSearchCriteria(criteria)) return [...prompts];
    return prompts.filter((prompt) => {
      const tags = Array.isArray(prompt.tags) ? prompt.tags : [];
      if (criteria.tagTokens?.length) {
        const normalizedTags = tags.map(normalizeTag);
        if (!criteria.tagTokens.every((token) => normalizedTags.some((tag) => tag.includes(token)))) return false;
      }
      if (criteria.keywordTokens?.length) {
        const keywordHaystack = normalizeText([prompt.title, prompt.text].join(" "));
        if (!criteria.keywordTokens.every((token) => keywordHaystack.includes(token))) return false;
      }
      if (criteria.authorTokens?.length) {
        const authorHaystack = normalizeText(getAuthor(prompt));
        if (!criteria.authorTokens.every((token) => authorHaystack.includes(token))) return false;
      }
      if (criteria.allTokens?.length) {
        const allHaystack = normalizeText([prompt.title, prompt.text, getAuthor(prompt), ...tags].join(" "));
        if (!criteria.allTokens.every((token) => allHaystack.includes(token))) return false;
      }
      return true;
    });
  }

  function sortPrompts(prompts, sort = "popular", metrics = {}) {
    const metric = (name) => metrics[name] || (() => 0);
    const byViews = (a, b) => metric("views")(b) - metric("views")(a);
    const bySaves = (a, b) => metric("saves")(b) - metric("saves")(a);
    const byComments = (a, b) => metric("comments")(b) - metric("comments")(a);
    const byLikes = (a, b) => metric("likes")(b) - metric("likes")(a);
    const sorters = {
      popular: (a, b) => byViews(a, b) || byComments(a, b) || bySaves(a, b),
      saves: (a, b) => bySaves(a, b) || byViews(a, b) || byComments(a, b),
      comments: (a, b) => byComments(a, b) || byViews(a, b) || bySaves(a, b),
      likes: (a, b) => byLikes(a, b) || byViews(a, b) || bySaves(a, b),
      latest: (a, b) => metric("createdAt")(b) - metric("createdAt")(a) || byViews(a, b),
    };
    return [...prompts].sort(sorters[sort] || sorters.popular);
  }

  function selectVisiblePrompts(options = {}) {
    const prompts = uniquePrompts(options.prompts || []);
    const criteria = parsePromptSearchQuery(options.query, options.scope, options);
    const filtered = filterPrompts(prompts, criteria, options);
    return sortPrompts(filtered, options.sort, options.metrics);
  }

  function collectPopularTags(prompts = [], options = {}) {
    const normalizeTag = options.normalizeTag || ((value) => String(value || "").toLowerCase());
    const getCreatedAt = options.getCreatedAt || (() => 0);
    const isApproved = options.isApproved || (() => true);
    const limit = Number(options.limit || 8);
    const counts = new Map();
    const labels = new Map();
    const recentUsedAt = new Map();
    const createdOrder = new Map();

    prompts.forEach((prompt, promptIndex) => {
      const usedAt = new Date(getCreatedAt(prompt) || 0).getTime() || 0;
      (prompt.tags || []).forEach((tag) => {
        const label = String(tag || "").replace(/^#+/, "").trim();
        if (!label || !isApproved(label)) return;
        const key = normalizeTag(label);
        counts.set(key, (counts.get(key) || 0) + 1);
        if (!labels.has(key)) labels.set(key, label);
        if (!createdOrder.has(key)) createdOrder.set(key, promptIndex);
        recentUsedAt.set(key, Math.max(recentUsedAt.get(key) || 0, usedAt));
      });
    });

    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1]
        || (recentUsedAt.get(b[0]) || 0) - (recentUsedAt.get(a[0]) || 0)
        || (createdOrder.get(b[0]) || 0) - (createdOrder.get(a[0]) || 0))
      .slice(0, limit)
      .map(([key]) => labels.get(key))
      .filter(Boolean);
  }

  const HomeSearchModel = Object.freeze({
    collectPopularTags,
    filterPrompts,
    getValidSearchScope,
    hasPromptSearchCriteria,
    parsePromptSearchQuery,
    selectVisiblePrompts,
    sortPrompts,
    uniquePrompts,
  });

  global.TtalkakHomeSearchModel = HomeSearchModel;
  if (typeof module !== "undefined" && module.exports) module.exports = HomeSearchModel;
})(typeof window !== "undefined" ? window : globalThis);
