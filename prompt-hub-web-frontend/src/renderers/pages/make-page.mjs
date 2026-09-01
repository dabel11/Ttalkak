import { parts } from "./make-message-parts.mjs";

  "use strict";

  const {
    MessageChangesView,
    MessageEvidenceNoticeView,
    MessageFieldsView,
    MessageQuestionsView,
    MessageTechniquesView,
    normalizeMessageChanges,
    normalizeMessageFields,
    normalizeLegacyAskAnswer,
    normalizeMessageQuestions,
    normalizeMessageTechniques,
    renderPromptTextWithPlaceholders,
  } = parts;

  if (
    [
      MessageChangesView,
      MessageEvidenceNoticeView,
      MessageFieldsView,
      MessageQuestionsView,
      MessageTechniquesView,
      normalizeMessageChanges,
      normalizeMessageFields,
      normalizeLegacyAskAnswer,
      normalizeMessageQuestions,
      normalizeMessageTechniques,
      renderPromptTextWithPlaceholders,
    ].some((fn) => typeof fn !== "function")
  ) {
    throw new Error("TTALKAK Make message parts failed to load.");
  }

  function MakePageView(ctx, data) {
    const {
      composerHtml,
      feedHtml,
      hasMessages,
      sidePanelHtml,
    } = data;

    return `
      <section class="make-page ${hasMessages ? "has-conversation" : "is-empty"}" aria-label="프롬프트 첨삭">
        <button class="make-drawer-toggle" type="button" data-toggle-make-drawer aria-label="대화 목록" aria-controls="make-conversation-drawer" aria-expanded="false">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <path d="M6.5 4.5h11a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H10l-4.5 3v-3.25a3 3 0 0 1-2-2.75v-7a3 3 0 0 1 3-3Z"></path>
            <path d="M8 9h8M8 13h6"></path>
          </svg>
          <span class="make-drawer-toggle-label">대화</span>
        </button>
        ${sidePanelHtml}
        <button class="make-drawer-backdrop" type="button" data-close-make-drawer aria-label="대화 목록 바깥 영역 닫기" tabindex="-1"></button>
        ${feedHtml}
        ${composerHtml}
      </section>
    `;
  }

  function MakeFeedView(ctx, data) {
    const { icons, escapeHtml } = ctx;
    const { hasMessages, isThinking, messages, renderMessageBubble, templateBarHtml, threadPolicyNote } = data;

    return `
      <div class="chat-feed">
        ${templateBarHtml}
        ${threadPolicyNote ? `<p class="make-thread-policy-note" role="note">${escapeHtml(threadPolicyNote)}</p>` : ""}
        ${
          hasMessages
            ? renderConversationTurns(messages, renderMessageBubble, isThinking)
            : `<div class="empty-state make-empty">
                <div class="spark-badge" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none">
                    <path d="m14.5 4.5 1.1 2.9 2.9 1.1-2.9 1.1-1.1 2.9-1.1-2.9-2.9-1.1 2.9-1.1 1.1-2.9Z"></path>
                    <path d="m8 11 1.5 3.5L13 16l-3.5 1.5L8 21l-1.5-3.5L3 16l3.5-1.5L8 11Z"></path>
                    <path d="m18.5 14.5.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8Z"></path>
                  </svg>
                </div>
                <h1>프롬프트 첨삭 도우미</h1>
                <p>AI 도구에서 최적의 결과를 얻기 위한 프롬프트를 작성해보세요.<br />더 명확하고 효과적인 프롬프트로 개선해드립니다.</p>
              </div>`
        }
        ${isThinking && (!messages.length || messages.at(-1)?.role !== "user") ? MessageThinkingView() : ""}
        ${hasMessages ? `<button class="make-scroll-latest" type="button" data-scroll-latest-message aria-label="최신 대화로 이동">${icons.send}</button>` : ""}
      </div>
    `;
  }

  function renderConversationTurns(messages, renderMessageBubble, isThinking) {
    const turns = [];
    let current = [];
    messages.forEach((message) => {
      if (message?.role === "user" && current.length) {
        turns.push(current);
        current = [];
      }
      current.push(message);
    });
    if (current.length) turns.push(current);
    return turns.map((turn, index) => {
      const waitingForReply = isThinking && index === turns.length - 1 && turn.at(-1)?.role === "user";
      return `<section class="conversation-turn ${waitingForReply ? "is-processing" : ""}" aria-label="대화 ${index + 1}">${turn.map(renderMessageBubble).join("")}${waitingForReply ? MessageThinkingView() : ""}</section>`;
    }).join("");
  }

  function MessageThinkingView() {
    return `
      <div class="message-group assistant-group make-thinking-indicator make-message-enter" data-make-thinking-indicator>
        <article class="message assistant thinking-message" aria-live="polite">
          <span class="thinking-label" data-make-progress-label>요청을 분석하고 있습니다</span>
          <small class="thinking-elapsed" data-make-progress-elapsed>0초</small>
          <span class="thinking-dots" aria-hidden="true"><span></span><span></span><span></span></span>
          <button class="make-request-cancel" type="button" data-cancel-make-request aria-label="요청 취소">취소</button>
        </article>
      </div>
    `;
  }

  function MakeTemplateBarView(ctx, data) {
    const { escapeAttr, escapeHtml } = ctx;
    const { promptTemplates, selectedTemplateId, templateCollapsed } = data;
    const customTemplate = promptTemplates.find((template) => template.id === "custom");
    const fieldTemplates = promptTemplates.filter((template) => template.id !== "custom");
    const selectedTemplate = promptTemplates.find((template) => template.id === selectedTemplateId);
    const hasSelectedField = Boolean(selectedTemplate && selectedTemplate.id !== "custom");
    const collapsedLabel = hasSelectedField ? selectedTemplate.label : "분야 선택";
    const collapsedAriaLabel = hasSelectedField ? `현재 분야: ${collapsedLabel}, 분야 선택 펼치기` : "분야 선택 펼치기";

    return `
      <div class="make-template-bar ${templateCollapsed ? "collapsed" : ""}" aria-label="분야 선택">
        <button class="template-toggle" type="button" data-toggle-templates aria-label="${templateCollapsed ? collapsedAriaLabel : "분야 선택 접기"}" aria-expanded="${templateCollapsed ? "false" : "true"}">
          ${templateCollapsed ? "" : `<span class="template-toggle-mark" aria-hidden="true">‹</span>`}
          <span class="template-toggle-label">${escapeHtml(templateCollapsed ? collapsedLabel : "분야 선택")}</span>
          <svg class="template-toggle-chevron" aria-hidden="true" viewBox="0 0 16 16" fill="none"><path d="m4 6 4 4 4-4"></path></svg>
        </button>
        ${
          templateCollapsed
            ? ""
            : `<div class="template-list">
                ${fieldTemplates.map((template) => `<button class="${selectedTemplateId === template.id ? "active" : ""}" type="button" data-template="${escapeAttr(template.id)}" aria-pressed="${selectedTemplateId === template.id ? "true" : "false"}" title="${escapeAttr(template.description || `${template.label} 템플릿`)}">${escapeHtml(template.label)}</button>`).join("")}
              </div>`
        }
        ${templateCollapsed ? "" : `<div class="template-guidance"><span>분야를 선택하거나</span>${customTemplate ? `<button class="template-custom-action ${selectedTemplateId === customTemplate.id ? "active" : ""}" type="button" data-template="${escapeAttr(customTemplate.id)}" aria-pressed="${selectedTemplateId === customTemplate.id ? "true" : "false"}">직접 입력</button>` : ""}</div>`}
      </div>
    `;
  }

  function MakeComposerView(ctx, data) {
    const { icons, escapeHtml } = ctx;
    const { composerDraft, hasMessages, isThinking } = data;
    const canSubmit = !isThinking && Boolean(String(composerDraft || "").trim());

    return `
      <form class="composer ${hasMessages ? "has-newchat" : ""}" data-composer>
        <span class="sr-only" role="status" aria-live="polite" data-composer-restore-status></span>
        <textarea name="prompt" rows="1" data-autosize-textarea aria-label="개선할 프롬프트" placeholder="프롬프트를 입력하세요…" ${isThinking ? "disabled" : ""}>${escapeHtml(composerDraft)}</textarea>
        <button class="send-button" type="submit" aria-label="보내기" ${canSubmit ? "" : "disabled"}>${icons.send}</button>
      </form>
    `;
  }

  function MakeSidePanelView(ctx, data) {
    const { icons, escapeAttr, escapeHtml, formatShortDate } = ctx;
    const {
      activeFolderName,
      activeFolderId,
      activeThreadId,
      canCreateFolder,
      canManageFolders,
      canStartThreadFolderCreate,
      creatingFolder,
      creatingThreadFolderId,
      customFolderCount,
      folders,
      makeBackendMessage,
      maxCustomFolders,
      openThreadMenuId,
      renderFolderButton,
      threadCount,
      visibleFolders,
      visibleThreads,
      getThreadFolderId,
    } = data;

    return `
      <aside class="make-side-panel" id="make-conversation-drawer" aria-label="Make 최근 대화" tabindex="-1">
        <button class="make-drawer-close" type="button" data-close-make-drawer aria-label="대화 목록 닫기">&times;</button>
        <section class="make-folder-section">
          <div class="make-side-head">
            <span class="make-side-title"><strong>폴더</strong><small>${visibleFolders.length + 1}</small></span>
            <button class="make-side-create" type="button" data-show-folder-form ${canCreateFolder ? "" : "disabled"} aria-label="새 폴더" title="${canManageFolders ? (canCreateFolder ? "새 폴더 만들기" : `폴더는 최대 ${maxCustomFolders}개까지 만들 수 있습니다.`) : "로그인하면 대화를 폴더로 정리할 수 있습니다."}">+</button>
          </div>
          ${!canManageFolders ? `<p class="make-folder-limit">로그인하면 대화를 폴더로 정리할 수 있습니다.</p>` : ""}
          ${canManageFolders && !canCreateFolder ? `<p class="make-folder-limit">폴더는 최대 ${maxCustomFolders}개까지 만들 수 있습니다.</p>` : ""}
          ${makeBackendMessage ? `<div class="make-backend-note"><span>${escapeHtml(makeBackendMessage)}</span>${makeBackendMessage.startsWith("데모 계정") ? `<details class="make-info-disclosure"><summary aria-label="데모 계정 저장 방식 자세히 보기">i</summary><span class="make-info-popover" role="note">서버와 동기화하지 않고 이 브라우저에만 대화를 저장합니다.</span></details>` : ""}</div>` : ""}
          ${
            creatingFolder
              ? `<form class="make-folder-form" data-folder-create-form>
                  <input name="folderName" type="text" placeholder="폴더 이름" autocomplete="off" />
                  <button type="submit">추가</button>
                  <button type="button" data-cancel-folder-create>취소</button>
                </form>`
              : ""
          }
          <div class="make-folder-list">
            ${renderFolderButton("all", "전체", threadCount)}
            ${visibleFolders.slice(0, 3).map((folder) => renderFolderButton(folder.id, folder.name, folder.threadCount)).join("")}
            ${visibleFolders.length > 3 ? `<details class="make-folder-overflow" ${visibleFolders.slice(3).some((folder) => folder.id === activeFolderId) ? "open" : ""}>
              <summary>폴더 ${visibleFolders.length - 3}개 더 보기</summary>
              <div>${visibleFolders.slice(3).map((folder) => renderFolderButton(folder.id, folder.name, folder.threadCount)).join("")}</div>
            </details>` : ""}
          </div>
        </section>
        <section class="make-recent-section">
          <div class="make-side-head">
            <span class="make-side-title"><strong title="${escapeAttr(activeFolderName)}">${escapeHtml(formatMakeSidebarLabel(activeFolderName, "최근 대화", 18))}</strong><small>${visibleThreads.length}</small></span>
            <button class="make-side-create" type="button" data-new-chat aria-label="새 대화" title="새 대화">+</button>
          </div>
          <label class="make-recent-search">
            <span class="sr-only">최근 대화 검색</span>
            <input type="search" data-recent-thread-search placeholder="최근 대화 검색" autocomplete="off" />
            <button type="button" data-clear-recent-thread-search aria-label="최근 대화 검색어 지우기" hidden>&times;</button>
          </label>
          <p class="make-recent-search-status" data-recent-thread-search-status aria-live="polite" hidden></p>
          ${
          visibleThreads.length
            ? `<div class="recent-thread-list">
                ${visibleThreads.map((thread, index) => `
                  ${index === 0 || visibleThreads[index - 1]?.dateGroup !== thread.dateGroup ? `<h3 class="recent-thread-group">${escapeHtml(thread.dateGroup || "이전")}</h3>` : ""}
                  <article class="recent-thread ${activeThreadId === thread.id ? "active" : ""} ${openThreadMenuId === thread.id ? "menu-open" : ""}" data-thread-item="${escapeAttr(thread.id)}">
                    <button class="recent-thread-main" type="button" data-open-thread="${escapeAttr(thread.id)}">
                      <strong title="${escapeAttr(thread.title)}">${escapeHtml(formatMakeSidebarLabel(thread.title, "대화", 24))}</strong>
                      ${isDuplicateThreadPreview(thread.title, thread.preview) ? "" : `<span title="${escapeAttr(thread.preview)}">${escapeHtml(formatMakeSidebarLabel(thread.preview, "대화 내용 없음", 36))}</span>`}
                      <small>${formatMakeSidebarDate(thread.createdAt, formatShortDate)}</small>
                    </button>
                    <div class="recent-thread-menu-wrap">
                      <button class="recent-thread-more" type="button" data-thread-menu="${escapeAttr(thread.id)}" aria-label="${escapeAttr(formatMakeSidebarLabel(thread.title, "대화", 40))} 대화 더보기" aria-expanded="${openThreadMenuId === thread.id ? "true" : "false"}">${icons.more}</button>
                      ${
                        openThreadMenuId === thread.id
                          ? `<div class="recent-thread-menu" role="menu">
                              <label class="recent-thread-folder-field">
                                <span>폴더 이동</span>
                                <select class="thread-folder-select" data-thread-folder="${escapeAttr(thread.id)}" aria-label="대화 폴더" ${canManageFolders ? "" : "disabled"} title="${canManageFolders ? "대화 폴더 이동" : "로그인하면 대화를 폴더로 정리할 수 있습니다."}">
                                  ${folders.map((folder) => `<option value="${escapeAttr(folder.id)}" ${getThreadFolderId(thread) === folder.id ? "selected" : ""}>${escapeHtml(folder.name)}</option>`).join("")}
                                </select>
                              </label>
                              ${
                                creatingThreadFolderId === thread.id
                                  ? `<form class="thread-folder-create-form" data-thread-folder-create-form="${escapeAttr(thread.id)}">
                                      <input name="folderName" type="text" placeholder="새 폴더 이름" autocomplete="off" ${canManageFolders ? "" : "disabled"} />
                                      <div>
                                        <button type="submit" ${canManageFolders ? "" : "disabled"}>이동</button>
                                        <button type="button" data-cancel-thread-folder-create>취소</button>
                                      </div>
                                    </form>`
                                  : `<button type="button" data-start-thread-folder-create="${escapeAttr(thread.id)}" ${canStartThreadFolderCreate ? "" : "disabled"} role="menuitem"><span>+</span><span>새 폴더로 이동...</span></button>`
                              }
                              <button type="button" data-delete-thread="${escapeAttr(thread.id)}" role="menuitem">${icons.trash}<span>삭제</span></button>
                            </div>`
                          : ""
                      }
                    </div>
                  </article>
                `).join("")}
              </div>
              <div class="make-recent-search-empty" data-recent-thread-search-empty hidden>
                <strong>검색 결과가 없습니다</strong>
                <button type="button" data-clear-recent-thread-search>검색어 지우기</button>
              </div>`
            : `<p class="recent-empty">아직 저장된 대화가 없습니다.</p>`
          }
        </section>
      </aside>
    `;
  }

  function clipMakeSidebarText(value, maxLength = 28) {
    const clean = String(value || "").replace(/\s+/g, " ").trim();
    if (!clean) return "";
    return clean.length > maxLength ? `${clean.slice(0, maxLength).trim()}...` : clean;
  }

  function formatMakeSidebarLabel(value, fallback, maxLength = 28) {
    const clean = String(value || "").replace(/\s+/g, " ").trim();
    if (!clean) return fallback;
    const looksLikeResponseBody = clean.length > 90 || /\*\*|^---|개선된 프롬프트|수행 방식|사용자 요청|참고한 프롬프트 기법/.test(clean);
    if (looksLikeResponseBody) return fallback;
    return clipMakeSidebarText(clean, maxLength);
  }

  function normalizeSidebarComparisonText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLocaleLowerCase();
  }

  function isDuplicateThreadPreview(title, preview) {
    const normalizedTitle = normalizeSidebarComparisonText(title);
    const normalizedPreview = normalizeSidebarComparisonText(preview);
    return !normalizedPreview || normalizedPreview === normalizedTitle;
  }

  function formatMakeSidebarDate(value, fallbackFormatter) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return fallbackFormatter(value);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayDifference = Math.round((today.getTime() - target.getTime()) / 86400000);
    if (dayDifference === 0) return `오늘 ${date.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit" })}`;
    if (dayDifference === 1) return "어제";
    if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}월 ${date.getDate()}일`;
    return fallbackFormatter(value);
  }

  function MakeFolderButtonView(ctx, data) {
    const { icons, escapeAttr, escapeHtml, formatNumber } = ctx;
    const { canManage, count, folderId, isActive, isEditing, isMenuOpen, isUserFolder, name } = data;
    const safeFolderId = escapeAttr(folderId);
    const displayName = formatMakeSidebarLabel(name, "새 폴더", 18);

    if (isEditing) {
      return `
        <form class="make-folder-edit-form" data-folder-edit-form="${safeFolderId}">
          <input name="folderName" value="${escapeAttr(name)}" />
          <button type="submit">저장</button>
          <button type="button" data-cancel-folder-edit>취소</button>
        </form>
      `;
    }

    return `
      <div class="make-folder-item ${isUserFolder ? "user-folder" : "system-folder"} ${isActive ? "active" : ""} ${isMenuOpen ? "menu-open" : ""}" data-folder-item="${safeFolderId}">
        <button type="button" data-open-folder="${safeFolderId}" title="${escapeAttr(name)}">${icons.bookmark}<span>${escapeHtml(displayName)}</span><em>${formatNumber(count)}</em></button>
        ${
          canManage
            ? `<div class="make-folder-menu-wrap">
                <button class="make-folder-more" type="button" data-folder-menu="${safeFolderId}" aria-label="${escapeAttr(name)} 폴더 더보기" aria-expanded="${isMenuOpen ? "true" : "false"}">${icons.more}</button>
                ${
                  isMenuOpen
                    ? `<div class="make-folder-menu" role="menu">
                        <button type="button" data-edit-folder="${safeFolderId}" role="menuitem">${icons.edit}<span>이름 변경</span></button>
                        <button type="button" data-delete-folder="${safeFolderId}" role="menuitem">${icons.trash}<span>삭제</span></button>
                      </div>`
                    : ""
                }
              </div>`
            : ""
        }
      </div>
    `;
  }

  function MessageBubbleView(ctx, data) {
    const { icons, escapeAttr, escapeHtml } = ctx;
    const { answer, canSplit, changes, content, failureAction, failureKind, failureMessage, failureRepeated, failureRetryable, failureTitle, failureTone, fields, hasExecutablePrompt, id, improvedPrompt, isCopied, isEditing, isSaved, isThinking, isUnchanged, mode, questions, ragStatus, recoveryAction, retryMode, retryTargetContent, role, summary, techniques } = data;
    const isAssistant = role === "assistant";
    const isAsk = mode === "ask";
    const normalizedChanges = normalizeMessageChanges(changes);
    const normalizedFields = normalizeMessageFields(fields);
    const legacyAsk = !hasExecutablePrompt ? normalizeLegacyAskAnswer(answer || content) : { leadText: "", questions: [] };
    const effectiveIsAsk = isAsk || (!hasExecutablePrompt && legacyAsk.questions.length > 0);
    const normalizedQuestions = normalizeMessageQuestions([...(Array.isArray(questions) ? questions : questions ? [questions] : []), ...legacyAsk.questions]);
    const normalizedTechniques = normalizeMessageTechniques(techniques);
    const safeMessageId = escapeAttr(id);
    const safeContent = escapeHtml(content);
    const recoveredContent = String(content || answer || summary || improvedPrompt || "").trim();
    const resultPrompt = hasExecutablePrompt ? String(improvedPrompt || content || answer || summary || "").trim() : "";
    const explanationText = String(summary || answer || "").trim();
    const leadText = normalizedQuestions.length
      ? String(summary || legacyAsk.leadText || answer || (effectiveIsAsk ? "정확한 프롬프트를 만들기 위해 아래 정보를 보완해주세요." : content) || "")
      : hasExecutablePrompt
        ? explanationText && explanationText !== resultPrompt ? explanationText : ""
        : recoveredContent;
    const questionSection = effectiveIsAsk && normalizedQuestions.length
      ? MessageQuestionsView({ escapeAttr, escapeHtml }, { isAsk: effectiveIsAsk, isThinking, messageId: id, questions: normalizedQuestions })
      : "";
    const changeSection = normalizedChanges.length
      ? MessageChangesView({ escapeHtml }, { changes: normalizedChanges })
      : "";
    const fieldSection = normalizedFields.length
      ? MessageFieldsView({ escapeHtml }, { collapsible: hasExecutablePrompt, fields: normalizedFields })
      : "";
    const techniqueSection = normalizedTechniques.length
      ? MessageTechniquesView({ escapeHtml }, { techniques: normalizedTechniques })
      : "";
    const evidenceSection = isAssistant && !isAsk && String(ragStatus || "").toLowerCase() === "no_evidence"
      ? MessageEvidenceNoticeView()
      : "";

    if (isAssistant) {
      return `
        <div class="message-group assistant-group make-message-enter" data-message-id="${safeMessageId}">
          <article class="message assistant">
            ${evidenceSection}
            ${leadText ? `<p>${renderPromptTextWithPlaceholders(leadText, escapeHtml)}</p>` : ""}
            ${isUnchanged ? `<div class="unchanged-followup"><button type="button" data-refine-unchanged="${safeMessageId}">내용을 구체화하기</button><small>대상, 목적, 형식처럼 필요한 조건을 덧붙여 보세요.</small></div>` : ""}
            ${resultPrompt ? `<section class="message-result-prompt" aria-label="개선된 프롬프트"><strong>개선된 프롬프트</strong><div>${renderPromptTextWithPlaceholders(resultPrompt, escapeHtml)}</div></section>` : ""}
            ${hasExecutablePrompt ? MessageActionsView(ctx, { isCopied, isSaved, messageId: safeMessageId }) : ""}
            ${fieldSection}
            ${changeSection}
            ${questionSection}
            ${techniqueSection}
          </article>
        </div>
      `;
    }

    return `
      <div class="message-group user-group make-message-enter" data-message-id="${safeMessageId}">
        ${UserMessageView(ctx, { canSplit, content, failureAction, failureKind, failureMessage, failureRepeated, failureRetryable, failureTitle, failureTone, isEditing, recoveryAction, retryMode, retryTargetContent, role, safeContent, safeMessageId })}
      </div>
    `;
  }

  function MessageActionsView(ctx, data) {
    const { icons } = ctx;
    const { isCopied, isSaved, messageId } = data;
    return `<footer class="message-actions">
      <button type="button" data-copy-message="${messageId}">${isCopied ? icons.check : icons.copy}<span>${isCopied ? "Copied" : "Copy"}</span></button>
      <button class="${isSaved ? "saved" : ""}" type="button" data-save-message="${messageId}">${icons.bookmark}<span>${isSaved ? "Saved" : "Save"}</span></button>
      <button type="button" data-share-message="${messageId}">${icons.share}<span>Share</span></button>
      <button type="button" data-execute-message="${messageId}">${icons.play}<span>Execute</span></button>
    </footer>`;
  }

  function UserMessageView(ctx, data) {
    const { icons, escapeAttr, escapeHtml } = ctx;
    const { canSplit, content, failureAction, failureKind, failureMessage, failureRepeated, failureRetryable, failureTitle, failureTone, isEditing, recoveryAction, retryMode, retryTargetContent, role, safeContent, safeMessageId } = data;
    if (isEditing) return `<form class="message-edit-form" data-edit-message-form="${safeMessageId}"><textarea name="message" rows="3">${safeContent}</textarea><div class="message-edit-actions"><button type="button" data-cancel-message-edit>취소</button><button type="submit">다시 전송</button></div></form>`;
    const failureRole = failureKind === "cancelled" ? "status" : "alert";
    const recoveryPending = Boolean(recoveryAction);
    const recoveryLabel = recoveryAction === "refresh" ? "불러오는 중…" : recoveryAction === "retry" ? "보내는 중…" : "";
    const failureButton = failureAction?.id === "login"
      ? `<button type="button" data-make-login>${escapeHtml(failureAction.label)}</button>`
      : failureAction?.id === "reload-thread"
        ? `<button type="button" data-refresh-concurrent="${safeMessageId}" ${recoveryPending ? "disabled aria-busy=\"true\"" : ""}>${escapeHtml(recoveryLabel || failureAction.label)}</button>`
      : failureAction?.id === "retry-after-refresh"
        ? `<button type="button" data-retry-concurrent="${safeMessageId}" ${recoveryPending ? "disabled aria-busy=\"true\"" : ""}>${escapeHtml(recoveryLabel || failureAction.label)}</button>`
      : failureRetryable ? `<button type="button" data-retry-message="${safeMessageId}">${escapeHtml(failureAction?.label || "다시 시도")}</button>` : "";
    const editDiffers = retryMode === "edit" && String(content || "").trim() !== String(retryTargetContent || "").trim();
    const editPreview = failureMessage && retryMode === "edit" ? `<div class="concurrency-compare" aria-label="충돌한 수정 내용 비교"><small><b>수정한 내용</b>${escapeHtml(String(content || "").slice(0, 120))}</small><small><b>서버 최신 내용</b>${escapeHtml(String(retryTargetContent || "내용을 찾지 못했습니다.").slice(0, 120))}</small>${editDiffers ? `<em>두 내용이 다릅니다. 확인한 뒤 다시 보내 주세요.</em>` : ""}</div>` : "";
    const newChatButton = failureRepeated ? `<button type="button" class="secondary" data-concurrency-new-chat="${safeMessageId}" ${recoveryPending ? "disabled" : ""}>새 대화에서 계속하기</button><small class="concurrency-new-chat-help">현재 입력을 새 대화로 옮기며 기존 대화는 유지됩니다.</small>` : "";
    const concurrencyFailure = failureKind === "concurrency" || failureKind === "concurrency_refresh";
    const failureStatus = !failureMessage ? "" : concurrencyFailure
      ? `<div class="message-failure-status ${escapeAttr(failureTone)}" role="${failureRole}"><strong>${escapeHtml(failureTitle)}</strong><span>${escapeHtml(failureMessage)}</span>${editPreview}<div class="message-failure-actions">${failureButton}${newChatButton}</div></div>`
      : `<div class="message-failure-status" role="${failureRole}">${escapeHtml(failureMessage)} ${failureButton}</div>`;
    return `<article class="message ${escapeAttr(role)}"><p>${renderPromptTextWithPlaceholders(content, escapeHtml)}</p>${failureStatus}<div class="user-message-actions">${canSplit ? `<button class="user-message-split-button" type="button" data-split-thread-from="${safeMessageId}" aria-label="이 메시지부터 새 대화로 분리" title="새 대화로 분리">↗</button>` : ""}<button class="user-message-edit-button" type="button" data-edit-message="${safeMessageId}" aria-label="메시지 수정" title="수정">${icons.edit}</button></div></article>`;
  }

  const renderers = Object.freeze({
    MakeComposerView,
    MakeFeedView,
    MakeFolderButtonView,
    MakePageView,
    MakeSidePanelView,
    MakeTemplateBarView,
    MessageActionsView,
    MessageBubbleView,
    UserMessageView,
  });
  if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent("ttalkak:route-renderers-registered", { detail: { renderers: {
    MakeComposerView, MakeFeedView, MakeFolderButtonView, MakePageView, MakeSidePanelView, MakeTemplateBarView,
    MessageActionsView, MessageBubbleView, UserMessageView,
  } } }));
export { renderers };
