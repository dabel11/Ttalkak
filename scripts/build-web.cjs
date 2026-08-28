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
const productionCompressionPolicy = `ttalkak-terser-${terserVersion}-passes-5-modern`;
const internalContextPropertyPattern = /^(?:reportWarning|isCurrentRequest|canUseDemoFallback|normalizeTag|updateThread|setThinking|canDeleteComment|getCommentMutationContext|classifyError|runMutation|failRequest|requestState|refreshMyPage|refreshThread|queueScroll|hasBackendToken|completeRequest|isBackendNumericId|getBackendThreadId|renderCancellation|setBackendFailure|getPromptMutationContext|normalizeRecentThreads|getReportRecord|mapBackendReportStatus|hydrateComments|renderPreservingScroll|isBackendId|findPromptIdByComment|getStatusLabel|countThreadsInFolder|normalizeText|hasBackendAuthToken|togglePendingUnsave|shouldSync|reportFailure|reportOutcome|applyPendingThread|canSplitMakeThread|scrollLatest|stopInFlight|refreshBackendHomePromptsEffect|normalizeAssistantPromptOutputs|cancelHomeSearch|restoreHomeFocus|hydrateBackendMyPageDataEffect|normalizeResult|formatShortDate|getCommentCount|normalizePersistedLikeCounts|hydrateBackendMakeDataEffect|hydrateBackendHomeDataEffect|findMakeThread|sanitizeMakeBackendMessage|updateBackendHomePageMeta|clearAuthenticatedSession|getMakeInteractionVersion|handleBackendAccessError|reportConcurrencyRefresh|getCustomMakeFolderCount|hydrateBackendAdminData|buildHistory|startRequest|waitForPaint|findEditableMessage|normalizeMakeFolders|discardCurrentScope|getValidSearchScope|applyBackendUnsaved|isOwnedRevisionTarget|syncCommentCount|prepareDemoData|incrementViews|escapeHtml|escapeAttr|showNotice|clearEditing|messageModel|getMessages|parseTags|getIcons|getToken|setDraft|emailValid|phoneValid|appendUser|applyUser|uniquePrompts|getAuthToken|removePrompt|focusAsk|makePreview|addPromptCommentState|getApiFailureMessage|logMessage|applyState|syncThread|getActiveFolderName|getThreadFolderId|searchDebounceMs|applySearchQuery|applyPromptLiked|toggleReplyState|getMakeApiToken|getCommentLikes|toggleEditState|bumpInteraction|appendAssistant|getLikes|normalizeLikes|isMakeThinking|refreshThreads|canTransition|applyIdentity|applyNewSaved|addReplyState|focusRestored|isPromptSaved|clearSession|resetBackend|upsertPrompt|getCreatedAt|applyUnsaved|refreshAdmin|formatNumber|isHiddenDemo|getKnownTags|hydrateMake|removeToken|applyAuthor|keepSession|revisionKey|applySort|applyPage|getAuthor|applyEdit|applyTag|hasToken|isFinal|setMakeComposerDraft|setMakeBackendState|setMakeRecentThreads|setActiveThreadId|render|notice|guard|icons|interactions|effects|runtimeConfig|maxCustomFolders|freeLimit|existingNicknames|existingUserIds|MakeFolderButtonView|MakeTemplateBarView|MakeSidePanelView|MessageBubbleView|MakeComposerView|MakePageView|MakeFeedView|applyExistingSaved|applyPromptUnliked|toggleCommentLiked|updateCommentState|deleteCommentState|getMutationContext|getRecord|canUseApi|fromBackendStatus|keepQuery|findCommentInList|getActiveThreadId|getRevisionTarget|refreshOnFailure|applyShared|finishEdit|closeState|showStatus|writeToken|clearState|getMakeApi|validScope|isApproved|myBackendStatus|adminBackendStatus|backendStatusMessage|backendStatus|adminUserSearchResults|backendAdminUserActivities|detailHighlightCommentId|detailPromptId|pendingUnsaveIds|openPromptCardMenuId|creatingThreadFolderId|openThreadMenuId|backendLikedPrompts|executeMessageId|executePromptId|editingCommentId|openFolderMenuId|adminUserSearchMessage|adminRequestTargetKey|adminAuditSyncMessage|backendLibraryPrompts|backendLibraryPromptIds|backendAdminPrompts|popularPage|reportCommentId|reportPromptId|backendMyPrompts|backendAdminTags|backendAdminAuditLogs|backendAdminReports|backendAdminReportsLoaded|backendHomePage|backendMyComments|backendMyReports|backendAdminRevisionRequests|backendPopularTags|authView|authDuplicateChecks|editingPromptId|replyingCommentId|savedFilter|shareDraft|adminBlockTarget|expandedComments|savedPage|confirmAction|creatingFolder|isComposingShareTag|shareTagQuery|editingFolderId|isComposingAdminPromptSearch|authUserIdWarning|editingMessageId|isComposingAdminTagSearch|authError|copiedMessageId|pendingMakeImproveThread|isComposingSearch|myPageTab|makeBackendStatus|shareError|searchTipVisible|authDraft|makeBackendMessage|searchTipShown)$/;

const dynamicRendererPropertyPattern = /^(?:MakeFolderButtonView|MakeTemplateBarView|MakeSidePanelView|MessageBubbleView|MakeComposerView|MakePageView|MakeFeedView)$/;
const additionalInternalContextPropertyPattern = /^(?:findPrompt|findComment|findPromptById|findCommentById|handleError|callApi|maxFolders|makeState|confirm|userIdError|recover|renderPreservingMakeScroll|openConfirmAction|getFinalPromptText|copyTextToClipboard|makePromptTitle|getMakeMutationStateContext|getPromptMutationStateContext|getCommentMutationStateContext|toggleSavedMakeMessageState|getMakeControllerContext|autosizeTextarea|startNewMakeChatState|makeController|futureDate|demoToken|folderCount|focusLater|openThread|makeRevisionRequestKey|removePromptByIdState|refreshBackendHomePrompts|refreshMyPageDataAfterMutation|hydrateBackendAdminDataIfNeeded|parseSharedTags|stampCurrentUserOwnedPrompts|isDemoAuthToken|applyPublishedSavedPromptState|applyDeletedPromptState|applyUnsharedPromptState|getAdminHydrationEffectContext|getAdminReportRecords|getAdminManagedTags|matchesAdminPromptFilter|matchesAdminPromptQuery|getDisplayPromptAuthor|getPromptAuthorId|getAdminTagStatusLabel|getReportStatusLabel|getAuthorRevisionStatusLabel|getPromptRevisionRequest|getPromptSaveCount|getPromptViewCount)$/;
const productionManglePropertyPattern = new RegExp(
  `^(?!${dynamicRendererPropertyPattern.source.slice(1, -1)}$)(?:(?:${internalContextPropertyPattern.source.slice(1, -1)})|(?:${additionalInternalContextPropertyPattern.source.slice(1, -1)})|(?:state|savedPrompts|popularPrompts|commentsByPrompt))$`,
);

async function compressProductionJavaScript(metafile) {
  const outputs = Object.keys(metafile.outputs).filter((file) => file.endsWith(".js"));
  const nameCache = {};
  for (const output of outputs) {
    const source = fs.readFileSync(path.resolve(output), "utf8");
    const isApplicationEntry = metafile.outputs[output]?.entryPoint?.endsWith("src/app-entry.js") === true;
    const result = await terser.minify(source, {
      module: true,
      ecma: 2023,
      compress: {
        booleans_as_integers: true,
        keep_fargs: false,
        passes: 5,
        pure_getters: true,
        unsafe: true,
        unsafe_arrows: true,
        unsafe_methods: true,
        unsafe_proto: true,
        unsafe_undefined: true,
      },
      mangle: { properties: { keep_quoted: "strict", regex: productionManglePropertyPattern } },
      nameCache,
      format: { comments: isApplicationEntry ? /^!/ : false, ecma: 2023, semicolons: false },
    });
    if (!result.code) throw new Error(`Terser produced no output for ${output}`);
    const compressed = `${result.code}\n`;
    fs.writeFileSync(path.resolve(output), compressed, "utf8");
    metafile.outputs[output].bytes = Buffer.byteLength(compressed);
  }
}

async function writeProductionStyles(source, destination) {
  const result = await esbuild.transform(fs.readFileSync(source, "utf8"), {
    loader: "css",
    minify: true,
    target: ["chrome110", "firefox110"],
  });
  fs.writeFileSync(destination, result.code, "utf8");
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
      banner: { js: `/*! ${productionCompressionPolicy} */` },
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
    const output = Object.entries(result.metafile.outputs).find(([, metadata]) => metadata.entryPoint?.endsWith("src/app-entry.js"))?.[0];
    if (!output) throw new Error("Production bundle output was not created.");
    bundle = path.relative(outputRoot, path.resolve(output)).replaceAll("\\", "/");
    html = html.replace('./src/app-entry.js', `./${bundle}`);
    fs.mkdirSync(path.join(outputRoot, "assets", "styles"), { recursive: true });
    await writeProductionStyles(path.join(webRoot, "src", "styles.css"), path.join(outputRoot, "assets", "styles.css"));
    await writeProductionStyles(path.join(webRoot, "src", "styles", "make.css"), path.join(outputRoot, "assets", "styles", "make.css"));
    html = html.replaceAll("./src/styles.css", "./assets/styles.css").replaceAll("./src/styles/make.css", "./assets/styles/make.css");
  } else {
    fs.cpSync(path.join(webRoot, "src"), path.join(outputRoot, "src"), { recursive: true });
  }
  fs.writeFileSync(path.join(outputRoot, "index.html"), html, "utf8");
  if (bundleMetafile) fs.writeFileSync(path.join(outputRoot, "bundle-metafile.json"), `${JSON.stringify(bundleMetafile, null, 2)}\n`, "utf8");
  fs.writeFileSync(
    path.join(outputRoot, "build-manifest.json"),
    `${JSON.stringify({
      mode: production ? "production" : "development",
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
