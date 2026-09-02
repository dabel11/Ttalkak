import * as common from "./normalizers/common.mjs";
import * as prompt from "./normalizers/prompt.mjs";
import * as comment from "./normalizers/comment.mjs";
import * as make from "./normalizers/make.mjs";
import * as admin from "./normalizers/admin.mjs";

export const normalizers = /** @type {TtalkakApiNormalizers} */ (/** @type {unknown} */ (Object.freeze({
  normalizeTags: common.normalizeTags,
  toNumber: common.toNumber,
  toTimestamp: common.toTimestamp,
  normalizeAuthor: common.normalizeAuthor,
  makePreviewText: common.makePreviewText,
  normalizePrompt: prompt.normalizePrompt,
  normalizePopularTag: prompt.normalizePopularTag,
  normalizeComment: comment.normalizeComment,
  normalizeAdminTag: admin.normalizeAdminTag,
  normalizeRevisionRequest: admin.normalizeRevisionRequest,
  normalizeAdminUserActivity: admin.normalizeAdminUserActivity,
  normalizeAdminUser: admin.normalizeAdminUser,
  normalizeAdminUserActivitySummary: admin.normalizeAdminUserActivitySummary,
  normalizeAdminUserPromptActivity: admin.normalizeAdminUserPromptActivity,
  normalizeAdminUserCommentActivity: admin.normalizeAdminUserCommentActivity,
  normalizeAdminUserReportActivity: admin.normalizeAdminUserReportActivity,
  getPageItems: admin.getPageItems,
  normalizeAdminAuditLog: admin.normalizeAdminAuditLog,
  normalizeReport: admin.normalizeReport,
  normalizeMakeMessage: make.normalizeMakeMessage,
  normalizeMakeThread: make.normalizeMakeThread,
  normalizeMakeFolder: make.normalizeMakeFolder,
  normalizeImproveResult: make.normalizeImproveResult,
})));
