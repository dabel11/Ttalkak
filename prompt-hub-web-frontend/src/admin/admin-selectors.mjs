  "use strict";
  function createAdminSelectors(ctx) {
    const { state, popularPrompts, savedPrompts, commentsByPrompt, getUniquePrompts, normalizeTag, normalizeSearchText, parseTimestamp, getDisplayPromptAuthor, getPromptAuthorId, getPromptComments, getSortedPromptComments, getPromptCommentCount, findPromptById, findCommentInList, normalizeAdminSearchText, getKnownTags, getAdminTagStatusOrder, getPromptCreatedAt, makePreview, findCommentById, findCommentContextById, resolveAdminTagStatus } = ctx;

    function getAdminManagedTags() {
      const stats = getTagStats();
      const query = normalizeTag(state.adminTagQuery || "");
      const filter = ["all", "pending", "approved", "rejected", "disabled"].includes(state.adminTagFilter) ? state.adminTagFilter : "all";
      const sort = ["usage", "recent"].includes(state.adminTagSort) ? state.adminTagSort : "usage";

      const backendTags = (state.backendAdminTags || []).map((tag) => ({
        label: tag.label,
        key: tag.key,
        id: tag.id,
        status: tag.status || getAdminTagStatus(tag.label),
        count: tag.count || 0,
        recentAt: tag.recentAt || 0,
        backend: true,
      }));
      const backendKeys = new Set(backendTags.map((tag) => tag.key));
      const localTags = getKnownTags()
        .filter((tag) => !backendKeys.has(normalizeTag(tag)))
        .map((tag) => {
          const key = normalizeTag(tag);
          const stat = stats.get(key) || {};
          return {
            label: tag,
            key,
            status: getAdminTagStatus(tag),
            count: stat.count || 0,
            recentAt: stat.recentAt || 0,
          };
        });

      return [...backendTags, ...localTags]
        .filter((tag) => filter === "all" || tag.status === filter)
        .filter((tag) => !query || normalizeTag(tag.label).includes(query))
        .sort((a, b) => {
          if (sort === "recent") {
            return b.recentAt - a.recentAt || b.count - a.count || a.label.localeCompare(b.label, "ko");
          }

          return b.count - a.count || b.recentAt - a.recentAt || getAdminTagStatusOrder(a.status) - getAdminTagStatusOrder(b.status) || a.label.localeCompare(b.label, "ko");
        })
        .slice(0, 16);
    }

    function getAdminPromptsByTag(tagKey) {
      const normalizedTag = normalizeTag(tagKey || "");
      if (!normalizedTag) return [];

      return getUniquePrompts([...popularPrompts, ...savedPrompts])
        .filter((prompt) => (prompt.tags || []).some((tag) => normalizeTag(tag) === normalizedTag))
        .sort((a, b) => getPromptCreatedAt(b) - getPromptCreatedAt(a));
    }

    function getTagStats() {
      const stats = new Map();

      [...popularPrompts, ...savedPrompts].forEach((prompt) => {
        const usedAt = new Date(getPromptCreatedAt(prompt) || 0).getTime() || 0;
        (prompt.tags || []).forEach((tag) => {
          const key = normalizeTag(tag);
          if (!key) return;

          const current = stats.get(key) || { count: 0, recentAt: 0 };
          stats.set(key, {
            count: current.count + 1,
            recentAt: Math.max(current.recentAt, usedAt),
          });
        });
      });

      return stats;
    }

    function getAdminUserActivity(nickname) {
      const cleanNickname = String(nickname || "").trim();
      const normalizedNickname = normalizeAdminSearchText(cleanNickname);
      const backendActivity = state.backendAdminUserActivities[normalizedNickname];
      if (backendActivity) return backendActivity;
      const prompts = getUniquePrompts([...state.backendAdminPrompts, ...popularPrompts, ...savedPrompts])
        .filter((prompt) => normalizeAdminSearchText(getDisplayPromptAuthor(prompt)) === normalizedNickname)
        .map((prompt) => ({
          title: prompt.title,
          preview: makePreview(prompt.text),
          promptId: prompt.id,
        }));

      const comments = [];
      const replies = [];
      getUniquePrompts([...state.backendAdminPrompts, ...popularPrompts, ...savedPrompts]).forEach((prompt) => {
        getSortedPromptComments(prompt.id).forEach((comment) => {
          if (normalizeAdminSearchText(comment.author || comment.owner) === normalizedNickname) {
            comments.push({
              title: prompt.title,
              preview: comment.deleted ? "삭제된 댓글입니다." : makePreview(comment.text),
              promptId: prompt.id,
              commentId: comment.id,
            });
          }
          (comment.replies || []).forEach((reply) => {
            if (normalizeAdminSearchText(reply.author || reply.owner) === normalizedNickname) {
              replies.push({
                title: prompt.title,
                preview: reply.deleted ? "삭제된 댓글입니다." : makePreview(reply.text),
                promptId: prompt.id,
                commentId: reply.id,
              });
            }
          });
        });
      });

      const reportRecords = getAdminReportRecords();
      const reportsMade = reportRecords
        .filter((record) => normalizeAdminSearchText(record.reporter) === normalizedNickname)
        .map((record) => ({
          title: record.type === "comment" ? `댓글 신고 · ${record.contextTitle || "게시물 확인 필요"}` : record.title,
          preview: record.summary || record.targetPreview || "신고 내용 확인 필요",
          promptId: record.promptId,
          commentId: record.type === "comment" ? record.targetId : "",
        }));
      const reportsReceived = reportRecords
        .filter((record) => {
          const promptAuthor = normalizeAdminSearchText(record.promptAuthor);
          const commentAuthor = normalizeAdminSearchText(record.commentAuthor);
          return promptAuthor === normalizedNickname || commentAuthor === normalizedNickname;
        })
        .map((record) => ({
          title: record.type === "comment" ? `댓글 신고 · ${record.contextTitle || "게시물 확인 필요"}` : record.title,
          preview: record.targetPreview || record.summary || "신고 대상 확인 필요",
          promptId: record.promptId,
          commentId: record.type === "comment" ? record.targetId : "",
        }));

      return {
        nickname: cleanNickname,
        prompts,
        comments,
        replies,
        reportsMade,
        reportsReceived,
      };
    }

    function getReportRecord(key) {
      return state.reportRecords[key] || { status: "pending" };
    }

    function mapBackendReportStatus(status) {
      const normalized = String(status || "pending").toLowerCase();
      if (normalized === "reviewed") return "reviewed";
      if (["resolved", "done", "completed", "complete"].includes(normalized)) return "resolved";
      if (["dismissed", "rejected", "reject"].includes(normalized)) return "dismissed";
      return "pending";
    }

    function mapFrontendReportStatus(status) {
      if (status === "reviewed") return "reviewed";
      if (status === "resolved") return "resolved";
      if (status === "dismissed") return "dismissed";
      return "pending";
    }

    function makeRevisionRequestKey(type, id) {
      return `${type}:${id}`;
    }

    function getPromptRevisionRequest(promptId) {
      return state.adminPromptRevisionRequests[makeRevisionRequestKey("prompt", promptId)] || state.adminPromptRevisionRequests[promptId] || null;
    }

    function getRevisionRequestTarget(key) {
      const value = String(key || "");
      const separatorIndex = value.indexOf(":");
      const type = separatorIndex > 0 ? value.slice(0, separatorIndex) : "prompt";
      const id = separatorIndex > 0 ? value.slice(separatorIndex + 1) : value;

      if (type === "comment") {
        const comment = findCommentById(id);
        if (!comment) return null;
        return {
          type,
          id,
          key: makeRevisionRequestKey(type, id),
          title: "댓글 수정 요청",
          text: comment.text,
          owner: comment.owner || comment.author,
        };
      }

      const prompt = findPromptById(id);
      if (!prompt) return null;
      return {
        type: "prompt",
        id,
        key: makeRevisionRequestKey("prompt", id),
        title: prompt.title,
        text: prompt.text,
        owner: prompt.owner || prompt.author,
      };
    }

    function isRevisionTargetOwnedByCurrentUser(target) {
      if (!target) return false;
      const owner = target.owner;
      return owner === "나" || owner === state.currentUser;
    }

    function getAdminReportRecords() {
      if (state.backendAdminReportsLoaded) {
        return state.backendAdminReports.map((report) => {
          const prompt = report.promptId ? findPromptById(report.promptId) : report.type === "prompt" ? findPromptById(report.targetId) : null;
          const record = getReportRecord(report.key);
          return {
            key: report.key,
            type: report.type,
            targetId: report.targetId,
            promptId: report.promptId || prompt?.id || "",
            status: record.status || mapBackendReportStatus(report.status),
            title: report.type === "comment" ? "댓글 신고" : (report.title || prompt?.title || "프롬프트 신고"),
            contextTitle: report.contextTitle || prompt?.title || "게시물 확인 필요",
            reporter: report.reporter || report.raw?.reporterNickname || report.raw?.reporter?.nickname || record.reporter || "",
            promptAuthor: prompt ? getDisplayPromptAuthor(prompt) : report.promptAuthor || "",
            commentAuthor: report.commentAuthor || report.targetAuthor || "",
            targetPreview: report.targetPreview || makePreview(prompt?.text || ""),
            summary: report.reason ? `신고 사유: ${report.reason}` : report.summary || "신고 사유 없음",
          };
        }).sort((a, b) => Number(getReportRecord(b.key).createdAt || 0) - Number(getReportRecord(a.key).createdAt || 0));
      }

      const records = [];
      [...state.reportedPromptIds].forEach((promptId) => {
        const prompt = findPromptById(promptId);
        const key = `prompt:${promptId}`;
        const record = getReportRecord(key);
        records.push({
          key,
          type: "prompt",
          targetId: promptId,
          promptId,
          status: record.status || "pending",
          title: prompt?.title || "삭제된 프롬프트",
          reporter: record.reporter || "",
          promptAuthor: prompt ? getDisplayPromptAuthor(prompt) : "",
          summary: record.reason || makePreview(prompt?.text || ""),
        });
      });
      [...state.reportedCommentIds].forEach((commentId) => {
        const context = findCommentContextById(commentId);
        const comment = context?.comment || findCommentById(commentId);
        const key = `comment:${commentId}`;
        const record = getReportRecord(key);
        const prompt = context?.prompt || findPromptById(record.promptId);
        records.push({
          key,
          type: "comment",
          targetId: commentId,
          promptId: record.promptId || context?.promptId || "",
          status: record.status || "pending",
          title: "댓글 신고",
          contextTitle: prompt?.title || "삭제된 게시물",
          reporter: record.reporter || "",
          promptAuthor: prompt ? getDisplayPromptAuthor(prompt) : "",
          commentAuthor: record.targetAuthor || comment?.author || comment?.owner || "",
          targetPreview: record.targetPreview || makePreview(comment?.text || "삭제된 댓글"),
          summary: record.reason ? `신고 사유: ${record.reason}` : "신고 사유 없음",
        });
      });
      return records.sort((a, b) => Number(getReportRecord(b.key).createdAt || 0) - Number(getReportRecord(a.key).createdAt || 0));
    }

    function getReportStatusLabel(status) {
      if (status === "revision-requested") return "수정 요청됨";
      if (status === "dismissed") return "기각";
      if (status === "reviewed") return "검토 완료";
      if (status === "resolved") return "처리 완료";
      return "접수";
    }

    function isFinalReportStatus(status) {
      return ["resolved", "dismissed"].includes(String(status || "").toLowerCase());
    }

    function getAuthorRevisionStatusLabel(status) {
      if (status === "acknowledged") return "작성자 확인됨";
      if (status === "completed") return "수정 완료";
      if (status === "rejected") return "작성자 거절";
      return "대기 중";
    }

    function matchesAdminPromptQuery(prompt, query) {
      const normalizedQuery = normalizeAdminSearchText(query);
      if (!normalizedQuery) return true;

      const visibility = state.adminHiddenPromptIds.has(prompt.id)
        ? "숨김 hidden"
        : prompt.isShared || prompt.source === "community"
          ? "공유 공개 shared public"
          : "비공개 private";
      const source = prompt.source === "mine" ? "내 프롬프트 mine" : "커뮤니티 다른 사용자 community";
      const haystack = normalizeAdminSearchText(
        [prompt.title, prompt.text, prompt.author, source, visibility, ...(prompt.tags || [])].join(" "),
      );

      return normalizedQuery
        .split(/\s+/)
        .filter(Boolean)
        .every((token) => haystack.includes(token));
    }

    function matchesAdminPromptFilter(prompt, filter) {
      if (filter === "shared") return Boolean(prompt.isShared || prompt.source === "community");
      if (filter === "private") return prompt.source === "mine" && !prompt.isShared;
      if (filter === "hidden") return state.adminHiddenPromptIds.has(prompt.id);
      if (filter === "reported") return state.reportedPromptIds.has(prompt.id);
      return true;
    }

    function getAdminTagStatus(tag) {
      return resolveAdminTagStatus(state.adminTagDecisions, tag, normalizeTag);
    }

    return Object.freeze({ getAdminManagedTags, getAdminPromptsByTag, getTagStats, getAdminUserActivity, getReportRecord, mapBackendReportStatus, mapFrontendReportStatus, makeRevisionRequestKey, getPromptRevisionRequest, getRevisionRequestTarget, isRevisionTargetOwnedByCurrentUser, getAdminReportRecords, getReportStatusLabel, isFinalReportStatus, getAuthorRevisionStatusLabel, matchesAdminPromptQuery, matchesAdminPromptFilter, getAdminTagStatus });
  }
export { createAdminSelectors };
