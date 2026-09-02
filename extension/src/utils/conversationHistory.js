import { buildImproveHistory as buildSharedImproveHistory } from "../../../shared/make-message-model.js";

export function buildImproveHistory(messages = []) {
  return buildSharedImproveHistory(
    (Array.isArray(messages) ? messages : []).filter((message) => message && !message.isError && !message.excludeFromHistory),
  );
}
