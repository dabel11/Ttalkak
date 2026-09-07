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
        ${state.backendRecoveryNotice ? `<p class="backend-recovery-notice" role="status">${escapeHtml(state.backendRecoveryNotice)}</p>` : ""}
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
          <button class="search-help ${state.searchTipVisible ? "show-tip" : ""}" type="button" data-search-help aria-label="검색 도움말">
            <span>${icons.bulb}</span>
            <span class="help-text">쉼표로 여러 검색어를 함께 찾습니다.</span>
          </button>
        </label>
        <div class="popular-tags" role="group" aria-label="인기 태그">
          ${displayTags.map((tag) => `<button class="${searchCriteria.tagTokens.includes(normalizeTag(tag)) ? "active" : ""}" type="button" data-popular-tag="${escapeAttr(tag)}">#${escapeHtml(tag)}</button>`).join("")}
        </div>
        <div class="section-title">
          <div class="section-title-main">
            <h1 id="popular-heading">${isSearching ? "검색 결과" : "인기 프롬프트"}</h1>
          </div>
          <label class="sort-select">
            <span aria-hidden="true">정렬</span>
            <select data-popular-sort aria-label="프롬프트 정렬 기준">
              ${SortOption("popular", "인기순")}
              ${SortOption("saves", "저장순")}
              ${SortOption("comments", "댓글순")}
              ${SortOption("likes", "좋아요순")}
              ${SortOption("latest", "최신순")}
            </select>
          </label>
        </div>
        ${
          pagePrompts.length
            ? `<div class="prompt-grid" aria-label="인기 프롬프트 목록">${pagePrompts.map((prompt) => PromptCard(prompt, { showStatus: false })).join("")}</div>
               ${Pagination(totalPages, currentPage)}`
            : state.backendStatus === "checking"
              ? `<div class="empty-state content-empty-state search-empty search-checking" role="status" aria-live="polite" aria-busy="true">
                  <span class="empty-state-icon">${icons.search}</span>
                  <h2>프롬프트를 확인하고 있습니다</h2>
                  <p>서버 연결 상태를 확인한 뒤 목록을 자동으로 표시합니다.</p>
                </div>`
              : state.backendStatus === "fallback" && !canShowDemoFallback
              ? `<div class="empty-state content-empty-state search-empty search-error" role="alert">
                  <span class="empty-state-icon">${icons.search}</span>
                  <h2>프롬프트를 불러오지 못했습니다</h2>
                  <p>연결을 확인한 뒤 다시 시도해 주세요. 연결이 복구되면 목록을 자동으로 갱신합니다.</p>
                  <button type="button" data-retry-home-load>다시 불러오기</button>
                </div>`
              : `<div class="empty-state content-empty-state search-empty">
                  <span class="empty-state-icon">${icons.search}</span>
                  <h2>${isSearching ? "검색 결과가 없습니다" : "아직 표시할 프롬프트가 없습니다"}</h2>
                  <p>${isSearching ? "검색어나 검색 대상을 바꿔보세요." : "새로운 프롬프트가 등록되면 이곳에 표시됩니다."}</p>
                </div>`
        }
      </section>
    `;
  }

  const renderers = Object.freeze({
    HomePageView,
  });
export { renderers };
