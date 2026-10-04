  "use strict";

  function LibraryStatusPromptView(data = {}) {
    const { backendStatus, canUseDemoFallback, hasCachedContent, isDemoAccount, isSeeded } = data;
    if (backendStatus === "checking") {
      if (hasCachedContent) {
        return `
          <div class="demo-library-prompt is-recovering is-compact" role="status" aria-live="polite">
            <span class="demo-library-status-dot" aria-hidden="true"></span>
            <span>최신 정보 확인 중…</span>
          </div>
        `;
      }
      return `
        <div class="demo-library-prompt is-recovering" role="status" aria-live="polite">
          <div>
            <strong>서버에 다시 연결하는 중입니다</strong>
            <p>저장한 프롬프트와 최근 활동을 새로 불러오고 있습니다.</p>
          </div>
          <button class="secondary-button" type="button" disabled>연결 중…</button>
        </div>
      `;
    }
    if (isDemoAccount) {
      return `
        <div class="demo-library-prompt">
          <div><strong>데모 계정 · 이 기기에 저장됨</strong>
            <p>저장과 좋아요 활동은 서버로 보내지 않고 현재 브라우저에만 보관합니다.</p></div>
        </div>
      `;
    }
    if (backendStatus === "connected") {
      return `
        <div class="demo-library-prompt">
          <div>
            <strong>현재: 서버 응답 우선 + 최근 활동 즉시 반영</strong>
            <p>백엔드 API 응답을 우선 반영하고, 방금 저장·댓글·신고한 활동은 즉시 함께 표시합니다.</p>
          </div>
        </div>
      `;
    }
    if (backendStatus === "fallback" && !canUseDemoFallback) {
      return `
        <div class="demo-library-prompt is-error" role="alert">
          <div>
            <strong>마이페이지 데이터를 불러오지 못했습니다</strong>
            <p>네트워크 상태를 확인한 뒤 잠시 후 다시 시도해 주세요.</p>
          </div>
          <button class="secondary-button" type="button" data-retry-my-page-load>다시 연결</button>
        </div>
      `;
    }
    return `
      <div class="demo-library-prompt">
        <div>
          <strong>현재: ${isSeeded ? "데모 데이터 표시 중" : "실서비스 초기 상태"}</strong>
          <p>${isSeeded ? "기능 검수용 예시 보관함을 표시하고 있습니다. 실제 신규 계정 상태를 확인하려면 데모 데이터를 숨겨주세요." : "실서비스 기준으로 새 계정의 보관함은 비어 있습니다. 기능 검수용 예시가 필요하면 데모 데이터를 채워 확인할 수 있습니다."}</p>
        </div>
        ${canUseDemoFallback ? `<button class="secondary-button" type="button" data-toggle-library-demo>${isSeeded ? "데모 데이터 숨기기" : "데모 데이터 채우기"}</button>` : ""}
      </div>
    `;
  }

  function SavedPageView(ctx, data) {
    const { icons, state, formatNumber, DemoLibraryPrompt, MyPagePanel } = ctx;
    const { hideMyPagePanel, libraryStatus, tabs } = data;
    const statusPrompt = typeof DemoLibraryPrompt === "function" ? DemoLibraryPrompt() : LibraryStatusPromptView(libraryStatus);

    return `
      <section class="saved-page my-page" aria-labelledby="my-page-heading">
        <div class="page-head my-page-head">
          <div class="page-title">
            <span>${icons.user}</span>
            <h1 id="my-page-heading">마이페이지</h1>
          </div>
        </div>
        <nav class="my-page-tabs" aria-label="마이페이지 메뉴">
          ${tabs
            .map(
              (tab) => `
                <button class="${state.myPageTab === tab.id ? "active" : ""}" type="button" data-my-tab="${tab.id}" ${state.myPageTab === tab.id ? 'aria-current="page"' : ""}>
                  ${tab.label}<span>${formatNumber(tab.count)}</span>
                </button>
              `,
            )
            .join("")}
        </nav>
        ${statusPrompt}
        ${hideMyPagePanel ? "" : MyPagePanel()}
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
            ? `<p class="saved-pending-hint">저장 취소 예정 ${pendingUnsaveCount}개가 있습니다. 같은 저장 아이콘을 다시 누르면 되돌릴 수 있고, 홈, 첨삭, 공유로 이동하면 목록에서 제거됩니다.</p>`
            : ""
        }
        ${
          filtered.length
            ? `<div class="prompt-grid saved-grid">${pagePrompts.map(PromptCard).join("")}</div>
               ${SavedPagination(totalPages, currentPage)}`
            : `<div class="empty-state content-empty-state saved-empty">
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
            : `<div class="empty-state content-empty-state saved-empty"><span>${icons.edit}</span><p>아직 직접 만든 프롬프트가 없습니다.</p></div>`
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
            : `<div class="empty-state content-empty-state saved-empty"><span>${icons.comment}</span><p>작성한 댓글이 아직 없습니다.</p></div>`
        }
      </div>
    `;
  }

  function MyReportsPanelView(ctx, data) {
    const { icons, escapeAttr, escapeHtml, formatShortDate, getReportStatusLabel } = ctx;
    const { reports } = data;

    return `
      <div class="my-page-panel">
        <div class="page-head">
          <div class="page-title">
            <span>${icons.flag}</span>
            <h1>신고 내역</h1>
          </div>
        </div>
        ${
          reports.length
            ? `<div class="activity-list">
                ${reports
                  .map(
                    (report) => `
                      <article class="activity-item reported-activity">
                        <div>
                          <div class="my-report-heading">
                            <strong>${escapeHtml(report.title)}</strong>
                            <span class="status-badge ${["reviewed", "resolved"].includes(report.status) ? "public" : report.status === "dismissed" ? "private" : "pending-unsave"}">${getReportStatusLabel(report.status)}</span>
                          </div>
                          <p>${escapeHtml(report.label)}</p>
                          ${report.reason ? `<p class="activity-reason">${escapeHtml(report.reason)}</p>` : ""}
                          ${report.memo ? `<p class="activity-reason">처리 메모: ${escapeHtml(report.memo)}</p>` : ""}
                          ${report.reviewedAt ? `<small class="activity-meta">처리 일시 ${formatShortDate(report.reviewedAt)}</small>` : ""}
                          ${
                            report.status === "revision-requested" && report.editPromptId
                              ? `<div class="activity-actions">
                                  <button type="button" data-edit-prompt="${escapeAttr(report.editPromptId)}">수정하기</button>
                                </div>`
                              : ""
                          }
                        </div>
                      </article>
                    `,
                  )
                  .join("")}
              </div>`
            : `<div class="empty-state content-empty-state saved-empty"><span>${icons.flag}</span><p>신고 내역이 아직 없습니다.</p></div>`
        }
      </div>
    `;
  }

  const renderers = Object.freeze({
    MyCommentsPanelView,
    MyPromptsPanelView,
    MyReportsPanelView,
    SavedLibraryPanelView,
    SavedPageView,
  });
export { renderers };
