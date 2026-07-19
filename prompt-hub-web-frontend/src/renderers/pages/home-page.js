(function attachHomePageRenderer(global) {
  "use strict";

  function HomePageView(ctx, data) {
    const {
      icons,
      state,
      escapeAttr,
      escapeHtml,
      normalizeTag,
      SearchScopeOption,
      SortOption,
      PromptCard,
      Pagination,
    } = ctx;
    const {
      displayTags,
      searchCriteria,
      totalPages,
      currentPage,
      pagePrompts,
      isSearching,
      searchPlaceholder,
      canShowDemoFallback,
    } = data;

    return `
      <section class="home-page" aria-labelledby="popular-heading">
        <label class="search-field">
          <span>${icons.search}</span>
          <span class="search-scope-select">
            <select data-search-scope aria-label="검색 대상">
              ${SearchScopeOption("all", "전체")}
              ${SearchScopeOption("tag", "해시태그")}
              ${SearchScopeOption("keyword", "키워드")}
              ${SearchScopeOption("author", "작성자")}
            </select>
          </span>
          <input type="search" data-tag-search value="${escapeAttr(state.searchQuery)}" placeholder="${escapeAttr(searchPlaceholder)}" aria-label="프롬프트 검색" />
          <button class="search-help expand-left ${state.searchTipVisible ? "show-tip" : ""}" type="button" data-search-help aria-label="검색 도움말">
            <span>${icons.bulb}</span>
            <span class="help-text">쉼표로 여러 검색어를 함께 찾습니다.</span>
          </button>
        </label>
        <div class="popular-tags" aria-label="인기 태그">
          ${displayTags.map((tag) => `<button class="${searchCriteria.tagTokens.includes(normalizeTag(tag)) ? "active" : ""}" type="button" data-popular-tag="${escapeAttr(tag)}">#${escapeHtml(tag)}</button>`).join("")}
        </div>
        <div class="section-title">
          <div class="section-title-main">
            <span class="section-icon">↗</span>
            <h1 id="popular-heading">${isSearching ? "검색 결과" : "인기 프롬프트"}</h1>
          </div>
          <label class="sort-select">
            <span class="sr-only">정렬</span>
            <select data-popular-sort aria-label="프롬프트 정렬 기준">
              ${SortOption("popular", "인기")}
              ${SortOption("saves", "저장")}
              ${SortOption("comments", "댓글")}
              ${SortOption("likes", "좋아요")}
              ${SortOption("latest", "최신")}
            </select>
          </label>
        </div>
        ${
          pagePrompts.length
            ? `<div class="prompt-grid" aria-label="인기 프롬프트 목록">${pagePrompts.map((prompt) => PromptCard(prompt, { showStatus: false })).join("")}</div>
               ${Pagination(totalPages, currentPage)}`
            : state.backendStatus === "fallback" && !canShowDemoFallback
              ? `<div class="empty-state search-empty">
                  <span>${icons.search}</span>
                  <p>서버 데이터를 불러오지 못했습니다. 백엔드 연결과 Network 응답을 확인해주세요.</p>
                </div>`
              : `<div class="empty-state search-empty">
                  <span>${icons.search}</span>
                  <p>일치하는 프롬프트가 없습니다.</p>
                </div>`
        }
      </section>
    `;
  }

  global.TtalkakRenderers = Object.freeze({
    ...(global.TtalkakRenderers || {}),
    HomePageView,
  });
})(window);
