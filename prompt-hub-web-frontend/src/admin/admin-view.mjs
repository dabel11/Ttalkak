function getAdminUserActivityPresentation(activity = {}, memberId = "") {
  const isWithdrawn = activity.active === false || /^withdrawn_user_/i.test(String(activity.nickname || ""));
  const canManage = !isWithdrawn && Boolean(String(memberId || "").trim());
  return {
    canManage,
    displayNickname: isWithdrawn ? "탈퇴한 사용자" : String(activity.nickname || "사용자").trim() || "사용자",
    isWithdrawn,
    unavailableMessage: isWithdrawn
      ? "탈퇴한 사용자는 차단 상태를 변경할 수 없습니다."
      : "샘플 작성자는 실제 회원 ID가 없어 차단할 수 없습니다.",
  };
}

export function createAdminView(ctx) {
    const {
      state, popularPrompts, savedPrompts, getUniquePrompts, getAdminReportRecords, getAdminManagedTags,
      matchesAdminPromptFilter, matchesAdminPromptQuery, canUseDemoFallback, formatNumber, getReportStatusLabel,
      escapeHtml, escapeAttr, getAdminTagStatusLabel, getTagStats, getAdminPromptsByTag, PromptCard,
      normalizeSearchText, getDisplayPromptAuthor, getPromptAuthorId, getSortedPromptComments,
      normalizeAdminSearchText, getAdminUserActivity, getAdminKnownMemberId, getRevisionRequestTarget,
      getAuthorRevisionStatusLabel, AdminRevisionRequestModalView, truncateText, AdminUserBlockDialog,
      formatShortDate, getAdminTagStatusClass, getPromptCommentCount, getPromptCreatedAt, getPromptLikes,
      getPromptRevisionRequest, getPromptSaveCount, getPromptViewCount, isFinalReportStatus, makePreview,
      renderAdminInlineAuthorControl, AdminPageView, AdminReportsPanelView, AdminPromptsPanelView,
      AdminTagsPanelView, AdminUsersPanelView, AdminAuditPanelView,
    } = ctx;
    const icons = new Proxy(/** @type {Record<PropertyKey, unknown>} */ ({}), { get: (_target, key) => ctx.getIcons()[key] });

    function getAdminTabs() {
      const canShowAdminData = getAdminCanShowData();
      const reportRecords = getAdminReportRecords();
      const allPrompts = state.backendAdminPrompts.length
        ? getUniquePrompts(state.backendAdminPrompts)
        : getUniquePrompts([...popularPrompts, ...savedPrompts]);
      const adminPromptQuery = state.adminPromptQuery || "";
      const adminPromptFilter = ["all", "shared", "private", "hidden", "reported"].includes(state.adminPromptFilter)
        ? state.adminPromptFilter
        : "all";
      const filteredAdminPrompts = allPrompts
        .filter((prompt) => matchesAdminPromptFilter(prompt, adminPromptFilter))
        .filter((prompt) => matchesAdminPromptQuery(prompt, adminPromptQuery));
      const adminTags = canShowAdminData ? getAdminManagedTags() : [];

      return [
        { id: "reports", label: "신고 관리", count: reportRecords.length },
        { id: "prompts", label: "프롬프트 관리", count: filteredAdminPrompts.length },
        { id: "tags", label: "태그 관리", count: adminTags.length },
        { id: "users", label: "사용자 활동", count: 0, hideCount: true },
        { id: "audit", label: "감사 로그", count: state.backendAdminAuditLogs.length },
      ];
    }

    function getAdminCanShowData() {
      return state.adminBackendStatus === "connected" || canUseDemoFallback();
    }

    function getAdminReportFilters(reportRecords) {
      return [
        { id: "all", label: "전체", count: reportRecords.length },
        { id: "prompt", label: "프롬프트", count: reportRecords.filter((record) => record.type === "prompt").length },
        { id: "comment", label: "댓글", count: reportRecords.filter((record) => record.type === "comment").length },
      ];
    }

    function getAdminPromptFilters() {
      return [
        { id: "all", label: "전체" },
        { id: "shared", label: "공개" },
        { id: "private", label: "비공개" },
        { id: "hidden", label: "숨김" },
        { id: "reported", label: "신고됨" },
      ];
    }

    function getAdminTagFilters() {
      return [
        { id: "all", label: "전체" },
        { id: "pending", label: "검토 중" },
        { id: "approved", label: "검토 완료" },
        { id: "rejected", label: "반려" },
        { id: "disabled", label: "추천 제외" },
      ];
    }

    function getActiveAdminPanel(activeAdminTab, panels) {
      if (activeAdminTab === "prompts") {
        return panels.prompts;
      }

      if (activeAdminTab === "tags") {
        return panels.tags;
      }

      if (activeAdminTab === "users") {
        return panels.users;
      }

      if (activeAdminTab === "audit") {
        return panels.audit;
      }

      return panels.reports;
    }

    function AdminRevisionRequestModal() {
      const target = getRevisionRequestTarget(state.adminRequestTargetKey);
      if (!target || !state.adminMode) return "";

      const existingRequest = state.adminPromptRevisionRequests[target.key];
      const isExistingRequest = Boolean(existingRequest);
      const existingStatus = String(existingRequest?.status || "pending").toLowerCase();
      const canEditExistingRequest = isExistingRequest && existingStatus === "pending" && existingRequest?.id;
      const existingStatusLabel = getAuthorRevisionStatusLabel(existingStatus);

      return AdminRevisionRequestModalView(
        { icons, escapeAttr, escapeHtml, truncateText },
        {
          target,
          existingRequest,
          isExistingRequest,
          canEditExistingRequest,
          existingStatusLabel,
        },
      );
    }

    function AdminUserBlockModal() {
      const target = state.adminBlockTarget;
      if (!target?.memberId) return "";

      return AdminUserBlockDialog({
        memberId: target.memberId,
        nickname: target.nickname,
        closeIcon: icons.close,
      });
    }

    function getAdminPanelRendererContext() {
      return {
        AdminTagPromptUsagePanel,
        AdminUserActivitySummary,
        escapeAttr,
        escapeHtml,
        formatNumber,
        formatShortDate,
        getAdminAuditActionLabel,
        getAdminAuditTargetLabel,
        getAdminTagStatusClass,
        getAdminTagStatusLabel,
        getAdminUserActivity,
        getPromptCommentCount,
        getPromptCreatedAt,
        getPromptLikes,
        getPromptRevisionRequest,
        getPromptSaveCount,
        getPromptViewCount,
        getReportStatusLabel,
        icons,
        isFinalReportStatus,
        makePreview,
        renderAdminInlineAuthorControl,
        state,
      };
    }

    function AdminPage() {
      if (!state.adminMode) {
        return AdminPageView(
          { icons, escapeHtml },
          {
            adminMode: false,
            unavailableMessage: state.isLoggedIn ? "관리자 권한 계정으로 로그인해야 Admin 페이지를 볼 수 있습니다." : "Admin 페이지는 로그인 후 사용할 수 있습니다.",
          },
        );
      }

      const canShowAdminData = getAdminCanShowData();
      const reportRecords = canShowAdminData ? getAdminReportRecords() : [];
      const adminReportFilter = ["all", "prompt", "comment"].includes(state.adminReportFilter) ? state.adminReportFilter : "all";
      const filteredReportRecords = reportRecords.filter((record) => adminReportFilter === "all" || record.type === adminReportFilter);
      const adminReportFilters = getAdminReportFilters(reportRecords);
      const allPrompts = !canShowAdminData
        ? []
        : state.backendAdminPrompts.length
        ? getUniquePrompts(state.backendAdminPrompts)
        : getUniquePrompts([...popularPrompts, ...savedPrompts]);
      const adminPromptQuery = state.adminPromptQuery || "";
      const adminPromptFilter = ["all", "shared", "private", "hidden", "reported"].includes(state.adminPromptFilter)
        ? state.adminPromptFilter
        : "all";
      const filteredAdminPrompts = allPrompts
        .filter((prompt) => matchesAdminPromptFilter(prompt, adminPromptFilter))
        .filter((prompt) => matchesAdminPromptQuery(prompt, adminPromptQuery));
      const adminPromptFilters = getAdminPromptFilters();
      const adminTags = getAdminManagedTags();
      const adminTagFilter = ["all", "pending", "approved", "rejected", "disabled"].includes(state.adminTagFilter) ? state.adminTagFilter : "all";
      const adminTagSort = ["usage", "recent"].includes(state.adminTagSort) ? state.adminTagSort : "usage";
      const adminTagFilters = getAdminTagFilters();
      const adminTabs = getAdminTabs();
      const activeAdminTab = adminTabs.some((tab) => tab.id === state.adminTab) ? state.adminTab : "reports";
      const adminPanelCtx = getAdminPanelRendererContext();
      const reportsPanel = AdminReportsPanelView(adminPanelCtx, {
        adminReportFilter,
        adminReportFilters,
        filteredReportRecords,
        reportRecords,
      });
      const promptsPanel = AdminPromptsPanelView(adminPanelCtx, {
        adminPromptFilter,
        adminPromptFilters,
        adminPromptQuery,
        filteredAdminPrompts,
      });
      const tagsPanel = AdminTagsPanelView(adminPanelCtx, {
        adminTagFilter,
        adminTagFilters,
        adminTagSort,
        adminTags,
      });
      const usersPanel = AdminUsersPanelView(adminPanelCtx);
      const auditPanel = AdminAuditPanelView(adminPanelCtx);
      const activePanel = getActiveAdminPanel(activeAdminTab, {
        audit: auditPanel,
        prompts: promptsPanel,
        reports: reportsPanel,
        tags: tagsPanel,
        users: usersPanel,
      });

      return AdminPageView(
        { icons, escapeHtml },
        {
          activePanel,
          adminMode: true,
          notice: getAdminModeNotice(),
        },
      );
    }

    function AdminTagPromptUsagePanel(tag) {
      const prompts = getAdminPromptsByTag(tag.key);
      const visiblePrompts = prompts.slice(0, 5);
      const remainingCount = Math.max(0, prompts.length - visiblePrompts.length);

      return `
        <section class="admin-tag-usage-panel" aria-label="#${escapeHtml(tag.label)} 사용 게시물">
          <div class="admin-tag-usage-head">
            <div>
              <h3>#${escapeHtml(tag.label)} 사용 게시물</h3>
              <p>태그 검토를 위해 이 태그가 붙은 게시물 맥락을 확인합니다.</p>
            </div>
            <span>${formatNumber(prompts.length)}개</span>
          </div>
          ${
            visiblePrompts.length
              ? visiblePrompts
                  .map((prompt) => {
                    const isShared = prompt.isShared || prompt.source === "community";
                    const isHidden = state.adminHiddenPromptIds.has(prompt.id);
                    return `
                      <article class="admin-tag-prompt-item">
                        <div>
                          <strong>${escapeHtml(prompt.title)}</strong>
                          <p>${escapeHtml(makePreview(prompt.text))}</p>
                          <div class="admin-prompt-meta">
                            <span>작성자 ${renderAdminInlineAuthorControl(prompt)}</span>
                            <span>${formatShortDate(getPromptCreatedAt(prompt))}</span>
                            <span class="status-badge ${isShared ? "public" : "private"}">${isShared ? "공유됨" : "비공개"}</span>
                            ${isHidden ? `<span class="status-badge private">숨김</span>` : ""}
                          </div>
                        </div>
                        <div class="admin-actions">
                          <button type="button" data-open-prompt="${prompt.id}">원문 보기</button>
                        </div>
                      </article>
                    `;
                  })
                  .join("")
              : `<p class="admin-empty">이 태그가 붙은 게시물이 없습니다.</p>`
          }
          ${remainingCount ? `<p class="admin-panel-note">먼저 5개만 표시합니다. 나머지 ${formatNumber(remainingCount)}개는 백엔드 페이지네이션 API 연결 후 이어서 확인할 수 있습니다.</p>` : ""}
        </section>
      `;
    }

    function getAdminAuditActionLabel(action) {
      const normalized = String(action || "").trim().toLowerCase();
      const labels = {
        block_user: "회원 차단",
        user_block: "회원 차단",
        member_block: "회원 차단",
        user_blocked: "회원 차단",
        member_blocked: "회원 차단",
        block_member: "회원 차단",
        unblock_user: "회원 차단 해제",
        user_unblock: "회원 차단 해제",
        member_unblock: "회원 차단 해제",
        user_unblocked: "회원 차단 해제",
        member_unblocked: "회원 차단 해제",
        unblock_member: "회원 차단 해제",
        report_status: "신고 상태 변경",
        report_status_changed: "신고 상태 변경",
        report_status_change: "신고 상태 변경",
        report_status_update: "신고 상태 변경",
        update_report_status: "신고 상태 변경",
        prompt_hide: "게시물 숨김",
        hide_prompt: "게시물 숨김",
        prompt_hidden: "게시물 숨김",
        prompt_restore: "게시물 숨김 해제",
        restore_prompt: "게시물 숨김 해제",
        prompt_restored: "게시물 숨김 해제",
        hide_comment: "댓글 숨김",
        comment_hide: "댓글 숨김",
        comment_hidden: "댓글 숨김",
        unhide_comment: "댓글 숨김 해제",
        comment_unhide: "댓글 숨김 해제",
        comment_restore: "댓글 숨김 해제",
        comment_unhidden: "댓글 숨김 해제",
        delete_comment: "댓글 삭제",
        comment_delete: "댓글 삭제",
        comment_deleted: "댓글 삭제",
        tag_status: "태그 상태 변경",
        tag_status_changed: "태그 상태 변경",
        tag_status_change: "태그 상태 변경",
        revision_request: "수정 요청",
        revision_request_create: "수정 요청 생성",
        revision_request_status_change: "수정 요청 상태 변경",
        author_revision_request_create: "작성자 수정 요청 생성",
        author_revision_request_update: "작성자 수정 요청 사유 수정",
        author_revision_request_status_change: "작성자 수정 요청 상태 변경",
      };
      return labels[normalized] || action || "관리자 작업";
    }

    function getAdminAuditTargetLabel(log) {
      const targetType = String(log?.targetType || "").trim();
      const targetId = String(log?.targetId || "").trim();
      if (!targetType && !targetId) return "대상 정보 없음";
      if (!targetId) return targetType;
      if (!targetType) return `대상 ${targetId}`;
      return `${targetType} #${targetId}`;
    }

    function getAdminModeNotice() {
      if (state.adminBackendStatus === "fallback" && !canUseDemoFallback()) {
        return "관리자 API 호출에 실패했습니다. 통합 테스트/시연 모드에서는 데모 관리자 데이터를 표시하지 않습니다.";
      }
      if (state.adminBackendStatus === "demo") {
        return "데모 관리자 데이터를 표시 중입니다. 실제 운영 검수는 관리자 토큰으로 백엔드 API 연결 상태에서 확인해주세요.";
      }
      return "프론트엔드 검수용 관리자 화면입니다. 댓글은 별도 메뉴로 분리하지 않고 신고 관리, 프롬프트 원문 보기, 사용자 활동 안에서 게시물 맥락과 함께 확인합니다.";
    }

    function AdminUserActivitySummary(activity) {
      const memberId = String(activity.memberId || getAdminKnownMemberId(activity.nickname) || "").trim();
      const isBlocked = Boolean(activity.blocked);
      const presentation = getAdminUserActivityPresentation(activity, memberId);
      const groups = [
        { id: "prompts", title: "작성한 프롬프트", items: activity.prompts, empty: "작성한 프롬프트가 없습니다." },
        { id: "comments", title: "작성한 댓글", items: activity.comments, empty: "작성한 댓글이 없습니다." },
        { id: "replies", title: "작성한 답글", items: activity.replies, empty: "작성한 답글이 없습니다." },
        { id: "reports-made", title: "신고한 내역", items: activity.reportsMade, empty: "신고한 내역은 아직 확인할 수 없습니다." },
        { id: "reports-received", title: "신고당한 내역", items: activity.reportsReceived, empty: "신고당한 내역이 없습니다." },
      ];

      return `
        <div class="admin-user-activity-result">
          <div class="admin-user-activity-title">
            <div>
              <strong>${escapeHtml(presentation.displayNickname)}</strong>
              ${presentation.isWithdrawn ? `<span class="status-badge private">탈퇴함</span>` : ""}
              <span>프롬프트 ${formatNumber(activity.prompts.length)}개 · 댓글 ${formatNumber(activity.comments.length)}개 · 답글 ${formatNumber(activity.replies.length)}개</span>
              ${isBlocked ? `<span class="status-badge private">차단됨</span>` : ""}
            </div>
            ${
              presentation.canManage
                ? `<div class="admin-user-activity-actions">
                    ${
                      isBlocked
                        ? `<button type="button" data-admin-user-unblock="${escapeHtml(memberId)}" data-admin-user-name="${escapeHtml(activity.nickname)}">차단 해제</button>`
                        : `<button type="button" data-admin-user-block="${escapeHtml(memberId)}" data-admin-user-name="${escapeHtml(activity.nickname)}">차단</button>`
                    }
                  </div>`
                : `<span class="status-badge pending-unsave">${presentation.unavailableMessage}</span>`
            }
          </div>
          <div class="admin-user-activity-grid">
            ${groups
              .map(
                (group) => `
                  <section class="admin-user-activity-card">
                    <h4>${group.title}<small>${formatNumber(group.items.length)}</small></h4>
                    ${
                      group.items.length
                        ? group.items
                            .slice(0, 4)
                            .map(
                              (item) => `
                                <article>
                                  <strong>${escapeHtml(item.title)}</strong>
                                  <p>${escapeHtml(item.preview)}</p>
                                  ${
                                    item.promptId
                                      ? `<button type="button" data-open-prompt="${escapeHtml(item.promptId)}" ${item.commentId ? `data-highlight-comment="${escapeHtml(item.commentId)}"` : ""}>원문 보기</button>`
                                      : ""
                                  }
                                </article>
                              `,
                            )
                            .join("")
                        : `<p class="admin-user-activity-empty">${group.empty}</p>`
                    }
                  </section>
                `,
              )
              .join("")}
          </div>
        </div>
      `;
    }

    return Object.freeze({ getAdminTabs, getAdminCanShowData, getAdminReportFilters, getAdminPromptFilters, getAdminTagFilters, getActiveAdminPanel, AdminRevisionRequestModal, AdminUserBlockModal, getAdminPanelRendererContext, AdminPage, AdminTagPromptUsagePanel, getAdminAuditActionLabel, getAdminAuditTargetLabel, getAdminModeNotice, AdminUserActivitySummary });
  }
export { getAdminUserActivityPresentation };
