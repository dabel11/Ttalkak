// @ts-check
import * as core from "./core-api.mjs";
import { normalizers } from "./normalizers.mjs";
import { createAuthApi } from "./auth-api.mjs";
import { createPromptApi } from "./prompt-api.mjs";
import { createCommentApi } from "./comment-api.mjs";
import { createMyPageApi } from "./mypage-api.mjs";
import { createMakeApi } from "./make-api.mjs";
import { createAdminApi } from "./admin-api.mjs";
import * as apiContract from "./api-contract.mjs";

const context = Object.freeze({ request: core.request, unwrapItems: core.unwrapItems, unwrapPageMeta: core.unwrapPageMeta, normalizers });
const rawApi = /** @type {TtalkakApi} */ (/** @type {unknown} */ ({
  request: core.request,
  normalizePrompt: normalizers.normalizePrompt,
  ...createAuthApi(context),
  ...createPromptApi(context),
  ...createCommentApi(context),
  ...createMyPageApi(context),
  ...createMakeApi(context),
  ...createAdminApi(context),
}));

export const api = /** @type {TtalkakApi} */ (apiContract.wrapApiResponses(rawApi));
export { apiContract };
