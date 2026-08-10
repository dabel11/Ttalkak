(function attach(global) {
  "use strict";
  function createMakeExecutionWorkflows(ctx) {
    const { state, savedPrompts, promptTemplates, document, window, render, renderPreservingMakeScroll, showNotice, guardAdminUserAction, findPromptById, getFinalPromptText, copyTextToClipboard, makePromptTitle, getMakeMutationStateContext, toggleSavedMakeMessageState, getMakeControllerContext, autosizeTextarea } = ctx;
    let templateToggleTimer = null;
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
      return window.TtalkakMakeController.resendEdited(getMakeControllerContext(), messageId, value);
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

    function applyTemplate(templateId) {
      const template = promptTemplates.find((item) => item.id === templateId);
      if (!template) return;

      window.TtalkakMakeState.setMakeComposerDraft(state, template.prompt);
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
    }

    function toggleTemplateBar(button) {
      window.clearTimeout(templateToggleTimer);

      if (state.templateCollapsed) {
        state.templateCollapsed = false;
        render();
        return;
      }

      const templateBar = button.closest(".make-template-bar");
      if (!templateBar) {
        state.templateCollapsed = true;
        render();
        return;
      }

      templateBar.classList.add("collapsing");
      button.setAttribute("aria-label", "분야 버튼 펼치기");
      button.setAttribute("aria-expanded", "false");
      button.innerHTML = "&gt;";
      templateToggleTimer = window.setTimeout(() => {
        state.templateCollapsed = true;
        render();
      }, 190);
    }

    return Object.freeze({ copyMakeMessage, saveMakeMessage, resendEditedMessage, openShareFromMakeMessage, openExecuteModal, openPromptExecuteModal, confirmPlaceholderExecution, hasPromptPlaceholders, executeMakeMessage, getExecuteTarget, applyTemplate, toggleTemplateBar });
  }
  const api = Object.freeze({ createMakeExecutionWorkflows });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TtalkakMakeExecutionWorkflows = api;
})(typeof window !== "undefined" ? window : globalThis);
