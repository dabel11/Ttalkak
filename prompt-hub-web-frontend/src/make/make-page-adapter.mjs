// @ts-check

/** @param {Record<string, any>} ctx */
export function createMakePageAdapter(ctx) {
  function render() {
    const hasMessages = ctx.state.messages.length > 0;
    return ctx.MakePageView(
      { icons: ctx.icons, escapeAttr: ctx.escapeAttr, escapeHtml: ctx.escapeHtml },
      { composerHtml: composer(hasMessages), feedHtml: feed(hasMessages), sidePanelHtml: sidePanel() },
    );
  }

  /** @param {boolean} hasMessages */
  function feed(hasMessages) {
    const activeThread = ctx.findMakeThread(ctx.state.recentThreads, ctx.state.activeThreadId);
    return ctx.MakeFeedView(
      { icons: ctx.icons, escapeHtml: ctx.escapeHtml },
      {
        hasMessages,
        isThinking: ctx.isThinking(),
        messages: ctx.state.messages,
        renderMessageBubble: messageBubble,
        templateBarHtml: templateBar(),
        threadPolicyNote: activeThread && !ctx.canSplitMakeThread(activeThread, ctx.isBackendNumericId)
          ? "대화 분리는 로컬 대화에서 사용할 수 있습니다."
          : "",
      },
    );
  }

  function templateBar() {
    return ctx.MakeTemplateBarView(
      { escapeAttr: ctx.escapeAttr, escapeHtml: ctx.escapeHtml },
      { promptTemplates: ctx.promptTemplates, templateCollapsed: ctx.state.templateCollapsed },
    );
  }

  /** @param {boolean} hasMessages */
  function composer(hasMessages) {
    return ctx.MakeComposerView(
      { icons: ctx.icons, escapeHtml: ctx.escapeHtml },
      {
        composerDraft: ctx.state.composerDraft,
        hasMessages,
        isThinking: ctx.isThinking() || ctx.requestState.inFlight,
      },
    );
  }

  function sidePanel() {
    const uncategorizedCount = ctx.countThreadsInFolder("uncategorized");
    const visibleFolders = ctx.state.makeFolders.filter((/** @type {TtalkakStateEntity} */ folder) => folder.id !== "uncategorized" || uncategorizedCount > 0);
    const customFolderCount = ctx.getCustomMakeFolderCount();
    const canManageFolders = ctx.state.isLoggedIn;
    const canCreateFolder = canManageFolders && customFolderCount < ctx.maxCustomFolders;
    if (ctx.state.activeFolderId === "uncategorized" && uncategorizedCount === 0) ctx.state.activeFolderId = "all";
    const visibleThreads = ctx.state.activeFolderId === "all"
      ? ctx.state.recentThreads
      : ctx.state.recentThreads.filter((/** @type {TtalkakStateEntity} */ thread) => (thread.folderId || "uncategorized") === ctx.state.activeFolderId);
    const previewThreads = visibleThreads.map((/** @type {TtalkakStateEntity} */ thread) => ({
      ...thread,
      preview: ctx.makePreview(thread.preview || thread.messages?.at(-1)?.content || ""),
    }));

    return ctx.MakeSidePanelView(
      { icons: ctx.icons, escapeAttr: ctx.escapeAttr, escapeHtml: ctx.escapeHtml, formatShortDate: ctx.formatShortDate },
      {
        activeFolderName: ctx.getActiveFolderName(),
        activeThreadId: ctx.state.activeThreadId,
        canCreateFolder,
        canManageFolders,
        canStartThreadFolderCreate: canManageFolders && customFolderCount < ctx.maxCustomFolders,
        creatingFolder: ctx.state.creatingFolder,
        creatingThreadFolderId: ctx.state.creatingThreadFolderId,
        customFolderCount,
        folders: ctx.state.makeFolders,
        getThreadFolderId: ctx.getThreadFolderId,
        makeBackendMessage: ctx.sanitizeMakeBackendMessage(ctx.state.makeBackendMessage),
        maxCustomFolders: ctx.maxCustomFolders,
        openThreadMenuId: ctx.state.openThreadMenuId,
        renderFolderButton: folderButton,
        threadCount: ctx.state.recentThreads.length,
        visibleFolders: visibleFolders.map((/** @type {TtalkakStateEntity} */ folder) => ({ ...folder, threadCount: ctx.countThreadsInFolder(folder.id) })),
        visibleThreads: previewThreads,
      },
    );
  }

  /** @param {TtalkakId} folderId @param {string} name @param {number} count */
  function folderButton(folderId, name, count) {
    const isUserFolder = folderId !== "all" && folderId !== "uncategorized";
    const canManage = ctx.state.isLoggedIn && isUserFolder;
    return ctx.MakeFolderButtonView(
      { icons: ctx.icons, escapeAttr: ctx.escapeAttr, escapeHtml: ctx.escapeHtml, formatNumber: ctx.formatNumber },
      {
        canManage,
        count,
        folderId,
        isActive: ctx.state.activeFolderId === folderId,
        isEditing: canManage && ctx.state.editingFolderId === folderId,
        isMenuOpen: canManage && ctx.state.openFolderMenuId === folderId,
        isUserFolder,
        name,
      },
    );
  }

  /** @param {TtalkakStateEntity} message */
  function messageBubble(message) {
    const isAssistant = message.role === "assistant";
    const activeThread = ctx.findMakeThread(ctx.state.recentThreads, ctx.state.activeThreadId);
    return ctx.MessageBubbleView(
      { icons: ctx.icons, escapeAttr: ctx.escapeAttr, escapeHtml: ctx.escapeHtml },
      {
        content: message.content,
        answer: message.answer || "",
        changes: message.changes || [],
        fields: message.fields || [],
        hasExecutablePrompt: isAssistant && ctx.messageModel.isExecutableMessage(message),
        id: message.id,
        canSplit: !isAssistant && ctx.canSplitMakeThread(activeThread, ctx.isBackendNumericId)
          && ctx.state.messages.findIndex((/** @type {TtalkakStateEntity} */ item) => item.id === message.id) > 0,
        improvedPrompt: message.improvedPrompt || message.executablePrompt || "",
        isCopied: ctx.state.copiedMessageId === message.id,
        isEditing: !isAssistant && ctx.state.editingMessageId === message.id,
        failureMessage: !isAssistant && ctx.requestState.failedMessageId === message.id ? ctx.requestState.failure?.message || "" : "",
        failureRetryable: !isAssistant && ctx.requestState.failedMessageId === message.id && Boolean(ctx.requestState.failure?.retryable),
        isSaved: isAssistant && ctx.isPromptSaved(message.id),
        isThinking: ctx.isThinking() || ctx.requestState.inFlight,
        mode: message.mode || "improve",
        questions: message.questions || [],
        ragStatus: message.ragStatus || "",
        role: message.role,
        summary: message.summary || "",
        techniques: message.techniques || [],
      },
    );
  }

  return Object.freeze({ render });
}
