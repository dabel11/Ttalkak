// @ts-check
(function attachStateMake(/** @type {TtalkakGlobal} */ global) {
  "use strict";

function deleteMakeThreadState(/** @type {TtalkakApplicationState} */ state, /** @type {TtalkakId} */ threadId) {
  state.recentThreads = state.recentThreads.filter((thread) => thread.id !== threadId);
  if (state.activeThreadId === threadId) {
    state.activeThreadId = null;
    state.messages = [];
    state.composerDraft = "";
  }
}


function createLocalMakeFolderState(/** @type {TtalkakApplicationState} */ state, /** @type {string} */ name) {
  const folder = { id: `folder-${Date.now()}`, name };
  state.makeFolders.push(folder);
  return folder;
}


function removeLocalMakeFolderState(/** @type {TtalkakApplicationState} */ state, /** @type {TtalkakId} */ folderId) {
  state.makeFolders = state.makeFolders.filter((item) => item.id !== folderId);
}


function restoreMakeThreadFolderState(/** @type {TtalkakStateEntity} */ thread, /** @type {TtalkakId | null} */ folderId) {
  if (thread) thread.folderId = folderId || "uncategorized";
}


function deleteMakeFolderState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ folderId) {
  const { state } = ctx;
  removeLocalMakeFolderState(state, folderId);
  state.recentThreads.forEach((thread) => {
    if (thread.folderId === folderId) thread.folderId = "uncategorized";
  });
  if (state.activeFolderId === folderId) state.activeFolderId = "all";
}


function updateRecentMakeThreadState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ threadId) {
  const { makePreview, makePromptTitle, state } = ctx;
  const lastUser = [...state.messages].reverse().find((message) => message.role === "user");
  const firstUser = state.messages.find((message) => message.role === "user");
  const lastAssistant = [...state.messages].reverse().find((message) => message.role === "assistant");
  const existingThread = state.recentThreads.find((item) => item.id === threadId);
  const thread = {
    id: threadId,
    dedupeKey: threadId,
    title: makePromptTitle(lastUser?.content || "새 대화"),
    preview: makePreview(lastAssistant?.content || lastUser?.content || ""),
    createdAt: existingThread?.createdAt || Date.now(),
    folderId: existingThread?.folderId || (state.activeFolderId !== "all" ? state.activeFolderId : "uncategorized"),
    serverId: existingThread?.serverId || "",
    messages: state.messages.map((item) => ({ ...item })),
  };

  state.recentThreads = [thread, ...state.recentThreads.filter((item) => item.id !== threadId)].slice(0, 8);
  return thread;
}


function openRecentMakeThreadState(/** @type {TtalkakApplicationState} */ state, /** @type {TtalkakStateEntity} */ thread) {
  state.activeThreadId = thread.id || null;
  state.messages = (thread.messages || []).map((item) => ({ ...item }));
  state.route = "make";
}


function openSavedMakePromptState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakId} */ promptId, /** @type {TtalkakStateEntity} */ prompt) {
  const { updateRecentThread, state } = ctx;
  const threadId = `saved-thread-${promptId}`;
  state.activeThreadId = threadId;
  state.messages = (prompt.messages || []).map((item) => ({ ...item }));
  updateRecentThread(threadId);
  state.route = "make";
}


function startNewMakeChatState(/** @type {TtalkakApplicationState} */ state) {
  state.activeThreadId = null;
  state.messages = [];
  state.copiedMessageId = "";
  state.composerDraft = "";
}


function appendMakeUserMessageState(/** @type {TtalkakApplicationState} */ state, /** @type {TtalkakId} */ threadId, /** @type {TtalkakStateEntity} */ message) {
  state.activeThreadId = threadId;
  state.messages.push(message);
}


function appendMakeAssistantMessageState(/** @type {TtalkakApplicationState} */ state, /** @type {TtalkakStateEntity} */ message) {
  state.messages.push(message);
  state.composerDraft = "";
}


function applyEditedMakeMessageState(/** @type {TtalkakApplicationState} */ state, /** @type {number} */ index, /** @type {string} */ cleanValue, /** @type {number} */ now) {
  state.messages = state.messages.slice(0, index + 1);
  state.messages[index] = { ...state.messages[index], content: cleanValue, editedAt: now };
}


function finishEditedMakeMessageState(/** @type {TtalkakApplicationState} */ state, /** @type {TtalkakStateEntity} */ message) {
  state.messages.push(message);
  state.editingMessageId = null;
}


function toggleSavedMakeMessageState(/** @type {TtalkakStateContext} */ ctx, /** @type {TtalkakStateEntity} */ message, /** @type {string} */ finalPrompt) {
  const { makePromptTitle, savedPrompts, state } = ctx;
  if (message.id === undefined) throw new TypeError("Make message id is required");
  const savedIndex = savedPrompts.findIndex((item) => item.id === message.id);
  if (savedIndex >= 0) {
    savedPrompts.splice(savedIndex, 1);
    state.userLibraryPromptIds.delete(message.id);
    state.savedPage = 1;
    return "removed";
  }

  savedPrompts.unshift({
    id: message.id,
    title: makePromptTitle(message.sourcePrompt || finalPrompt),
    text: finalPrompt,
    tags: ["내프롬프트", "Make", "첨삭"],
    views: 0,
    comments: 0,
    saves: 1,
    author: state.currentUser || "나",
    owner: state.currentUser || "나",
    source: "mine",
    isShared: false,
    savedByMe: true,
    sourcePrompt: message.sourcePrompt || finalPrompt,
    messages: state.messages.map((item) => ({ ...item })),
  });
  state.userLibraryPromptIds.add(message.id);
  state.savedPage = 1;
  return "added";
}


const api = Object.freeze({ deleteMakeThreadState, createLocalMakeFolderState, removeLocalMakeFolderState, restoreMakeThreadFolderState, deleteMakeFolderState, updateRecentMakeThreadState, openRecentMakeThreadState, openSavedMakePromptState, startNewMakeChatState, appendMakeUserMessageState, appendMakeAssistantMessageState, applyEditedMakeMessageState, finishEditedMakeMessageState, toggleSavedMakeMessageState });
global.TtalkakStateDomains = Object.assign({}, global.TtalkakStateDomains, { make: api });
if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
