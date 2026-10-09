const fs = require("node:fs");
const path = require("node:path");

const repositoryRoot = path.resolve(__dirname, "..");
const webRoot = path.join(repositoryRoot, "prompt-hub-web-frontend");
const outputDirectory = process.env.TTALKAK_WEB_OUTPUT_DIR || "dist";
if (!/^dist(?:-[a-z0-9-]+)?$/i.test(outputDirectory)) throw new Error(`Invalid TTALKAK_WEB_OUTPUT_DIR: ${outputDirectory}`);
const outputRoot = path.join(webRoot, outputDirectory);
const production = process.argv.includes("--production");
const requiredEntries = ["index.html", "src"];
const esbuild = require(path.join(webRoot, "node_modules", "esbuild"));
const terser = require(path.join(webRoot, "node_modules", "terser"));
const terserVersion = require(path.join(webRoot, "node_modules", "terser", "package.json")).version;
const productionCompressionPolicy = `${terserVersion}/13`;
const internalContextPropertyPattern = /^(?:reportWarning|isCurrentRequest|canUseDemoFallback|normalizeTag|updateThread|setThinking|canDeleteComment|getCommentMutationContext|classifyError|runMutation|failRequest|requestState|refreshMyPage|refreshThread|queueScroll|hasBackendToken|completeRequest|isBackendNumericId|getBackendThreadId|renderCancellation|setBackendFailure|getPromptMutationContext|normalizeRecentThreads|getReportRecord|mapBackendReportStatus|hydrateComments|renderPreservingScroll|isBackendId|findPromptIdByComment|getStatusLabel|countThreadsInFolder|normalizeText|hasBackendAuthToken|togglePendingUnsave|shouldSync|reportFailure|reportOutcome|applyPendingThread|clearPendingGuestThreadTransfer|canSplitMakeThread|scrollLatest|stopInFlight|refreshBackendHomePromptsEffect|normalizeAssistantPromptOutputs|cancelHomeSearch|restoreHomeFocus|hydrateBackendMyPageDataEffect|normalizeResult|formatShortDate|getCommentCount|normalizePersistedLikeCounts|hydrateBackendMakeDataEffect|hydrateBackendHomeDataEffect|findMakeThread|sanitizeMakeBackendMessage|updateBackendHomePageMeta|clearAuthenticatedSession|getMakeInteractionVersion|handleBackendAccessError|reportConcurrencyRefresh|getCustomMakeFolderCount|hydrateBackendAdminData|buildHistory|startRequest|waitForPaint|findEditableMessage|normalizeMakeFolders|discardCurrentScope|getValidSearchScope|applyBackendUnsaved|isOwnedRevisionTarget|syncCommentCount|prepareDemoData|incrementViews|escapeHtml|escapeAttr|showNotice|clearEditing|messageModel|getMessages|parseTags|getIcons|getToken|setDraft|emailValid|phoneValid|appendUser|applyUser|uniquePrompts|getAuthToken|removePrompt|focusAsk|makePreview|addPromptCommentState|getApiFailureMessage|logMessage|applyState|syncThread|getActiveFolderName|getThreadFolderId|searchDebounceMs|applySearchQuery|applyPromptLiked|toggleReplyState|getMakeApiToken|getCommentLikes|toggleEditState|bumpInteraction|appendAssistant|getLikes|normalizeLikes|isMakeThinking|refreshThreads|canTransition|applyIdentity|applyNewSaved|addReplyState|focusRestored|isPromptSaved|clearSession|resetBackend|upsertPrompt|getCreatedAt|applyUnsaved|refreshAdmin|formatNumber|isHiddenDemo|getKnownTags|hydrateMake|removeToken|applyAuthor|keepSession|recoveryPrompt|revisionKey|applySort|applyPage|getAuthor|applyEdit|applyTag|hasToken|isFinal|setMakeComposerDraft|setMakeBackendState|setMakeRecentThreads|setActiveThreadId|render|notice|guard|icons|interactions|effects|runtimeConfig|maxCustomFolders|freeLimit|existingNicknames|existingUserIds|MakeFolderButtonView|MakeTemplateBarView|MakeSidePanelView|MessageBubbleView|MakeComposerView|MakePageView|MakeFeedView|applyExistingSaved|applyPromptUnliked|toggleCommentLiked|updateCommentState|deleteCommentState|getMutationContext|getRecord|canUseApi|fromBackendStatus|keepQuery|findCommentInList|getActiveThreadId|getRevisionTarget|refreshOnFailure|applyShared|finishEdit|closeState|showStatus|writeToken|clearState|getMakeApi|validScope|isApproved|myBackendStatus|adminBackendStatus|backendStatusMessage|backendStatus|adminUserSearchResults|backendAdminUserActivities|detailHighlightCommentId|detailPromptId|pendingUnsaveIds|openPromptCardMenuId|creatingThreadFolderId|openThreadMenuId|backendLikedPrompts|executeMessageId|executePromptId|editingCommentId|openFolderMenuId|adminUserSearchMessage|adminRequestTargetKey|adminAuditSyncMessage|backendLibraryPrompts|backendLibraryPromptIds|backendAdminPrompts|popularPage|reportCommentId|reportPromptId|backendMyPrompts|backendAdminTags|backendAdminAuditLogs|backendAdminReports|backendAdminReportsLoaded|backendHomePage|backendMyComments|backendMyReports|backendAdminRevisionRequests|backendPopularTags|authView|authDuplicateChecks|editingPromptId|replyingCommentId|savedFilter|shareDraft|adminBlockTarget|expandedComments|savedPage|confirmAction|creatingFolder|isComposingShareTag|shareTagQuery|editingFolderId|isComposingAdminPromptSearch|authUserIdWarning|editingMessageId|isComposingAdminTagSearch|authError|copiedMessageId|pendingMakeImproveThread|pendingGuestThreadTransferId|pendingGuestThreadTransferErrorCode|isComposingSearch|myPageTab|makeBackendStatus|shareError|searchTipVisible|authDraft|makeBackendMessage|searchTipShown)$/;

const dynamicRendererPropertyPattern = /^(?:MakeFolderButtonView|MakeTemplateBarView|MakeSidePanelView|MessageBubbleView|MakeComposerView|MakePageView|MakeFeedView)$/;
const additionalInternalContextPropertyPattern = /^(?:findPrompt|findComment|findPromptById|findCommentById|handleError|callApi|maxFolders|makeState|confirm|userIdError|recover|renderPreservingMakeScroll|renderPreservingScroll|openConfirmAction|getFinalPromptText|copyTextToClipboard|makePromptTitle|getMakeMutationStateContext|getPromptMutationStateContext|getCommentMutationStateContext|toggleSavedMakeMessageState|getMakeControllerContext|autosizeTextarea|startNewMakeChatState|makeController|futureDate|demoToken|folderCount|focusLater|openThread|makeRevisionRequestKey|removePromptByIdState|refreshBackendHomePrompts|refreshMyPageDataAfterMutation|hydrateBackendAdminDataIfNeeded|parseSharedTags|stampCurrentUserOwnedPrompts|isDemoAuthToken|applyPublishedSavedPromptState|applyDeletedPromptState|applyUnsharedPromptState|getAdminHydrationEffectContext|getAdminReportRecords|getAdminManagedTags|matchesAdminPromptFilter|matchesAdminPromptQuery|getDisplayPromptAuthor|getPromptAuthorId|getAdminTagStatusLabel|getReportStatusLabel|getAuthorRevisionStatusLabel|getPromptRevisionRequest|getPromptSaveCount|getPromptViewCount|reportStart|reportCancel|reportRetry|isBusy|isThinking|setPendingScroll|setEditing|runConfirmedAction|refreshConcurrent|refineUnchanged|updatePreview|scheduleTagSearch|schedulePromptSearch|cancelPromptSearch|cancelTagSearch|refreshThreads|updateStarterAttribution|clearStarterAttribution|updateTagQuery|addTag|removeTag|renameFolder|createFolder|createFolderAndMove|moveThread|splitThread|submitComposer|submitPrompt|submitAnswers|submitReport|cancelRequest|openLogin|openSavedMakePrompt|openPromptComments|openReportComment|restoreAuthFocus|toggleTemplates|togglePromptHidden|toggleReplyForm|toggleSavedPrompt|toggleComments|toggleEditComment|toggleLikeComment|toggleLikePrompt|updateAdminUserBlock|updateCommentHidden|updateOwnComment|updateReportStatus|updateUserBlock|deleteOwnComment|addCommentReply|addPromptComment|requestRevision|showComments|newChatFromConflict|retryConcurrent|autosize|updateDraft|closeTop|copy|save|share|execute|resend|searchQuery|renderBilling|openBilling|closeBilling|refreshBilling|registerBilling|handleBillingRedirect|bindBilling)$/;
// State-module methods and transient UI properties are internal to the bundle, not
// API response fields, persisted record keys, or dynamically named renderers.
// Reviewed internal callbacks and configuration only: no API payload or persisted storage keys.
const internalStatePropertyPattern = /^(?:applyScope|isHiddenDemoPrompt|renderAfterBackendUpdate|loadPersistedState|homePageSize|billingOpen|pendingBillingOpen|isDemoToken|handleRedirect|pendingGuestThreadTransferId|pendingGuestThreadTransferErrorCode|addCommentReplyState|addPromptCommentState|appendMakeAssistantMessageState|appendMakeUserMessageState|applyAdminPromptHiddenState|applyAdminReportStatusState|applyAdminRevisionRequestState|applyAdminTagDecisionState|applyAdminUserActivityRefreshState|applyAdminUserBlockActivityState|applyAuthenticatedIdentityState|applyBackendPromptUnsavedState|applyCommentReportedState|applyDeletedPromptState|applyEditedMakeMessageState|applyEditedPromptState|applyExistingPromptSavedState|applyHomeAuthorSearchState|applyHomePageState|applyHomeSearchQueryState|applyHomeSearchScopeState|applyHomeSortState|applyHomeTagSearchState|applyNewPromptSavedState|applyPendingUnsavesState|applyPromptLikedState|applyPromptReportedState|applyPromptUnlikedState|applyPromptUnsavedState|applyPublishedSavedPromptState|applySharedPromptState|applyUnsharedPromptState|clearAuthenticatedIdentityState|clearAuthenticatedSessionState|clearPersistedPayload|clearSessionBackendDataState|clearTransientSessionUiState|closeTopModalState|createInitialState|createLocalMakeFolderState|deleteCommentState|deleteMakeFolderState|deleteMakeThreadState|finishAdminRevisionRequestState|finishEditedMakeMessageState|loadPersistedAppState|normalizeSavedPageState|openRecentMakeThreadState|openSavedMakePromptState|persistAppState|readPersistedPayload|readStorageItem|removeCommentFromListState|removeLocalMakeFolderState|removePromptByIdState|removeStorageItem|resetHomeViewState|resetSessionBackendState|restoreMakeThreadFolderState|startNewMakeChatState|toggleCommentLikedState|toggleEditCommentState|togglePendingUnsaveState|toggleReplyCommentState|toggleReportedVisibilityState|toggleSavedMakeMessageState|updateOwnCommentState|updatePromptCommentCountState|updateRecentMakeThreadState|writePersistedPayload|writeStorageItem)$/;
const persistedRuntimeStatePropertyPattern = /^(?:isLoggedIn|currentUser|currentUserId|currentUserRole|accountScopes|libraryDemoSeeded|userLibraryPromptIds|likedPromptIds|likedCommentIds|reportedPromptIds|reportedCommentIds|hideReportedPrompts|adminMode|adminHiddenPromptIds|adminTagDecisions|adminTab|adminPromptQuery|adminPromptFilter|adminTagQuery|adminTagFilter|adminTagSort|adminTagPromptKey|adminUserQuery|adminUserActivityNickname|adminPromptRevisionRequests|adminReportFilter|reportRecords|searchScope|popularSort|savedSort|recentThreads|makeFolders|activeFolderId|activeThreadId|composerDraft|templateCollapsed)$/;
const transientRuntimePropertyPattern = /^(?:mobileTemplateExpanded|makeDrawerOpen|compactHeaderOpen|backendRecoveryNotice|createMakeRequestCorrelation|targetPreview|controller|events|reporter|inFlight|cancelSearchCommit|scheduleSearchCommit|updateCapsLock|createMakePageAdapter|setMakeEditingMessage|ensureBackendMakeThreadId|hydratePromptComments|keywordTokens|authorTokens|tagTokens|allTokens)$/;
const productionManglePropertyPattern = new RegExp(
  `^(?!${dynamicRendererPropertyPattern.source.slice(1, -1)}$)(?:(?:${internalContextPropertyPattern.source.slice(1, -1)})|(?:${additionalInternalContextPropertyPattern.source.slice(1, -1)})|(?:${internalStatePropertyPattern.source.slice(1, -1)})|(?:${persistedRuntimeStatePropertyPattern.source.slice(1, -1)})|(?:${transientRuntimePropertyPattern.source.slice(1, -1)})|(?:state|api|root|refresh|promptTemplates|debounceMs|demoPromptIds|observability|report|recent|sink|limit|allowedRecordFields|aggregateEventFields|prohibitedContent|externalCollectionEnabled|renderers|routing|bootstrap|components|discovery|session|validation|home|auth|admin|modal|saved|utils|effects|interactions|persistence|share|make|selectors|backend|backendStatus|model|navigation|reportCommentForms|makeScroll|app|demo|toBackendStatus|promptOverrides|commentOverrides|messageModel|requestId|threadPolicy|loadRuntime|makeFailureRecovery|makeServerSync|engagement|commentModel|commentView|previewUtils|focusUtils|errorBoundary|savedPrompts|popularPrompts|commentsByPrompt))$`,
);

async function compressProductionJavaScript(metafile) {
  const outputs = Object.keys(metafile.outputs).filter((file) => file.endsWith(".js"));
  // HTML data-* names survive JS minification. Preserve matching DOMStringMap
  // keys even when an internal state property has the same name (e.g. adminTab).
  const datasetProperties = [...new Set(outputs.flatMap((output) =>
    [...fs.readFileSync(path.resolve(output), "utf8").matchAll(/\.dataset\.([A-Za-z_$][\w$]*)/g)].map((match) => match[1]),
  ))];
  const nameCache = {};
  for (const output of outputs) {
    const source = fs.readFileSync(path.resolve(output), "utf8");
    const result = await terser.minify(source, {
      module: true,
      ecma: 2023,
      compress: {
        booleans_as_integers: true,
        keep_fargs: false,
        passes: 10,
        pure_getters: true,
        unsafe: true,
        unsafe_arrows: true,
        unsafe_comps: true,
        unsafe_math: true,
        unsafe_methods: true,
        unsafe_proto: true,
        unsafe_undefined: true,
      },
      mangle: { properties: { keep_quoted: "strict", regex: productionManglePropertyPattern, reserved: datasetProperties } },
      nameCache,
      format: { comments: false, ecma: 2023, semicolons: false },
    });
    if (!result.code) throw new Error(`Terser produced no output for ${output}`);
    // Terser preserves indentation inside HTML template literals. Production
    // renderers do not rely on that formatting, so collapse inter-tag lines to
    // one browser-equivalent space without changing text-node separation.
    const normalized = result.code
      .replace(/>\\n\s+(?=<)/g, ">")
      .replace(/>\\n\s+/g, "> ")
      .replace(/\\n\s+(?=[<$])/g, " ");
    const cleanup = await terser.minify(normalized, {
      module: true,
      ecma: 2023,
      compress: { passes: 2, unsafe: true },
      mangle: true,
      format: { comments: false, ecma: 2023, semicolons: true },
    });
    if (!cleanup.code) throw new Error(`Terser cleanup produced no output for ${output}`);
    const compressed = cleanup.code;
    fs.writeFileSync(path.resolve(output), compressed, "utf8");
    metafile.outputs[output].bytes = Buffer.byteLength(compressed);
  }
}

async function writeProductionStyles(source, destination, before = [], after = []) {
  const css = [...before, source, ...after].map((file) => fs.readFileSync(file, "utf8")).join("\n");
  const result = await esbuild.transform(css, {
    loader: "css",
    minify: true,
    target: ["chrome110", "firefox110"],
  });
  fs.writeFileSync(destination, result.code, "utf8");
}

function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(sourcePath, destinationPath);
    else if (entry.isFile()) fs.copyFileSync(sourcePath, destinationPath);
  }
}

function assertSafeOutputPath() {
  if (path.dirname(outputRoot) !== webRoot || path.basename(outputRoot) !== outputDirectory) {
    throw new Error(`Unsafe web build output path: ${outputRoot}`);
  }
}

function validateSources() {
  for (const entry of requiredEntries) {
    if (!fs.existsSync(path.join(webRoot, entry))) {
      throw new Error(`Required web build entry is missing: ${entry}`);
    }
  }

  const html = fs.readFileSync(path.join(webRoot, "index.html"), "utf8");
  const referencedFiles = [...html.matchAll(/(?:src|href)="\.\/([^"?#]+)/g)].map((match) => match[1]);
  for (const referencedFile of referencedFiles) {
    if (!fs.existsSync(path.join(webRoot, referencedFile))) {
      throw new Error(`index.html references a missing file: ${referencedFile}`);
    }
  }

  if (production && !/TTALKAK_DEMO_FALLBACK_ENABLED\s*=\s*false/.test(html)) {
    throw new Error("Production build requires TTALKAK_DEMO_FALLBACK_ENABLED to be false.");
  }
}

async function build() {
  assertSafeOutputPath();
  validateSources();
  // Windows/OneDrive and recently stopped preview servers can hold a short-lived
  // handle on dist. Node's bounded retry keeps builds deterministic without
  // hiding persistent permission failures.
  fs.rmSync(outputRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  fs.mkdirSync(outputRoot, { recursive: true });
  let html = fs.readFileSync(path.join(webRoot, "index.html"), "utf8");
  let bundle = "src/app-entry.js";
  let bundleMetafile = null;
  if (production) {
    const result = await esbuild.build({
      entryPoints: [path.join(webRoot, "src", "app-entry.js")],
      bundle: true,
      format: "esm",
      splitting: true,
      minify: true,
      charset: "utf8",
      sourcemap: false,
      target: ["es2023"],
      define: { "globalThis.TTALKAK_PRODUCTION_BUILD": "true" },
      outdir: path.join(outputRoot, "assets"),
      entryNames: "app-[hash]",
      chunkNames: "chunks/[name]-[hash]",
      metafile: true,
    });
    bundleMetafile = result.metafile;
    await compressProductionJavaScript(result.metafile);
    if (Object.values(result.metafile.outputs).some((metadata) => metadata.entryPoint?.endsWith("src/demo-data.mjs"))) {
      throw new Error("Production bundle must not contain the development-only demo data chunk.");
    }
    const productionJavaScript = Object.keys(result.metafile.outputs)
      .filter((file) => file.endsWith(".js"))
      .map((file) => fs.readFileSync(path.resolve(file), "utf8"))
      .join("\n");
    if (productionJavaScript.includes("딸깍 확장 프로그램 소개문")) {
      throw new Error("Production bundle must not contain development-only demo seed records.");
    }
    if (productionJavaScript.includes("데모 보관함")) {
      throw new Error("Production bundle must not contain development-only library controls.");
    }
    if (productionJavaScript.includes("로컬 데모 데이터 초기화")) {
      throw new Error("Production bundle must not contain development-only reset controls.");
    }
    const output = Object.entries(result.metafile.outputs).find(([, metadata]) => metadata.entryPoint?.endsWith("src/app-entry.js"))?.[0];
    if (!output) throw new Error("Production bundle output was not created.");
    bundle = path.relative(outputRoot, path.resolve(output)).replaceAll("\\", "/");
    html = html.replace('./src/app-entry.js', `./${bundle}`);
    fs.mkdirSync(path.join(outputRoot, "assets", "styles"), { recursive: true });
    await writeProductionStyles(path.join(webRoot, "src", "styles.css"), path.join(outputRoot, "assets", "styles.css"),
      [path.join(webRoot, "src", "styles", "tokens.css")],
      [path.join(webRoot, "src", "styles", "notion.css")]);
    // Keep the source cascade order in one emitted stylesheet; src is not deployed.
    html = html.replace(/<link\b[^>]*href="\.\/src\/styles\/(?:tokens|notion)\.css[^"\n]*"[^>]*>\s*/g, "");
    await writeProductionStyles(path.join(webRoot, "src", "styles", "make.css"), path.join(outputRoot, "assets", "styles", "make.css"));
    copyDirectory(path.join(webRoot, "assets", "fonts"), path.join(outputRoot, "assets", "fonts"));
    html = html
      .replaceAll("./src/styles.css", "./assets/styles.css")
      .replaceAll("./src/styles/make.css", "./assets/styles/make.css");
  } else {
    fs.cpSync(path.join(webRoot, "src"), path.join(outputRoot, "src"), { recursive: true });
  }
  for (const [, reference] of html.matchAll(/(?:src|href)="\.\/([^"?#]+)/g)) {
    if (!fs.existsSync(path.join(outputRoot, reference))) {
      throw new Error(`Built index.html references a missing file: ${reference}`);
    }
  }
  fs.writeFileSync(path.join(outputRoot, "index.html"), html, "utf8");
  if (bundleMetafile) fs.writeFileSync(path.join(outputRoot, "bundle-metafile.json"), `${JSON.stringify(bundleMetafile, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(outputRoot, "build-manifest.json"),
    `${JSON.stringify({
      mode: production ? "production" : "development",
      compressionPolicy: production ? productionCompressionPolicy : null,
      entries: requiredEntries,
      bundle,
      javascript: production
        ? fs.readdirSync(path.join(outputRoot, "assets"), { recursive: true, withFileTypes: true })
          .filter((entry) => entry.isFile() && entry.name.endsWith(".js"))
          .map((entry) => path.relative(outputRoot, path.join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
          .sort()
        : [],
    }, null, 2)}\n`,
    "utf8",
  );
  console.log(`Web ${production ? "production" : "development"} build created at ${outputRoot}`);
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
