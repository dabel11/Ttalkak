(function () {
  const { unwrapItems } = window.TTALKAK_API_CORE;
  const { migrateMakeMessage, migrateMakeMessages } = window.TtalkakMakeMessageModel;

  function normalizeTags(value) {
    if (Array.isArray(value)) {
      return value
        .map((tag) => {
          if (typeof tag === "string") return tag;
          return tag?.name || tag?.tagName || tag?.label || tag?.title || "";
        })
        .map((tag) => String(tag).replace(/^#+/, "").trim())
        .filter(Boolean);
    }

    if (typeof value === "string") {
      return value
        .split(/[,\s]+/)
        .map((tag) => tag.replace(/^#+/, "").trim())
        .filter(Boolean);
    }

    return [];
  }

  function toNumber(...values) {
    for (const value of values) {
      const numberValue = Number(value);
      if (Number.isFinite(numberValue)) return numberValue;
    }
    return 0;
  }

  function toTimestamp(...values) {
    for (const value of values) {
      if (Number.isFinite(Number(value))) return Number(value);
      const time = Date.parse(value);
      if (Number.isFinite(time)) return time;
    }
    return Date.now();
  }

  function normalizeAuthor(value, fallback = "익명 사용자") {
    if (!value) return fallback;
    if (typeof value === "string") return value.trim() || fallback;
    return String(
      value.nickname ||
        value.authorNickname ||
        value.name ||
        value.username ||
        value.userId ||
        value.id ||
        fallback,
    ).trim() || fallback;
  }

  function normalizePrompt(item, index = 0) {
    const rawText = item?.text || item?.prompt || item?.content || item?.body || item?.description || "";
    const text = String(rawText || item?.title || "프롬프트 내용을 불러오지 못했습니다.").trim();
    const title = String(item?.title || item?.name || text.split(/\n/)[0] || "프롬프트").trim();
    const author =
      item?.authorNickname ||
      item?.nickname ||
      item?.writerNickname ||
      item?.authorName ||
      item?.author ||
      item?.writer ||
      item?.username ||
      "작성자";
    const normalizedAuthor = normalizeAuthor(author, "작성자");

    return {
      id: String(item?.id || item?.promptId || item?.prompt_id || item?.uuid || `backend-prompt-${index}`),
      title,
      text,
      tags: normalizeTags(item?.tags || item?.hashtags || item?.hashTags || item?.tagNames),
      views: toNumber(item?.views, item?.viewCount, item?.viewsCount),
      comments: toNumber(item?.comments, item?.commentCount, item?.commentsCount),
      saves: toNumber(item?.saves, item?.saveCount, item?.savedCount, item?.bookmarkCount),
      likes: toNumber(item?.likes, item?.likeCount, item?.likedCount),
      author: normalizedAuthor,
      authorId: String(item?.author?.id || item?.authorId || item?.memberId || item?.writerId || ""),
      owner: normalizeAuthor(item?.owner, normalizedAuthor),
      source: item?.source || (item?.mine || item?.isMine ? "mine" : "community"),
      isShared: item?.isShared ?? item?.shared ?? item?.public ?? true,
      createdAt: toTimestamp(item?.createdAt, item?.createdDate, item?.publishedAt, item?.updatedAt),
      savedByMe: Boolean(item?.savedByMe || item?.isSaved || item?.bookmarkedByMe),
      likedByMe: Boolean(item?.likedByMe || item?.isLiked),
      raw: item,
    };
  }

  function normalizeComment(item, index = 0) {
    const prompt = item?.prompt && typeof item.prompt === "object" ? normalizePrompt(item.prompt) : null;
    const author = item?.author?.nickname || item?.authorNickname || item?.nickname || item?.author || "익명 사용자";
    return {
      id: String(item?.id || item?.commentId || `backend-comment-${index}`),
      promptId: item?.promptId ? String(item.promptId) : "",
      parentId: item?.parentId ? String(item.parentId) : null,
      author: normalizeAuthor(author, "사용자"),
      owner: normalizeAuthor(author, "사용자"),
      text: String(item?.deleted || item?.isDeleted ? "삭제된 댓글입니다." : item?.text || item?.content || ""),
      likes: toNumber(item?.likes, item?.likeCount),
      edited: Boolean(item?.edited || item?.isEdited),
      deleted: Boolean(item?.deleted || item?.isDeleted),
      hidden: Boolean(item?.hidden || item?.isHidden),
      likedByMe: Boolean(item?.likedByMe || item?.isLiked),
      isReported: Boolean(item?.isReported || item?.reportedByMe),
      createdAt: toTimestamp(item?.createdAt, item?.createdDate),
      promptTitle: item?.promptTitle || prompt?.title || "",
      prompt,
      replies: unwrapItems(item?.replies).map((reply, replyIndex) => normalizeComment(reply, replyIndex)),
      raw: item,
    };
  }

  function normalizePopularTag(item) {
    if (typeof item === "string") return item.replace(/^#+/, "").trim();
    return String(item?.name || item?.tagName || item?.label || item?.title || "").replace(/^#+/, "").trim();
  }

  function normalizeAdminTag(item, index = 0) {
    const label = normalizePopularTag(item) || `tag-${index}`;
    const rawStatus = String(item?.status || "pending").toLowerCase();
    const status = ["approved", "rejected", "pending", "disabled"].includes(rawStatus) ? rawStatus : "pending";
    return {
      id: String(item?.id || item?.tagId || label),
      key: label.replace(/^#+/, "").trim().toLowerCase(),
      label,
      status,
      count: toNumber(item?.useCount, item?.count, item?.usageCount),
      recentAt: toTimestamp(item?.createdAt, item?.updatedAt),
      raw: item,
    };
  }

  function normalizeRevisionRequest(item, index = 0) {
    const prompt = item?.prompt && typeof item.prompt === "object" ? normalizePrompt(item.prompt) : null;
    const targetType = String(item?.targetType || item?.type || (item?.commentId ? "comment" : "prompt")).toLowerCase();
    return {
      id: String(item?.id || item?.requestId || item?.revisionRequestId || `backend-revision-${index}`),
      key: `${targetType}:${item?.targetId || item?.promptId || item?.commentId || prompt?.id || item?.id || index}`,
      type: targetType,
      targetId: String(item?.targetId || item?.promptId || item?.commentId || prompt?.id || ""),
      promptId: String(item?.promptId || prompt?.id || ""),
      status: String(item?.status || "pending").toLowerCase(),
      reason: String(item?.reason || item?.memo || item?.adminMemo || item?.message || ""),
      requestedAt: toTimestamp(item?.requestedAt, item?.createdAt, item?.createdDate),
      reviewedAt: item?.reviewedAt ? toTimestamp(item.reviewedAt) : 0,
      prompt,
      raw: item,
    };
  }

  function normalizeAdminUserActivity(payload) {
    const data = payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
    const member = data.member || data.user || {};
    const activities = unwrapItems(data.activities || data.items || data.content);
    const nickname = normalizeAuthor(member, data.nickname || data.memberNickname || "사용자");
    const memberId = member.id || member.memberId || data.memberId || data.userId || data.id || "";
    const blocked = Boolean(member.blocked ?? member.isBlocked ?? data.blocked ?? data.isBlocked ?? false);
    const groups = { prompts: [], comments: [], replies: [], reportsMade: [], reportsReceived: [] };

    activities.forEach((activity) => {
      const type = String(activity?.type || "").toLowerCase();
      const item = {
        title: String(activity?.title || activity?.promptTitle || activity?.targetTitle || type || "활동"),
        preview: String(activity?.preview || activity?.text || activity?.content || activity?.reason || ""),
        promptId: activity?.promptId ? String(activity.promptId) : "",
        commentId: activity?.commentId || activity?.id ? String(activity.commentId || activity.id) : "",
        occurredAt: toTimestamp(activity?.occurredAt, activity?.createdAt, activity?.updatedAt),
        raw: activity,
      };

      if (type === "prompt") groups.prompts.push(item);
      else if (type === "comment") groups.comments.push(item);
      else if (type === "reply") groups.replies.push(item);
      else if (type === "report" || type === "report_made") groups.reportsMade.push(item);
      else if (type === "reported" || type === "report_received") groups.reportsReceived.push(item);
    });

    return {
      nickname,
      memberId: String(memberId || ""),
      blocked,
      blockReason: String(member.blockReason || data.blockReason || data.reason || ""),
      summary: data.summary || {},
      ...groups,
      raw: data,
    };
  }

  function normalizeAdminUser(item, index = 0) {
    const data = item?.data && typeof item.data === "object" ? item.data : item || {};
    return {
      id: String(data.id || data.memberId || data.userId || `admin-user-${index}`),
      nickname: normalizeAuthor(data, data.nickname || data.memberNickname || data.name || "사용자"),
      active: Boolean(data.active ?? data.enabled ?? !data.withdrawn),
      blocked: Boolean(data.blocked ?? data.isBlocked ?? false),
      raw: data,
    };
  }

  function normalizeAdminUserActivitySummary(payload) {
    const data = payload?.data && typeof payload.data === "object" ? payload.data : payload || {};
    const user = normalizeAdminUser(data.user || data.member || data);
    const counts = data.counts || data.summary || {};
    return {
      nickname: user.nickname,
      memberId: user.id,
      blocked: user.blocked,
      active: user.active,
      summary: counts,
      prompts: [],
      comments: [],
      replies: [],
      reportsMade: [],
      reportsReceived: [],
      raw: data,
    };
  }

  function makePreviewText(value, maxLength = 80) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength).trim()}...`;
  }

  function normalizeAdminUserPromptActivity(item, index = 0) {
    const prompt = normalizePrompt(item, index);
    return {
      title: prompt.title,
      preview: String(item?.preview || makePreviewText(prompt.text)),
      promptId: prompt.id,
      commentId: "",
      occurredAt: prompt.createdAt,
      raw: item,
    };
  }

  function normalizeAdminUserCommentActivity(item, index = 0) {
    const comment = normalizeComment(item, index);
    return {
      title: String(item?.promptTitle || item?.prompt?.title || comment.promptTitle || "댓글"),
      preview: comment.deleted ? "삭제된 댓글입니다." : makePreviewText(comment.text),
      promptId: String(item?.promptId || item?.prompt?.id || comment.promptId || ""),
      commentId: comment.id,
      occurredAt: comment.createdAt,
      raw: item,
    };
  }

  function normalizeReport(item, index = 0) {
    const targetType = String(item?.targetType || item?.type || "prompt").toLowerCase();
    const prompt = item?.prompt && typeof item.prompt === "object" ? normalizePrompt(item.prompt) : null;
    const reporter = item?.reporter || item?.reporterNickname || item?.reporterName || "";
    const targetAuthor = item?.targetAuthor || item?.targetAuthorNickname || item?.commentAuthorNickname || item?.promptAuthorNickname || item?.author || "";
    const commentAuthor =
      targetType === "comment"
        ? item?.commentAuthor || item?.commentAuthorNickname || item?.author || item?.authorNickname || targetAuthor
        : item?.commentAuthor || item?.commentAuthorNickname || "";
    return {
      id: String(item?.id || item?.reportId || `backend-report-${index}`),
      key: `${targetType}:${item?.targetId || item?.promptId || item?.commentId || item?.id || index}`,
      type: targetType,
      targetId: String(item?.targetId || item?.promptId || item?.commentId || ""),
      promptId: item?.promptId ? String(item.promptId) : prompt?.id || "",
      status: String(item?.status || "pending").toLowerCase(),
      reason: item?.reason || "",
      memo: item?.memo || "",
      reviewedAt: item?.reviewedAt ? toTimestamp(item.reviewedAt) : 0,
      createdAt: toTimestamp(item?.createdAt, item?.createdDate),
      title: item?.title || item?.targetTitle || item?.promptTitle || prompt?.title || "",
      contextTitle: item?.contextTitle || item?.promptTitle || prompt?.title || "",
      summary: item?.summary || item?.description || "",
      targetPreview: item?.targetPreview || item?.commentText || item?.targetText || item?.promptText || item?.text || prompt?.text || "",
      reporter: normalizeAuthor(reporter, ""),
      targetAuthor: normalizeAuthor(targetAuthor, ""),
      promptAuthor: normalizeAuthor(item?.promptAuthor || item?.promptAuthorNickname || prompt?.author || "", ""),
      commentAuthor: normalizeAuthor(commentAuthor, ""),
      raw: item,
    };
  }

  function normalizeAdminUserReportActivity(item, index = 0) {
    const report = normalizeReport(item, index);
    return {
      title: report.type === "comment" ? `댓글 신고 · ${report.contextTitle || report.title || "게시물 확인 필요"}` : report.title || "프롬프트 신고",
      preview: String(report.reason || report.targetPreview || report.summary || "신고 내용 확인 필요"),
      promptId: report.promptId,
      commentId: report.type === "comment" ? report.targetId : "",
      occurredAt: report.createdAt,
      raw: item,
    };
  }

  function getPageItems(payload) {
    return unwrapItems(payload);
  }

  function normalizeAdminAuditLog(item, index = 0) {
    const actor = item?.actor || item?.admin || item?.member || {};
    return {
      id: String(item?.id || item?.auditLogId || `audit-${index}`),
      action: String(item?.action || item?.event || item?.type || ""),
      targetType: String(item?.targetType || item?.resourceType || item?.domain || ""),
      targetId: String(item?.targetId || item?.resourceId || item?.promptId || item?.commentId || item?.memberId || ""),
      actor: normalizeAuthor(actor, item?.actorNickname || item?.adminNickname || item?.memberNickname || "관리자"),
      memo: String(item?.detail || item?.memo || item?.reason || item?.message || item?.description || ""),
      createdAt: toTimestamp(item?.createdAt, item?.loggedAt, item?.timestamp),
      raw: item,
    };
  }

  function normalizeMakeMessage(item, index = 0) {
    return migrateMakeMessage({ ...item, id: item?.id || item?.messageId || `backend-message-${index}`, createdAt: toTimestamp(item?.createdAt, item?.createdDate, item?.timestamp), raw: item }, index);
  }

  function normalizeMakeThread(item, index = 0) {
    const messages = migrateMakeMessages(unwrapItems(item?.messages || item?.chatMessages || item?.conversation).map(normalizeMakeMessage));
    const lastMessage = messages[messages.length - 1];
    const serverId = item?.id || item?.threadId || item?.conversationId || "";
    return {
      id: String(serverId || `backend-thread-${index}`),
      serverId: serverId ? String(serverId) : "",
      title: String(item?.title || item?.name || messages.find((message) => message.role === "user")?.content || "대화").trim(),
      preview: String(item?.preview || item?.summary || lastMessage?.content || "").trim(),
      folderId: item?.folderId || item?.folder?.id || "uncategorized",
      createdAt: toTimestamp(item?.createdAt, item?.createdDate, item?.updatedAt),
      messages,
      raw: item,
    };
  }

  function normalizeMakeFolder(item, index = 0) {
    const serverId = item?.id || item?.folderId || "";
    return {
      id: String(serverId || `backend-folder-${index}`),
      serverId: serverId ? String(serverId) : "",
      name: String(item?.name || item?.title || "폴더").trim(),
      raw: item,
    };
  }

  function normalizeImproveResult(payload, fallbackPrompt = "") {
    return window.TtalkakMakeMessageModel.normalizeImproveResponse(payload, fallbackPrompt);
  }

  window.TTALKAK_API_NORMALIZERS = {
    normalizeTags,
    toNumber,
    toTimestamp,
    normalizeAuthor,
    normalizePrompt,
    normalizeComment,
    normalizePopularTag,
    normalizeAdminTag,
    normalizeRevisionRequest,
    normalizeAdminUserActivity,
    normalizeAdminUser,
    normalizeAdminUserActivitySummary,
    normalizeAdminUserPromptActivity,
    normalizeAdminUserCommentActivity,
    normalizeAdminUserReportActivity,
    makePreviewText,
    getPageItems,
    normalizeAdminAuditLog,
    normalizeReport,
    normalizeMakeMessage,
    normalizeMakeThread,
    normalizeMakeFolder,
    normalizeImproveResult,
  };
})();
