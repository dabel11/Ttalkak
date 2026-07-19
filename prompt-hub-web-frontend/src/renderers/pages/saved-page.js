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

  function MyPromptsPanelView(ctx, data) {
    const { icons, PromptCard } = ctx;
    const { prompts } = data;

    return `
      <div class="my-page-panel">
        <div class="page-head">
          <div class="page-title">
            <span>${icons.edit}</span>
            <h1>내가 만든 프롬프트</h1>
          </div>
        </div>
        ${
          prompts.length
            ? `<div class="prompt-grid saved-grid">${prompts.map(PromptCard).join("")}</div>`
            : `<div class="empty-state saved-empty"><span>${icons.edit}</span><p>아직 직접 만든 프롬프트가 없습니다.</p></div>`
        }
      </div>
    `;
  }

  function MyCommentsPanelView(ctx, data) {
    const { icons, escapeAttr, escapeHtml } = ctx;
    const { comments } = data;

    return `
      <div class="my-page-panel">
        <div class="page-head">
          <div class="page-title">
            <span>${icons.comment}</span>
            <h1>댓글 관리</h1>
          </div>
        </div>
        ${
          comments.length
            ? `<div class="activity-list">
                ${comments
                  .map(
                    ({ item, isEditing, revisionRequest }) => {
                      const safeCommentId = escapeAttr(item.comment.id);
                      const safePromptId = escapeAttr(item.promptId);
                      return `
                        <article class="activity-item">
                          <div>
                            <strong>${escapeHtml(item.prompt?.title || "삭제된 프롬프트")}</strong>
                            ${
                              isEditing
                                ? `<form class="comment-edit-form my-comment-edit-form" data-edit-comment-form="${safeCommentId}">
                                    <textarea name="comment" rows="3">${escapeHtml(item.comment.text)}</textarea>
                                    <button class="primary-button" type="submit">저장</button>
                                  </form>`
                                : `<p>${escapeHtml(item.comment.text)}${item.comment.edited ? `<span class="activity-edited-mark">수정됨</span>` : ""}</p>`
                            }
                            ${
                              revisionRequest
                                ? `<div class="revision-request-notice activity-revision-notice">
                                    <strong>수정 요청 사유</strong>
                                    <p>${escapeHtml(revisionRequest.reason || "수정 요청 사유가 입력되지 않았습니다.")}</p>
                                  </div>`
                                : ""
                            }
                          </div>
                          <div class="activity-actions">
                            <button type="button" data-open-prompt="${safePromptId}">원문 보기</button>
                            <button type="button" data-edit-comment="${safeCommentId}">${isEditing ? "취소" : "수정"}</button>
                            <button type="button" data-delete-comment="${safeCommentId}">삭제</button>
                          </div>
                        </article>
                      `;
                    },
                  )
                  .join("")}
              </div>`
            : `<div class="empty-state saved-empty"><span>${icons.comment}</span><p>작성한 댓글이 아직 없습니다.</p></div>`
        }
      </div>
    `;
  }

  global.TtalkakRenderers = Object.freeze({
    ...(global.TtalkakRenderers || {}),
    MyCommentsPanelView,
    MyPromptsPanelView,
    SavedLibraryPanelView,
    SavedPageView,
  });
})(window);
