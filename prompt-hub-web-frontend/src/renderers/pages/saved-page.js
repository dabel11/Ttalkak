(function attachSavedPageRenderer(global) {
  "use strict";

  function SavedPageView(ctx, data) {
    const { icons, state, formatNumber, DemoLibraryPrompt, MyPagePanel } = ctx;
    const { tabs } = data;

    return `
      <section class="saved-page my-page" aria-labelledby="my-page-heading">
        <div class="page-head my-page-head">
          <div class="page-title">
            <span>${icons.user}</span>
            <h1 id="my-page-heading">My page</h1>
          </div>
        </div>
        <nav class="my-page-tabs" aria-label="My page tabs">
          ${tabs
            .map(
              (tab) => `
                <button class="${state.myPageTab === tab.id ? "active" : ""}" type="button" data-my-tab="${tab.id}">
                  ${tab.label}<span>${formatNumber(tab.count)}</span>
                </button>
              `,
            )
            .join("")}
        </nav>
        ${DemoLibraryPrompt()}
        ${MyPagePanel()}
      </section>
    `;
  }

  function SavedLibraryPanelView(ctx, data) {
    const { icons, state, PromptCard, SavedPagination, SavedEmptyMessage } = ctx;
    const { filtered, pagePrompts, pendingUnsaveCount, totalPages, currentPage } = data;

    return `
      <div class="my-page-panel" aria-labelledby="saved-heading">
        <div class="page-head">
          <div class="page-title">
            <span>${icons.bookmark}</span>
            <h1 id="saved-heading">내 보관함</h1>
          </div>
          <div class="filter-groups" aria-label="저장 목록 필터">
            <label class="sort-select saved-sort-select" aria-label="내 보관함 정렬">
              <select data-saved-sort>
                <option value="recent" ${state.savedSort === "recent" ? "selected" : ""}>최신</option>
                <option value="saves" ${state.savedSort === "saves" ? "selected" : ""}>저장</option>
                <option value="comments" ${state.savedSort === "comments" ? "selected" : ""}>댓글</option>
                <option value="likes" ${state.savedSort === "likes" ? "selected" : ""}>좋아요</option>
                <option value="views" ${state.savedSort === "views" ? "selected" : ""}>조회</option>
              </select>
            </label>
            <div class="filter-group" role="group" aria-label="소유자 필터">
              <label><input type="checkbox" data-filter="community" ${state.savedFilter.community ? "checked" : ""} /> 다른 사용자</label>
              <label><input type="checkbox" data-filter="mine" ${state.savedFilter.mine ? "checked" : ""} /> 내 프롬프트</label>
            </div>
            <div class="filter-group" role="group" aria-label="상태 필터">
              <label class="toggle-filter">
                <input type="checkbox" data-filter="liked" ${state.savedFilter.liked ? "checked" : ""} />
                <span class="toggle-track" aria-hidden="true"><span></span></span>
                <span>좋아요만 보기</span>
              </label>
            </div>
          </div>
        </div>
        ${
          pendingUnsaveCount
            ? `<p class="saved-pending-hint">저장 취소 예정 ${pendingUnsaveCount}개가 있습니다. 같은 저장 아이콘을 다시 누르면 되돌릴 수 있고, Home, Make, Share로 이동하면 목록에서 제거됩니다.</p>`
            : ""
        }
        ${
          filtered.length
            ? `<div class="prompt-grid saved-grid">${pagePrompts.map(PromptCard).join("")}</div>
               ${SavedPagination(totalPages, currentPage)}`
            : `<div class="empty-state saved-empty">
                <span>${state.savedFilter.liked ? icons.heart : icons.bookmark}</span>
                <p>${SavedEmptyMessage()}</p>
              </div>`
        }
      </div>
    `;
  }

  global.TtalkakRenderers = Object.freeze({
    ...(global.TtalkakRenderers || {}),
    SavedLibraryPanelView,
    SavedPageView,
  });
})(window);
