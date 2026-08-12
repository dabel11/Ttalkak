// @ts-check
import { api as interactionState } from "./state-interaction.mjs";

  "use strict";

const interactionRemovePrompt = interactionState.removePromptByIdState;
if (typeof interactionRemovePrompt !== "function") throw new TypeError("State interaction domain is required");
const removePromptByIdState = /** @type {(list: TtalkakStateEntity[], promptId: TtalkakId) => void} */ (interactionRemovePrompt);

function applyExistingPromptSavedState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ promptId, /** @type {TtalkakStateEntity} */ savedPrompt) {
  const { state, upsertPrompt, updatePromptField } = ctx;
  savedPrompt.savedByMe = true;
  state.userLibraryPromptIds.add(promptId);
  state.backendLibraryPromptIds.add(promptId);
  if (state.myBackendStatus === "connected") {
    upsertPrompt(state.backendLibraryPrompts, { ...savedPrompt, savedByMe: true });
  }
  state.pendingUnsaveIds.delete(promptId);
  updatePromptField(promptId, "saves", 1);
}


function applyBackendPromptUnsavedState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ promptId, /** @type {TtalkakStateEntity} */ savedPrompt) {
  const { state, updatePromptField } = ctx;
  savedPrompt.savedByMe = false;
  state.pendingUnsaveIds.delete(promptId);
  state.userLibraryPromptIds.delete(promptId);
  state.backendLibraryPromptIds.delete(promptId);
  state.backendLibraryPrompts = state.backendLibraryPrompts.filter((prompt) => prompt.id !== promptId);
  updatePromptField(promptId, "saves", -1);
}


function togglePendingUnsaveState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ promptId) {
  const { state, updatePromptField } = ctx;
  if (state.pendingUnsaveIds.has(promptId)) {
    state.pendingUnsaveIds.delete(promptId);
    updatePromptField(promptId, "saves", 1);
    return "restored";
  }

  state.pendingUnsaveIds.add(promptId);
  updatePromptField(promptId, "saves", -1);
  return "pending";
}


function applyPromptUnsavedState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ promptId, /** @type {TtalkakStateEntity} */ savedPrompt, /** @type {number} */ savedIndex) {
  const { findPromptById, savedPrompts, state, updatePromptField } = ctx;
  if (savedPrompt.source === "mine") {
    savedPrompt.savedByMe = false;
  } else {
    savedPrompts.splice(savedIndex, 1);
  }
  state.userLibraryPromptIds.delete(promptId);
  state.backendLibraryPromptIds.delete(promptId);
  state.backendLibraryPrompts = state.backendLibraryPrompts.filter((prompt) => prompt.id !== promptId);
  updatePromptField(promptId, "saves", -1);
  if (state.detailPromptId === promptId && !findPromptById(promptId)) {
    state.detailPromptId = null;
  }
}


function applyNewPromptSavedState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ promptId, /** @type {TtalkakStateEntity} */ prompt) {
  const { findPromptById, savedPrompts, state, upsertPrompt, updatePromptField } = ctx;
  updatePromptField(promptId, "saves", 1);
  const updatedPrompt = findPromptById(promptId) || prompt;
  const normalized = {
    ...updatedPrompt,
    source: prompt.source === "mine" ? "mine" : "community",
    savedByMe: true,
  };

  savedPrompts.unshift(normalized);
  state.userLibraryPromptIds.add(promptId);
  state.backendLibraryPromptIds.add(promptId);
  if (state.myBackendStatus === "connected") {
    upsertPrompt(state.backendLibraryPrompts, normalized);
  }
}


function normalizeSavedPageState(/** @type {TtalkakApplicationState} */ state, /** @type {number} */ filteredCount, /** @type {number} */ pageSize) {
  const totalPages = Math.max(1, Math.ceil(filteredCount / pageSize));
  state.savedPage = Math.min(state.savedPage, totalPages);
}


function applyPendingUnsavesState(/** @type {TtalkakStateContext} */ ctx, /** @type {{nextRoute: string, nextMyPageTab: string, pageSize: number}} */ { nextRoute, nextMyPageTab, pageSize }) {
  const { findPromptById, getSavedFilteredCount, savedPrompts, state } = ctx;
  const staysInLibrary =
    state.route === "saved" &&
    nextRoute === "saved" &&
    state.myPageTab === "library" &&
    nextMyPageTab === "library";

  if (state.route !== "saved" || staysInLibrary || state.pendingUnsaveIds.size === 0) return [];

  const promptIds = [...state.pendingUnsaveIds];
  promptIds.forEach((promptId) => {
    const savedIndex = savedPrompts.findIndex((item) => item.id === promptId);
    if (savedIndex >= 0) {
      const savedPrompt = savedPrompts[savedIndex];
      if (!savedPrompt) return;
      if (savedPrompt.source === "mine") {
        savedPrompt.savedByMe = false;
      } else {
        savedPrompts.splice(savedIndex, 1);
      }
      state.userLibraryPromptIds.delete(promptId);
    }
    if (state.detailPromptId === promptId && !findPromptById(promptId)) {
      state.detailPromptId = null;
    }
  });

  state.pendingUnsaveIds.clear();
  normalizeSavedPageState(state, getSavedFilteredCount(), pageSize);
  return promptIds;
}


function applyDeletedPromptState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ promptId, /** @type {number} */ pageSize) {
  const { getSavedFilteredCount, popularPrompts, savedPrompts, state } = ctx;
  removePromptByIdState(popularPrompts, promptId);
  removePromptByIdState(savedPrompts, promptId);
  state.userLibraryPromptIds.delete(promptId);
  state.backendLibraryPromptIds.delete(promptId);
  state.backendLibraryPrompts = state.backendLibraryPrompts.filter((prompt) => prompt.id !== promptId);
  state.backendLikedPrompts = state.backendLikedPrompts.filter((prompt) => prompt.id !== promptId);
  state.detailPromptId = state.detailPromptId === promptId ? null : state.detailPromptId;
  normalizeSavedPageState(state, getSavedFilteredCount(), pageSize);
}


function applyPromptLikedState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ promptId, /** @type {TtalkakStateEntity} */ prompt) {
  const { state, upsertPrompt, updatePromptField } = ctx;
  state.likedPromptIds.add(promptId);
  if (prompt && state.myBackendStatus === "connected") {
    upsertPrompt(state.backendLikedPrompts, { ...prompt, likedByMe: true });
  }
  updatePromptField(promptId, "likes", 1);
}


function applyPromptUnlikedState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ promptId) {
  const { state, updatePromptField } = ctx;
  state.likedPromptIds.delete(promptId);
  state.backendLikedPrompts = state.backendLikedPrompts.filter((prompt) => prompt.id !== promptId);
  updatePromptField(promptId, "likes", -1);
}


function applyPublishedSavedPromptState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakStateEntity & {id: TtalkakId}} */ prompt, /** @type {TtalkakStateEntity} */ backendPrompt) {
  const { popularPrompts, state } = ctx;
  if (backendPrompt) {
    Object.assign(prompt, backendPrompt, {
      source: "mine",
      isShared: true,
      savedByMe: prompt.savedByMe,
      author: state.currentUser || backendPrompt.author,
      owner: state.currentUser || backendPrompt.owner || backendPrompt.author,
    });
  }

  prompt.isShared = true;
  prompt.source = "mine";
  prompt.author = state.currentUser || prompt.author || "\uC775\uBA85";
  prompt.owner = state.currentUser || prompt.owner || prompt.author;
  prompt.createdAt = prompt.createdAt || Date.now();

  const popularIndex = popularPrompts.findIndex((item) => item.id === prompt.id);
  if (popularIndex >= 0) {
    popularPrompts[popularIndex] = { ...popularPrompts[popularIndex], ...prompt, isShared: true, source: "mine" };
  } else {
    popularPrompts.unshift({ ...prompt, isShared: true, source: "mine" });
  }

  state.popularSort = "latest";
  state.popularPage = 1;
  state.userLibraryPromptIds.add(prompt.id);
}


function applyEditedPromptState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ promptId, /** @type {TtalkakStateEntity} */ nextValues, /** @type {string} */ revisionKey) {
  const { popularPrompts, savedPrompts, state } = ctx;
  [popularPrompts, savedPrompts].forEach((list) => {
    const item = list.find((entry) => entry.id === promptId);
    if (item) Object.assign(item, nextValues);
  });

  if (state.adminPromptRevisionRequests[revisionKey] || state.adminPromptRevisionRequests[promptId]) {
    const { [revisionKey]: _resolvedRequest, [promptId]: _legacyRequest, ...remainingRequests } = state.adminPromptRevisionRequests;
    state.adminPromptRevisionRequests = remainingRequests;
  }

  state.editingPromptId = null;
}


function applyUnsharedPromptState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ promptId, /** @type {TtalkakStateEntity} */ prompt) {
  const { popularPrompts, savedPrompts, state } = ctx;
  removePromptByIdState(popularPrompts, promptId);
  const savedPrompt = savedPrompts.find((item) => item.id === promptId);
  if (savedPrompt) {
    savedPrompt.isShared = false;
    savedPrompt.source = "mine";
  } else {
    savedPrompts.unshift({ ...prompt, isShared: false, source: "mine" });
  }

  state.popularPage = 1;
  state.detailPromptId = state.detailPromptId === promptId ? null : state.detailPromptId;
}


function applySharedPromptState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakStateEntity & {id: TtalkakId}} */ localPrompt, /** @type {TtalkakStateEntity & {id: TtalkakId}} */ finalPrompt) {
  const { commentsByPrompt, existingPrompt, popularPrompts, savedPrompts, state, upsertPrompt } = ctx;
  if (localPrompt.id !== finalPrompt.id) {
    removePromptByIdState(popularPrompts, localPrompt.id);
    removePromptByIdState(savedPrompts, localPrompt.id);
  }

  upsertPrompt(popularPrompts, finalPrompt);
  upsertPrompt(savedPrompts, finalPrompt);
  state.userLibraryPromptIds.add(finalPrompt.id);
  state.backendLibraryPromptIds.add(finalPrompt.id);
  if (state.myBackendStatus === "connected") {
    upsertPrompt(state.backendLibraryPrompts, finalPrompt);
    upsertPrompt(state.backendMyPrompts, finalPrompt);
  }
  if (!commentsByPrompt[finalPrompt.id]) commentsByPrompt[finalPrompt.id] = [];

  state.searchQuery = "";
  state.popularSort = "latest";
  state.popularPage = 1;
  state.shareError = "";
  state.shareDraft = null;
  state.route = "home";
  return existingPrompt;
}


const api = Object.freeze({ applyExistingPromptSavedState, applyBackendPromptUnsavedState, togglePendingUnsaveState, applyPromptUnsavedState, applyNewPromptSavedState, normalizeSavedPageState, applyPendingUnsavesState, applyDeletedPromptState, applyPromptLikedState, applyPromptUnlikedState, applyPublishedSavedPromptState, applyEditedPromptState, applyUnsharedPromptState, applySharedPromptState });
export { api };
