"use strict";
export function createMakeExecutionWorkflows(ctx) {
    const { state, savedPrompts, promptTemplates, document, window, render, renderPreservingMakeScroll, showNotice, openConfirmAction, guardAdminUserAction, findPromptById, getFinalPromptText, copyTextToClipboard, makePromptTitle, getMakeMutationStateContext, toggleSavedMakeMessageState, getMakeControllerContext, autosizeTextarea, startNewMakeChatState, makeController, makeState } = ctx;
    async function copyMakeMessage(messageId) {
      const message = state.messages.find((item) => item.id === messageId);
      if (!message) return;
      const finalPrompt = getFinalPromptText(message);

      await copyTextToClipboard(finalPrompt);

      state.copiedMessageId = messageId;
      showNotice("프롬프트를 복사했습니다.");
      window.setTimeout(() => {
        if (state.copiedMessageId !== messageId) return;
        state.copiedMessageId = "";
        render();
      }, 1100);
    }

    function saveMakeMessage(messageId) {
      if (guardAdminUserAction()) return;

      const message = state.messages.find((item) => item.id === messageId);
      if (!message) return;
      const finalPrompt = getFinalPromptText(message);
      const result = toggleSavedMakeMessageState(getMakeMutationStateContext(), message, finalPrompt);
      showNotice(result === "removed" ? "메시지 저장을 해제했습니다." : "메시지를 저장했습니다.");
      render();
    }

    async function resendEditedMessage(messageId, value) {
      return makeController.resendEdited(getMakeControllerContext(), messageId, value);
    }

    function openShareFromMakeMessage(messageId) {
      const message = state.messages.find((item) => item.id === messageId);
      if (!message) return;
      if (guardAdminUserAction()) return;

      if (!state.isLoggedIn) {
        state.authView = "login";
        showNotice("공유하려면 로그인이 필요합니다.");
        return;
      }

      const finalPrompt = getFinalPromptText(message);
      state.shareDraft = {
        promptId: `make-share-${message.id}`,
        title: makePromptTitle(message.sourcePrompt || finalPrompt),
        text: finalPrompt,
        tags: [],
      };
      state.shareError = "";
      state.route = "share";
      render();
    }

    function openExecuteModal(messageId) {
      const message = state.messages.find((item) => item.id === messageId);
      if (!message) return;
      if (!confirmPlaceholderExecution(getFinalPromptText(message))) return;
      state.executeMessageId = messageId;
      state.executePromptId = null;
      renderPreservingMakeScroll();
    }

    function openPromptExecuteModal(promptId) {
      const prompt = findPromptById(promptId);
      if (!prompt) return;
      if (!confirmPlaceholderExecution(String(prompt.text || ""))) return;
      state.executePromptId = promptId;
      state.executeMessageId = null;
      renderPreservingMakeScroll();
    }

    function confirmPlaceholderExecution(text) {
      if (!hasPromptPlaceholders(text)) return true;
      return window.confirm(
        "아직 채워지지 않은 정보가 있습니다.\n\n그대로 실행하거나, 취소한 뒤 질문에 답해 더 정확하게 만들 수 있습니다.",
      );
    }

    function hasPromptPlaceholders(text) {
      return /\[[^\]\n]{1,80}\]/.test(String(text || ""));
    }

    async function executeMakeMessage(messageId, targetId) {
      const message = state.messages.find((item) => item.id === messageId);
      const prompt = findPromptById(state.executePromptId);
      const finalPrompt = message ? getFinalPromptText(message) : String(prompt?.text || "").trim();
      if (!finalPrompt) return;
      const target = getExecuteTarget(targetId);
      if (!target) return;
      const copied = await copyTextToClipboard(finalPrompt);
      const opened = window.open(target.url, "_blank", "noopener,noreferrer");

      state.executeMessageId = null;
      state.executePromptId = null;
      if (!opened) {
        showNotice(`${target.name} 팝업이 차단되었습니다. 프롬프트는 복사했으니 새 탭에서 직접 열어 붙여넣어 주세요.`);
      } else if (copied) {
        showNotice(`${target.name}로 이동합니다. 복사된 프롬프트를 입력란에 붙여넣어 실행하세요.`);
      } else {
        showNotice(`${target.name}로 이동합니다. 복사가 제한되면 Make의 Copy 버튼으로 다시 복사해주세요.`);
      }
      renderPreservingMakeScroll();
    }

    function getExecuteTarget(targetId) {
      const targets = {
        chatgpt: { name: "ChatGPT", url: "https://chatgpt.com/" },
        gemini: { name: "Google Gemini", url: "https://gemini.google.com/" },
        claude: { name: "Claude", url: "https://claude.ai/" },
      };

      return targets[targetId] || null;
    }

    function performTemplateApply(templateId, startNew = false) {
      const template = promptTemplates.find((item) => item.id === templateId);
      if (!template) return false;

      if (startNew) startNewMakeChatState(state);
      makeState.setMakeComposerDraft(state, template.prompt);
      render();
      window.setTimeout(() => {
        const textarea = document.querySelector("[data-autosize-textarea]");
        if (!textarea) return;
        textarea.focus();
        const firstBlankLine = textarea.value.split("\n").findIndex((line) => /:\s*$/.test(line));
        const lines = textarea.value.split("\n");
        const targetLineIndex = firstBlankLine >= 0 ? firstBlankLine : lines.length - 1;
        const cursorPosition = lines.slice(0, targetLineIndex + 1).join("\n").length;
        textarea.setSelectionRange(cursorPosition, cursorPosition);
        autosizeTextarea(textarea);
      }, 0);
      return true;
    }

    function applyTemplate(templateId) {
      if (state.messages.length && typeof openConfirmAction === "function") {
        openConfirmAction({
          type: "apply-template-new-chat",
          alternativeType: "apply-template-current-chat",
          targetId: templateId,
          title: "템플릿을 어디에 적용할까요?",
          message: "새 주제라면 새 대화에서 시작해야 기존 대화의 맥락과 섞이지 않습니다.",
          confirmLabel: "새 대화에서 시작",
          alternativeLabel: "현재 대화에 적용",
        });
        return;
      }
      performTemplateApply(templateId, false);
    }

    function toggleTemplateBar() {
      state.templateCollapsed = !state.templateCollapsed;
      render();
    }

    return Object.freeze({ copyMakeMessage, saveMakeMessage, resendEditedMessage, openShareFromMakeMessage, openExecuteModal, openPromptExecuteModal, confirmPlaceholderExecution, hasPromptPlaceholders, executeMakeMessage, getExecuteTarget, applyTemplate, performTemplateApply, toggleTemplateBar });
  }
