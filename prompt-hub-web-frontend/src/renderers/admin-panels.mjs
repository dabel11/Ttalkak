  "use strict";

  function AdminReportsPanelView(ctx, data) {
    const { escapeHtml, formatNumber } = ctx;
    const {
      adminReportFilter,
      adminReportFilters,
      filteredReportRecords,
      reportRecords,
    } = data;

    return `
      <section class="admin-panel">
        <h2>신고 관리</h2>
        <p class="admin-panel-note">신고된 프롬프트와 댓글을 게시물 맥락 안에서 검토합니다. 처리 완료/기각 상태는 최종 상태로 유지합니다.</p>
        <div class="admin-filter-list" aria-label="신고 유형 분류">
          ${adminReportFilters
            .map(
              (filter) =>
                `<button class="${adminReportFilter === filter.id ? "active" : ""}" type="button" data-admin-report-filter="${filter.id}">${filter.label}<span>${formatNumber(filter.count)}</span></button>`,
            )
            .join("")}
        </div>
        ${
          filteredReportRecords.length
            ? filteredReportRecords.map((record) => AdminReportRow(ctx, record)).join("")
            : `<p class="admin-empty">${reportRecords.length ? "선택한 유형의 신고가 없습니다." : "접수된 신고가 없습니다."}</p>`
        }
      </section>
    `;
  }

  function AdminReportRow(ctx, record) {
    const {
      escapeHtml,
      getReportStatusLabel,
      isFinalReportStatus,
      state,
    } = ctx;

    return `
      <article class="admin-row admin-report-row report-status-${record.status}">
        <div>
          <div class="status-row">
            <span class="status-badge ${record.type === "comment" ? "pending-unsave" : "public"}">${record.type === "comment" ? "댓글 신고" : "프롬프트 신고"}</span>
            <span class="status-badge ${record.status === "dismissed" ? "private" : ["reviewed", "resolved"].includes(record.status) ? "public" : "pending-unsave"}">${getReportStatusLabel(record.status)}</span>
            ${state.adminPromptRevisionRequests[record.key] ? `<span class="status-badge pending-unsave">수정 요청됨</span>` : ""}
          </div>
          <strong>${escapeHtml(record.type === "comment" ? record.contextTitle || record.title : record.title)}</strong>
          ${record.contextTitle ? `<p class="admin-report-context">게시물: ${escapeHtml(record.contextTitle)}</p>` : ""}
          ${record.targetPreview ? `<p class="admin-report-target">${escapeHtml(record.targetPreview)}</p>` : ""}
          <p>${escapeHtml(record.summary)}</p>
          ${record.promptAuthor ? `<span class="status-badge private">게시물 작성자 ${escapeHtml(record.promptAuthor)}</span>` : ""}
          ${record.commentAuthor ? `<span class="status-badge private">댓글 작성자 ${escapeHtml(record.commentAuthor)}</span>` : ""}
        </div>
        <div class="admin-actions">
          ${
            record.promptId
              ? `<button type="button" data-open-prompt="${record.promptId}" ${record.type === "comment" ? `data-highlight-comment="${record.targetId}"` : ""}>원문 보기</button>`
              : ""
          }
          <button type="button" data-admin-request-revision="${record.key}">${state.adminPromptRevisionRequests[record.key] ? "사유 확인" : "수정 요청"}</button>
          ${record.promptId ? `<button type="button" data-admin-hide-prompt="${record.promptId}">${state.adminHiddenPromptIds.has(record.promptId) ? "게시물 숨김 해제" : "게시물 숨김"}</button>` : ""}
          ${
            isFinalReportStatus(record.status)
              ? ""
              : `${record.status !== "reviewed" ? `<button type="button" data-admin-report-status="${record.key}:reviewed">검토 완료</button>` : ""}
                 ${record.status !== "dismissed" ? `<button type="button" data-admin-report-status="${record.key}:dismissed">기각</button>` : ""}`
          }
          ${
            record.type === "comment"
              ? `<button type="button" data-delete-comment="${record.targetId}">댓글 삭제</button>`
              : ""
          }
        </div>
      </article>
    `;
  }

  function AdminPromptsPanelView(ctx, data) {
    const { escapeAttr, escapeHtml, icons } = ctx;
    const {
      adminPromptFilter,
      adminPromptFilters,
      adminPromptQuery,
      filteredAdminPrompts,
    } = data;

    return `
      <section class="admin-panel">
        <h2>프롬프트 관리</h2>
        <p class="admin-panel-note">관리자는 사용자 프롬프트를 직접 수정하지 않고, 원문 보기에서 댓글 맥락을 함께 확인한 뒤 수정 요청과 게시물 숨김/해제 같은 운영 조치만 수행합니다.</p>
        <div class="admin-filter-list" aria-label="프롬프트 분류">
          ${adminPromptFilters
            .map(
              (filter) =>
                `<button class="${adminPromptFilter === filter.id ? "active" : ""}" type="button" data-admin-prompt-filter="${filter.id}">${filter.label}</button>`,
            )
            .join("")}
        </div>
        <label class="admin-search-field">
          <span>${icons.search}</span>
          <input type="search" data-admin-prompt-search value="${escapeAttr(adminPromptQuery)}" placeholder="제목, 본문, 해시태그, 작성자, 상태로 검색" autocomplete="off" />
        </label>
        ${
          filteredAdminPrompts.length
            ? filteredAdminPrompts.slice(0, 8).map((prompt) => AdminPromptRow(ctx, prompt)).join("")
            : `<p class="admin-empty">검색 결과가 없습니다.</p>`
        }
      </section>
    `;
  }

  function AdminPromptRow(ctx, prompt) {
    const {
      escapeAttr,
      escapeHtml,
      formatNumber,
      formatShortDate,
      getPromptCommentCount,
      getPromptCreatedAt,
      getPromptLikes,
      getPromptRevisionRequest,
      getPromptSaveCount,
      getPromptViewCount,
      icons,
      makePreview,
      renderAdminInlineAuthorControl,
      state,
    } = ctx;
    const isShared = prompt.isShared || prompt.source === "community";
    const isHidden = state.adminHiddenPromptIds.has(prompt.id);
    const isReported = state.reportedPromptIds.has(prompt.id);
    const revisionRequest = getPromptRevisionRequest(prompt.id);

    return `
      <article class="admin-row admin-prompt-row">
        <div>
          <strong>${escapeHtml(prompt.title)}</strong>
          <p class="admin-prompt-preview">${escapeHtml(makePreview(prompt.text))}</p>
          <div class="admin-prompt-meta">
            <span>${icons.eye}${formatNumber(getPromptViewCount(prompt))}</span>
            <span>${icons.heart}${formatNumber(getPromptLikes(prompt))}</span>
            <span>${icons.comment}${formatNumber(getPromptCommentCount(prompt))}</span>
            <span>${icons.bookmark}${formatNumber(getPromptSaveCount(prompt))}</span>
            <span>작성자 ${renderAdminInlineAuthorControl(prompt)}</span>
            <span>${formatShortDate(getPromptCreatedAt(prompt))}</span>
          </div>
          <div class="tag-row admin-prompt-tags">${(prompt.tags || []).map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}</div>
          <div class="status-row">
            <span class="status-badge ${isShared ? "public" : "private"}">${isShared ? "공유됨" : "비공개"}</span>
            ${isHidden ? `<span class="status-badge private">숨김</span>` : ""}
            ${isReported ? `<span class="status-badge pending-unsave">신고됨</span>` : ""}
            ${revisionRequest ? `<span class="status-badge pending-unsave">수정 요청됨</span>` : ""}
          </div>
          ${
            revisionRequest
              ? `<div class="revision-request-notice admin-revision-summary">
                  <strong>수정 요청 사유</strong>
                  <p>${escapeHtml(revisionRequest.reason || "수정 요청 사유가 입력되지 않았습니다.")}</p>
                </div>`
              : ""
          }
        </div>
        <div class="admin-actions">
          <button type="button" data-open-prompt="${escapeAttr(prompt.id)}">원문 보기</button>
          <button type="button" data-admin-request-revision="prompt:${escapeAttr(prompt.id)}">${revisionRequest ? "사유 확인" : "수정 요청"}</button>
          <button type="button" data-admin-hide-prompt="${escapeAttr(prompt.id)}">${isHidden ? "게시물 숨김 해제" : "게시물 숨김"}</button>
        </div>
      </article>
    `;
  }

  function AdminTagsPanelView(ctx, data) {
    const { escapeAttr, escapeHtml, icons, state } = ctx;
    const {
      adminTagFilter,
      adminTagFilters,
      adminTagSort,
      adminTags,
    } = data;

    return `
      <section class="admin-panel">
        <h2>태그 관리</h2>
        <p class="admin-panel-note">태그는 검토 중, 검토 완료, 반려, 추천 제외 상태로 관리하며 승인 태그는 추천 제외하거나 다시 복구할 수 있습니다.</p>
        <div class="admin-filter-list" aria-label="태그 상태 분류">
          ${adminTagFilters
            .map(
              (filter) =>
                `<button class="${adminTagFilter === filter.id ? "active" : ""}" type="button" data-admin-tag-filter="${filter.id}">${filter.label}</button>`,
            )
            .join("")}
        </div>
        <div class="admin-search-toolbar">
          <label class="admin-search-field">
            <span>${icons.search}</span>
            <input type="search" data-admin-tag-search value="${escapeAttr(state.adminTagQuery || "")}" placeholder="태그명을 검색" autocomplete="off" />
          </label>
          <select class="admin-sort-select" data-admin-tag-sort aria-label="태그 정렬">
            <option value="usage" ${adminTagSort === "usage" ? "selected" : ""}>사용량</option>
            <option value="recent" ${adminTagSort === "recent" ? "selected" : ""}>최신</option>
          </select>
        </div>
        ${
          adminTags.length
            ? adminTags.map((tag) => AdminTagRow(ctx, tag)).join("")
            : `<p class="admin-empty">관리할 태그가 없습니다.</p>`
        }
      </section>
    `;
  }

  function AdminTagRow(ctx, tag) {
    const {
      AdminTagPromptUsagePanel,
      escapeAttr,
      escapeHtml,
      formatNumber,
      getAdminTagStatusClass,
      getAdminTagStatusLabel,
      state,
    } = ctx;
    const isSelectedTag = state.adminTagPromptKey === tag.key;

    return `
      <article class="admin-row tag-status-${tag.status} ${isSelectedTag ? "admin-tag-selected" : ""}">
        <div>
          <strong>#${escapeHtml(tag.label)}</strong>
          <span class="status-badge ${getAdminTagStatusClass(tag.status)}">${getAdminTagStatusLabel(tag.status)}</span>
          <span class="admin-tag-usage">사용 ${formatNumber(tag.count)}회</span>
        </div>
        <div class="admin-actions">
          <button type="button" data-admin-tag-prompts="${escapeAttr(tag.key)}">${isSelectedTag ? "사용 게시물 닫기" : "사용 게시물 보기"}</button>
          ${tag.status === "pending" ? `<button type="button" data-admin-tag-action="approved:${escapeAttr(tag.key)}">검토 완료</button>` : ""}
          ${tag.status === "pending" ? `<button type="button" data-admin-tag-action="rejected:${escapeAttr(tag.key)}">반려</button>` : ""}
          ${tag.status === "approved" ? `<button type="button" data-admin-tag-action="disabled:${escapeAttr(tag.key)}">추천 제외</button>` : ""}
          ${tag.status === "disabled" ? `<button type="button" data-admin-tag-action="approved:${escapeAttr(tag.key)}">추천 복구</button>` : ""}
        </div>
      </article>
      ${isSelectedTag ? AdminTagPromptUsagePanel(tag) : ""}
    `;
  }

  function AdminUsersPanelView(ctx) {
    return `
      <section class="admin-panel">
        <h2>사용자 활동</h2>
        <p class="admin-panel-note">닉네임 기준으로 작성한 프롬프트, 댓글, 답글, 신고 맥락을 함께 확인합니다.</p>
        ${AdminUserActivityPanel(ctx)}
      </section>
    `;
  }

  function AdminUserActivityPanel(ctx) {
    const {
      AdminUserActivitySummary,
      escapeAttr,
      escapeHtml,
      getAdminUserActivity,
      state,
    } = ctx;
    const adminUserNickname = String(state.adminUserActivityNickname || "").trim();
    const adminUserActivity = adminUserNickname ? getAdminUserActivity(adminUserNickname) : null;
    const adminUserSearchResults = Array.isArray(state.adminUserSearchResults) ? state.adminUserSearchResults : [];

    return `
      <section class="admin-user-activity-panel" aria-label="사용자 활동 조회">
        <div class="admin-user-activity-head">
          <div>
            <h3>사용자 활동 조회</h3>
          </div>
        </div>
        <form class="admin-user-search-form" data-admin-user-search-form>
          <input name="nickname" type="search" value="${escapeAttr(state.adminUserQuery || adminUserNickname)}" placeholder="닉네임을 입력하세요" autocomplete="off" />
          <button type="submit">조회</button>
        </form>
        ${
          state.adminUserSearchMessage
            ? `<p class="admin-user-search-message">${escapeHtml(state.adminUserSearchMessage)}</p>`
            : ""
        }
        ${
          adminUserSearchResults.length
            ? `<div class="admin-user-search-results" aria-label="사용자 검색 결과">
                <strong>검색 결과</strong>
                <div>
                  ${adminUserSearchResults
                    .map((user) => AdminUserSearchResultButton(ctx, user))
                    .join("")}
                </div>
              </div>`
            : ""
        }
        ${
          adminUserActivity
            ? AdminUserActivitySummary(adminUserActivity)
            : `<p class="admin-panel-note">원문 보기에서 작성자 닉네임을 클릭하거나 닉네임을 검색하면 활동 내역이 표시됩니다.</p>`
        }
      </section>
    `;
  }

  function AdminUserSearchResultButton(ctx, user) {
    const { escapeAttr, escapeHtml } = ctx;
    const memberId = String(user.id || user.memberId || "").trim();
    const nickname = String(user.nickname || "사용자").trim();

    return `
      <button class="admin-user-search-result" type="button" data-admin-user-select="${escapeAttr(memberId)}" data-admin-user-name="${escapeAttr(nickname)}" ${memberId ? "" : "disabled"}>
        <span>
          <strong>${escapeHtml(nickname)}</strong>
          <small>memberId ${escapeHtml(memberId || "확인 필요")}</small>
        </span>
        <em class="${user.blocked ? "blocked" : ""}">${user.blocked ? "차단됨" : "활성"}</em>
      </button>
    `;
  }

  function AdminAuditPanelView(ctx) {
    const { escapeHtml, state } = ctx;
    const auditLogs = state.backendAdminAuditLogs || [];

    return `
      <section class="admin-panel">
        <h2>감사 로그</h2>
        <p class="admin-panel-note">
          관리자 운영 액션이 서버 감사 로그에 남는지 확인합니다.
          ${state.adminAuditSyncMessage ? `<br><span>${escapeHtml(state.adminAuditSyncMessage)}</span>` : ""}
        </p>
        ${
          auditLogs.length
            ? auditLogs
                .slice(0, 40)
                .map((log) => AdminAuditLogRow(ctx, log))
                .join("")
            : `<p class="admin-empty">아직 표시할 감사 로그가 없습니다.</p>`
        }
      </section>
    `;
  }

  function AdminAuditLogRow(ctx, log) {
    const {
      escapeHtml,
      formatShortDate,
      getAdminAuditActionLabel,
      getAdminAuditTargetLabel,
    } = ctx;

    return `
      <article class="admin-row admin-audit-row">
        <div>
          <strong>${escapeHtml(getAdminAuditActionLabel(log.action))}</strong>
          <p>${escapeHtml(getAdminAuditTargetLabel(log))}</p>
          ${log.memo ? `<p class="admin-report-target">${escapeHtml(log.memo)}</p>` : ""}
          <span class="status-badge private">처리자 ${escapeHtml(log.actor || "관리자")}</span>
          <span class="status-badge pending-unsave">${escapeHtml(formatShortDate(log.createdAt))}</span>
        </div>
      </article>
    `;
  }

  const renderers = Object.freeze({
    AdminAuditPanelView,
    AdminPromptsPanelView,
    AdminReportsPanelView,
    AdminTagsPanelView,
    AdminUsersPanelView,
  });
  if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent("ttalkak:route-renderers-registered", { detail: { renderers: {
    AdminAuditPanelView, AdminPromptsPanelView, AdminReportsPanelView, AdminTagsPanelView, AdminUsersPanelView,
  } } }));
export { renderers };
