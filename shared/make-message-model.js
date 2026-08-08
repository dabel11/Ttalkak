import "../prompt-hub-web-frontend/src/utils/make-message-model.js";

const MakeMessageModel = globalThis.TtalkakMakeMessageModel;

if (!MakeMessageModel) throw new Error("Shared Make message model failed to load.");

export default MakeMessageModel;
export const {
  buildImproveHistory,
  classifyMakeError,
  composeAskAnswers,
  isExecutableMessage,
  migrateMakeMessage,
  migrateMakeMessages,
  normalizeChanges,
  normalizeFields,
  normalizeImproveResponse,
  normalizeQuestions,
  normalizeTechniques,
  parseLegacyQuestions,
} = MakeMessageModel;
