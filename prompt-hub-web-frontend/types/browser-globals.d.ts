type TtalkakId = string | number;
type TtalkakToken = string | undefined;
type TtalkakPayload = Record<string, unknown>;
type TtalkakCallableModule = Record<string, Function>;
type TtalkakStateModule = TtalkakCallableModule & {
  STORAGE_KEY: string;
  AUTH_TOKEN_KEY: string;
  DEMO_AUTH_TOKEN: string;
};
type TtalkakRecord = Record<string, unknown>;
interface TtalkakApiNormalizers {
  normalizeTags(value: unknown): string[];
  toNumber(...values: unknown[]): number;
  toTimestamp(...values: unknown[]): number;
  normalizeAuthor(...values: unknown[]): unknown;
  normalizePrompt(value: unknown): TtalkakRecord;
  normalizeComment(value: unknown): TtalkakRecord;
  normalizePopularTag(value: unknown): TtalkakRecord;
  normalizeAdminTag(value: unknown): TtalkakRecord;
  normalizeRevisionRequest(value: unknown): TtalkakRecord;
  normalizeAdminUserActivity(value: unknown): TtalkakRecord;
  normalizeAdminUser(value: unknown): TtalkakRecord;
  normalizeAdminUserActivitySummary(value: unknown): TtalkakRecord;
  normalizeAdminUserPromptActivity(value: unknown): TtalkakRecord;
  normalizeAdminUserCommentActivity(value: unknown): TtalkakRecord;
  normalizeAdminUserReportActivity(value: unknown): TtalkakRecord;
  makePreviewText(...values: unknown[]): string;
  getPageItems(value: unknown): TtalkakRecord[];
  normalizeAdminAuditLog(value: unknown): TtalkakRecord;
  normalizeReport(value: unknown): TtalkakRecord;
  normalizeMakeMessage(value: unknown): TtalkakRecord;
  normalizeMakeThread(value: unknown): TtalkakRecord;
  normalizeMakeFolder(value: unknown): TtalkakRecord;
  normalizeImproveResult(...values: unknown[]): TtalkakRecord;
}
interface TtalkakApiCore {
  request(path: string, options?: RequestInit & { token?: string }): Promise<TtalkakRecord | TtalkakRecord[] | null>;
  unwrapItems(payload: unknown): TtalkakRecord[];
  unwrapPageMeta(payload: unknown): Record<string, unknown>;
}
interface TtalkakApiContext {
  request: TtalkakApiCore["request"];
  unwrapItems: TtalkakApiCore["unwrapItems"];
  unwrapPageMeta: TtalkakApiCore["unwrapPageMeta"];
  normalizers: TtalkakApiNormalizers;
}

interface TtalkakApi {
  login(payload: TtalkakPayload): Promise<unknown>;
  signup(payload: TtalkakPayload): Promise<unknown>;
  googleLogin(credential: string): Promise<unknown>;
  findId(payload: TtalkakPayload): Promise<unknown>;
  requestPasswordReset(payload: TtalkakPayload): Promise<unknown>;
  withdrawAccount(payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  checkUserId(userId: string): Promise<unknown>;
  checkNickname(nickname: string): Promise<unknown>;
  getCommunityPosts(options?: TtalkakPayload): Promise<unknown>;
  searchCommunityPosts(options?: TtalkakPayload): Promise<unknown>;
  getPopularTags(options?: TtalkakPayload): Promise<unknown>;
  searchTags(options?: TtalkakPayload): Promise<unknown>;
  proposeTag(payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  viewPrompt(promptId: TtalkakId): Promise<unknown>;
  improvePrompt(payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  savePrompt(promptId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  unsavePrompt(promptId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  likePrompt(promptId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  unlikePrompt(promptId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  getMakeThreads(token: TtalkakToken): Promise<unknown>;
  getMakeThread(threadId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  getMakeFolders(token: TtalkakToken): Promise<unknown>;
  createMakeThread(payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  deleteMakeThread(threadId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  createMakeFolder(payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  updateMakeFolder(folderId: TtalkakId, payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  deleteMakeFolder(folderId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  moveMakeThread(threadId: TtalkakId, payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  sharePrompt(payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  shareExistingPrompt(promptId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  updatePrompt(promptId: TtalkakId, payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  deletePrompt(promptId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  unsharePrompt(promptId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  reportPrompt(promptId: TtalkakId, payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  reportComment(commentId: TtalkakId, payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  getPromptComments(promptId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  addComment(promptId: TtalkakId, payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  addReply(commentId: TtalkakId, payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  updateComment(commentId: TtalkakId, payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  deleteComment(commentId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  likeComment(commentId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  unlikeComment(commentId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  getSavedPrompts(options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  getMyLibrary(options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  getMyPrompts(options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  getMyComments(options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  getMyReports(options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  getMyRevisionRequests(options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  requestPromptRevision(promptId: TtalkakId, payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  getAdminReports(options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  updateAdminReportStatus(reportId: TtalkakId, status: string, token: TtalkakToken, memo?: string): Promise<unknown>;
  getAdminPrompts(options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  getAdminTags(options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  updateAdminTagStatus(tagId: TtalkakId, status: string, token: TtalkakToken): Promise<unknown>;
  searchAdminUsers(options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  getAdminUserActivitySummary(memberId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  getAdminUserPrompts(memberId: TtalkakId, options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  getAdminUserComments(memberId: TtalkakId, options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  getAdminUserReplies(memberId: TtalkakId, options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  getAdminUserSubmittedReports(memberId: TtalkakId, options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  getAdminUserReceivedReports(memberId: TtalkakId, options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  getAdminUserActivity(memberId: TtalkakId, options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  blockAdminUser(memberId: TtalkakId, payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  unblockAdminUser(memberId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  getAdminAuditLogs(options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  getAdminRevisionRequests(options: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  requestAuthorRevision(promptId: TtalkakId, payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  updateAuthorRevisionRequest(requestId: TtalkakId, payload: TtalkakPayload, token: TtalkakToken): Promise<unknown>;
  updateAdminRevisionRequestStatus(requestId: TtalkakId, status: string, token: TtalkakToken, memo?: string): Promise<unknown>;
  hideAdminComment(commentId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  unhideAdminComment(commentId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  deleteAdminComment(commentId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  hideAdminPrompt(promptId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  restoreAdminPrompt(promptId: TtalkakId, token: TtalkakToken): Promise<unknown>;
  [method: string]: unknown;
}

interface Window {
  __API_BASE_URL__?: string;
  TTALKAK_API_BASE_URL?: string;
  TTALKAK_API_TIMEOUT_MS?: number | string;
  TTALKAK_API_CORE: TtalkakApiCore;
  TTALKAK_API_NORMALIZERS: TtalkakApiNormalizers;
  TTALKAK_AUTH_API: (context: TtalkakApiContext) => TtalkakCallableModule;
  TTALKAK_PROMPT_API: (context: TtalkakApiContext) => TtalkakCallableModule;
  TTALKAK_COMMENT_API: (context: TtalkakApiContext) => TtalkakCallableModule;
  TTALKAK_MYPAGE_API: (context: TtalkakApiContext) => TtalkakCallableModule;
  TTALKAK_MAKE_API: (context: TtalkakApiContext) => TtalkakCallableModule;
  TTALKAK_ADMIN_API: (context: TtalkakApiContext) => TtalkakCallableModule;
  TtalkakMakeMessageModel: TtalkakCallableModule;
  TTALKAK_API: TtalkakApi;
  TtalkakApiContract: {
    assertApiContract(api: unknown): TtalkakApi;
    assertRecordResponse(value: unknown, operation?: string): Record<string, unknown>;
    assertCollectionResponse(value: unknown, operation?: string): unknown[];
    validateApiResponse(method: string, value: unknown): unknown;
    wrapApiResponses(api: TtalkakApi): TtalkakApi;
  };
  TTALKAK_GOOGLE_CREDENTIAL?: string;
  TtalkakUtils: TtalkakCallableModule;
  TtalkakHomeSearchModel: TtalkakCallableModule;
  TtalkakHomeController: TtalkakCallableModule;
  TtalkakHomeEvents: TtalkakCallableModule;
  TtalkakPromptEngagementController: TtalkakCallableModule;
  TtalkakPromptEngagementEvents: TtalkakCallableModule;
  TtalkakCommentModel: TtalkakCallableModule;
  TtalkakCommentView: TtalkakCallableModule;
  TtalkakPromptWorkflows: TtalkakCallableModule;
  TtalkakShareController: TtalkakCallableModule;
  TtalkakShareEvents: TtalkakCallableModule;
  TtalkakModalController: TtalkakCallableModule;
  TtalkakModalEvents: TtalkakCallableModule;
  TtalkakModalView: TtalkakCallableModule;
  TtalkakAuthSession: TtalkakCallableModule;
  TtalkakAuthValidation: TtalkakCallableModule;
  TtalkakAuthController: TtalkakCallableModule;
  TtalkakAuthEvents: TtalkakCallableModule;
  TtalkakAuthView: TtalkakCallableModule;
  TtalkakAdminEvents: TtalkakCallableModule;
  TtalkakAdminSelectors: TtalkakCallableModule;
  TtalkakAdminController: TtalkakCallableModule;
  TtalkakAdminView: TtalkakCallableModule;
  TtalkakAppBootstrap: TtalkakCallableModule;
  TtalkakMakeController: TtalkakCallableModule;
  TtalkakMakeEvents: TtalkakCallableModule;
  TtalkakMakeFocus: TtalkakCallableModule;
  TtalkakMakePersistence: TtalkakCallableModule;
  TtalkakMakeState: TtalkakCallableModule;
  TtalkakMakeWorkflows: TtalkakCallableModule;
  TtalkakMakeSyncWorkflows: TtalkakCallableModule;
  TtalkakMakeFolderWorkflows: TtalkakCallableModule;
  TtalkakMakeExecutionWorkflows: TtalkakCallableModule;
  TtalkakMakeRecentWorkflows: TtalkakCallableModule;
  TtalkakMakePreview: TtalkakCallableModule;
  TtalkakMakeFailureRecoveryEffects: TtalkakCallableModule;
  TtalkakMakeServerSyncEffects: TtalkakCallableModule;
  TtalkakComponents: TtalkakCallableModule;
  TtalkakEvents: TtalkakCallableModule;
  TtalkakMakeScrollEvents: TtalkakCallableModule;
  TtalkakBackendEffects: TtalkakCallableModule;
  TtalkakAdminEffects: TtalkakCallableModule;
  TtalkakErrorEffects: TtalkakCallableModule;
  TtalkakState: TtalkakStateModule;
  TtalkakRenderers: TtalkakCallableModule;
  TtalkakRouting: TtalkakCallableModule;
  TtalkakMakeMessageParts: TtalkakCallableModule;
  TTALKAK_DEMO_FALLBACK_ENABLED?: boolean;
  TTALKAK_DEMO_COPY?: {
    fallbackPopularTags?: string[];
    promptOverrides?: Record<string, string>;
    commentOverrides?: Record<string, string>;
  };
}

interface EventTarget {
  closest(selectors: string): Element | null;
}

interface Element {
  readonly dataset: DOMStringMap;
  value: string;
  checked: boolean;
  focus(options?: FocusOptions): void;
  setSelectionRange(start: number, end: number): void;
}

interface Event {
  readonly key: string;
}
