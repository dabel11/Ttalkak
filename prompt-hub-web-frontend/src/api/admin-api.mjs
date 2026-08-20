export function createAdminApi({ request, unwrapItems, normalizers }) {
    const {
      getPageItems,
      normalizeAdminAuditLog,
      normalizeAdminTag,
      normalizeAdminUser,
      normalizeAdminUserActivity,
      normalizeAdminUserActivitySummary,
      normalizeAdminUserCommentActivity,
      normalizeAdminUserPromptActivity,
      normalizeAdminUserReportActivity,
      normalizeComment,
      normalizePrompt,
      normalizeReport,
      normalizeRevisionRequest,
    } = normalizers;

    const api = {
      getAdminPrompts({ status = "", page = 1, pageSize = 64 } = {}, token) {
        const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (status) query.set("status", status);
        return request(`/api/admin/prompts?${query.toString()}`, { token }).then((payload) => unwrapItems(payload).map(normalizePrompt));
      },
      searchAdminUsers({ nickname = "", page = 1, pageSize = 20 } = {}, token) {
        const query = new URLSearchParams({ nickname, page: String(page), pageSize: String(pageSize) });
        return request(`/api/admin/users?${query.toString()}`, { token }).then((payload) => getPageItems(payload).map(normalizeAdminUser));
      },
      getAdminUserActivitySummary(memberId, token) {
        return request(`/api/admin/users/${memberId}/activity`, { token }).then(normalizeAdminUserActivitySummary);
      },
      getAdminUserPrompts(memberId, { page = 1, pageSize = 20 } = {}, token) {
        const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        return request(`/api/admin/users/${memberId}/prompts?${query.toString()}`, { token }).then((payload) =>
          getPageItems(payload).map(normalizeAdminUserPromptActivity),
        );
      },
      getAdminUserComments(memberId, { page = 1, pageSize = 20 } = {}, token) {
        const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        return request(`/api/admin/users/${memberId}/comments?${query.toString()}`, { token }).then((payload) =>
          getPageItems(payload).map(normalizeAdminUserCommentActivity),
        );
      },
      getAdminUserReplies(memberId, { page = 1, pageSize = 20 } = {}, token) {
        const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        return request(`/api/admin/users/${memberId}/replies?${query.toString()}`, { token }).then((payload) =>
          getPageItems(payload).map(normalizeAdminUserCommentActivity),
        );
      },
      getAdminUserSubmittedReports(memberId, { page = 1, pageSize = 20 } = {}, token) {
        const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        return request(`/api/admin/users/${memberId}/reports/submitted?${query.toString()}`, { token }).then((payload) =>
          getPageItems(payload).map(normalizeAdminUserReportActivity),
        );
      },
      getAdminUserReceivedReports(memberId, { page = 1, pageSize = 20 } = {}, token) {
        const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        return request(`/api/admin/users/${memberId}/reports/received?${query.toString()}`, { token }).then((payload) =>
          getPageItems(payload).map(normalizeAdminUserReportActivity),
        );
      },
      async getAdminUserActivity(memberId, { page = 1, pageSize = 20, limit = 20 } = {}, token) {
        try {
          const [summary, prompts, comments, replies, reportsMade, reportsReceived] = await Promise.all([
            api.getAdminUserActivitySummary(memberId, token),
            api.getAdminUserPrompts(memberId, { page, pageSize }, token),
            api.getAdminUserComments(memberId, { page, pageSize }, token),
            api.getAdminUserReplies(memberId, { page, pageSize }, token),
            api.getAdminUserSubmittedReports(memberId, { page, pageSize }, token),
            api.getAdminUserReceivedReports(memberId, { page, pageSize }, token),
          ]);
          return {
            ...summary,
            prompts,
            comments,
            replies,
            reportsMade,
            reportsReceived,
          };
        } catch (error) {
          if (![404, 501].includes(Number(error?.status))) throw error;
          const query = new URLSearchParams({ limit: String(limit) });
          return request(`/api/admin/users/${memberId}/activities?${query.toString()}`, { token }).then(normalizeAdminUserActivity);
        }
      },
      blockAdminUser(memberId, payload = {}, token) {
        return request(`/api/admin/users/${memberId}/block`, { method: "PATCH", token, body: JSON.stringify(payload) }).then(normalizeAdminUserActivity);
      },
      unblockAdminUser(memberId, token) {
        return request(`/api/admin/users/${memberId}/unblock`, { method: "PATCH", token }).then(normalizeAdminUserActivity);
      },
      getAdminAuditLogs({ page = 1, pageSize = 64 } = {}, token) {
        const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        return request(`/api/admin/audit-logs?${query.toString()}`, { token }).then((payload) => unwrapItems(payload).map(normalizeAdminAuditLog));
      },
      getAdminRevisionRequests({ status = "all", page = 1, pageSize = 64 } = {}, token) {
        const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
        if (status) query.set("status", status);
        return request(`/api/admin/revision-requests?${query.toString()}`, { token }).then((payload) => unwrapItems(payload).map(normalizeRevisionRequest));
      },
      requestAuthorRevision(promptId, payload, token) {
        return request(`/api/admin/prompts/${promptId}/author-revision-requests`, { method: "POST", token, body: JSON.stringify(payload) }).then(normalizeRevisionRequest);
      },
      updateAuthorRevisionRequest(requestId, payload, token) {
        return request(`/api/admin/author-revision-requests/${requestId}`, { method: "PATCH", token, body: JSON.stringify(payload) }).then(normalizeRevisionRequest);
      },
      updateAdminRevisionRequestStatus(requestId, status, token, memo = "") {
        return request(`/api/admin/revision-requests/${requestId}/status`, { method: "PATCH", token, body: JSON.stringify({ status, memo }) }).then(normalizeRevisionRequest);
      },
      hideAdminComment(commentId, token) {
        return request(`/api/admin/comments/${commentId}/hide`, { method: "PATCH", token }).then(normalizeComment);
      },
      unhideAdminComment(commentId, token) {
        return request(`/api/admin/comments/${commentId}/unhide`, { method: "PATCH", token }).then(normalizeComment);
      },
      deleteAdminComment(commentId, token) {
        return request(`/api/admin/comments/${commentId}`, { method: "DELETE", token });
      },
      getAdminReports({ status = "" } = {}, token) {
        const query = new URLSearchParams();
        if (status) query.set("status", status);
        return request(`/api/admin/reports${query.toString() ? `?${query.toString()}` : ""}`, { token }).then((payload) => unwrapItems(payload).map(normalizeReport));
      },
      updateAdminReportStatus(reportId, status, token, memo = "") {
        return request(`/api/admin/reports/${reportId}/status`, { method: "PATCH", token, body: JSON.stringify({ status, memo }) }).then(normalizeReport);
      },
      hideAdminPrompt(promptId, token) {
        return request(`/api/admin/prompts/${promptId}/hide`, { method: "PATCH", token }).then(normalizePrompt);
      },
      restoreAdminPrompt(promptId, token) {
        return request(`/api/admin/prompts/${promptId}/restore`, { method: "PATCH", token }).then(normalizePrompt);
      },
      getAdminTags({ status = "" } = {}, token) {
        const query = new URLSearchParams();
        if (status) query.set("status", status);
        return request(`/api/admin/tags${query.toString() ? `?${query.toString()}` : ""}`, { token }).then((payload) => unwrapItems(payload).map(normalizeAdminTag));
      },
      updateAdminTagStatus(tagId, status, token) {
        return request(`/api/admin/tags/${tagId}/status`, { method: "PATCH", token, body: JSON.stringify({ status }) }).then(normalizeAdminTag);
      },
    };

    return api;
}
