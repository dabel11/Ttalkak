(function attachMakeController(global) {
  "use strict";
  function collectAskAnswerPayload(form, model) {
    const inputs = [...form.querySelectorAll("[data-ask-answer-input]")];
    const questions = inputs.map((input) => ({ field: input.name, question: input.closest("li")?.querySelector("label span")?.textContent?.trim() || input.name, importance: input.required ? "required" : "recommended" }));
    const values = Object.fromEntries(inputs.map((input) => [input.name, input.value]));
    return { inputs, result: model.composeAskAnswers(questions, values) };
  }
  function submitAskAnswers(ctx, form) {
    const { inputs, result } = collectAskAnswerPayload(form, ctx.model);
    const invalid = inputs.filter((input) => result.missingFields.includes(input.name));
    inputs.forEach((input) => {
      if (invalid.includes(input)) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    });
    if (result.missingFields.length) {
      invalid[0]?.focus();
      const progress = form.querySelector("[data-ask-answer-progress]");
      if (progress) progress.textContent = `필수 답변 ${result.missingFields.length}개를 더 입력해주세요.`;
      return false;
    }
    if (!result.message) return false;
    const composer = ctx.root.querySelector("[data-composer]");
    const textarea = composer?.querySelector('[name="prompt"]');
    if (!composer || !textarea) return false;
    textarea.value = result.message;
    ctx.setDraft(result.message);
    ctx.submit(composer);
    return true;
  }

  async function submitPrompt(ctx, composer) {
    if (ctx.guard()) return;
    if (ctx.isBusy()) { ctx.notice("이미 프롬프트를 개선하고 있습니다. 잠시만 기다려주세요."); return; }
    const prompt = String(new FormData(composer).get("prompt") || "").trim();
    if (!prompt) return;
    ctx.bumpInteraction();
    if (!ctx.state.isLoggedIn && ctx.state.guestImproveCount >= ctx.freeLimit) { ctx.state.authView = "login"; ctx.renderPreservingScroll(); return; }
    if (!ctx.state.isLoggedIn) ctx.state.guestImproveCount += 1;
    const now = Date.now();
    const threadId = ctx.state.activeThreadId || `thread-${now}`;
    const userMessageId = `user-${now}`;
    const assistantMessageId = `make-${now}`;
    const history = ctx.buildHistory(ctx.state.messages);
    ctx.startRequest();
    ctx.setDraft("");
    ctx.appendUser(threadId, { id: userMessageId, role: "user", content: prompt });
    ctx.setThinking(true);
    ctx.updateThread(threadId);
    ctx.render();
    ctx.scrollLatest();
    let result;
    try {
      await ctx.waitForPaint();
      result = await ctx.improve(prompt, { history, threadId });
    } catch (error) {
      ctx.setThinking(false);
      ctx.stopInFlight();
      const recovered = await ctx.recover({ threadId, prompt, localMessagesSnapshot: [...ctx.state.messages] });
      if (recovered) { ctx.completeRequest(); ctx.notice("요청 상태를 서버 대화 기준으로 다시 확인했습니다."); return; }
      ctx.failRequest(userMessageId, ctx.classifyError(error));
      if (!ctx.state.isLoggedIn) ctx.state.guestImproveCount = Math.max(0, ctx.state.guestImproveCount - 1);
      ctx.setBackendFailure();
      ctx.handleError(error, "프롬프트 개선 요청에 실패했습니다.");
      ctx.render();
      ctx.scrollLatest();
      return;
    }
    ctx.setThinking(false);
    ctx.completeRequest();
    ctx.appendAssistant({ id: assistantMessageId, role: "assistant", mode: result.mode || "improve", content: result.text || "", answer: result.answer || "", improvedPrompt: result.improvedPrompt || "", questions: result.questions || [], changes: result.changes || [], fields: result.fields || [], techniques: result.techniques || [], summary: result.summary || "", sources: result.sources || [], ragStatus: result.ragStatus || "", ragMessage: result.ragMessage || "", sourcePrompt: prompt });
    ctx.updateThread(threadId);
    ctx.applyPendingThread(threadId);
    if (ctx.shouldSync()) { const refreshed = await ctx.refreshThread(threadId); if (!refreshed) ctx.render(); if (result.mode === "ask") ctx.focusAsk(); return; }
    ctx.syncThread(threadId);
    ctx.render();
    if (result.mode === "ask") ctx.focusAsk();
    ctx.scrollLatest();
  }

  async function resendEdited(ctx, messageId, value) {
    const cleanValue = String(value || "").trim();
    const index = ctx.findEditableMessage(messageId);
    if (index < 0 || !cleanValue || ctx.guard()) return;
    if (ctx.isBusy()) { ctx.notice(ctx.messages.busy); return; }
    const now = Date.now();
    const threadId = ctx.getActiveThreadId() || `thread-${now}`;
    const history = ctx.buildHistory(ctx.getMessages().slice(0, index));
    ctx.startRequest();
    if (ctx.shouldSync()) {
      if (!ctx.getBackendThreadId(threadId)) { ctx.completeRequest(); ctx.notice(ctx.messages.missingThread); return; }
      try {
        await ctx.improve(cleanValue, { threadId, messageId, category: "prompt_techniques" });
        ctx.clearEditing();
        const refreshed = await ctx.refreshThread(threadId);
        if (!refreshed) ctx.render();
        ctx.notice(ctx.messages.edited);
      } catch (error) {
        ctx.setBackendFailure();
        if (Number(error?.status || 0) === 404) await ctx.refreshThreads();
        else await ctx.recover({ threadId, prompt: cleanValue, localMessagesSnapshot: [...ctx.getMessages()] }).catch(() => null);
        ctx.handleError(error, ctx.messages.editFailed);
        ctx.render();
      } finally { ctx.stopInFlight(); }
      return;
    }
    const assistantMessageId = `make-${now}`;
    ctx.applyEdit(index, cleanValue, now);
    ctx.setThinking(true);
    ctx.queueScroll(messageId);
    ctx.render();
    let result;
    try {
      await ctx.waitForPaint();
      result = await ctx.improve(cleanValue, { history, threadId });
    } catch (error) {
      ctx.setThinking(false);
      ctx.stopInFlight();
      ctx.failRequest(messageId, ctx.classifyError(error));
      ctx.setBackendFailure();
      ctx.handleError(error, ctx.messages.improveFailed);
      ctx.queueScroll(messageId);
      ctx.render();
      return;
    }
    ctx.setThinking(false);
    ctx.completeRequest();
    ctx.finishEdit({ id: assistantMessageId, role: "assistant", mode: result.mode || "improve", content: result.text || "", answer: result.answer || "", improvedPrompt: result.improvedPrompt || "", questions: result.questions || [], changes: result.changes || [], fields: result.fields || [], techniques: result.techniques || [], summary: result.summary || "", sources: result.sources || [], ragStatus: result.ragStatus || "", ragMessage: result.ragMessage || "", sourcePrompt: cleanValue });
    ctx.queueScroll(assistantMessageId);
    ctx.updateThread(threadId);
    ctx.applyPendingThread(threadId);
    ctx.syncThread(threadId);
    ctx.notice(ctx.messages.edited);
    ctx.render();
    if (result.mode === "ask") ctx.focusAsk();
  }

  global.TtalkakMakeController = Object.freeze({ collectAskAnswerPayload, submitAskAnswers, submitPrompt, resendEdited });
})(window);
