import { isRequestIdReusedError, isThreadConcurrencyError, resolveMakeRequestId } from "../utils/make-request-id.mjs";

"use strict";
  const concurrencyCounts = new Map();
  function recordConcurrency(threadId) {
    const key = String(threadId || "local");
    const count = (concurrencyCounts.get(key) || 0) + 1;
    concurrencyCounts.set(key, count);
    return count;
  }
  function resetConcurrency(threadId) {
    if (threadId == null || threadId === "") concurrencyCounts.clear();
    else concurrencyCounts.delete(String(threadId));
  }
  async function handleThreadConcurrency(ctx, { error, prompt, requestId, retryMessageId = "", threadId }) {
    if (!isThreadConcurrencyError(error)) return false;
    const failure = ctx.classifyError(error);
    const retryMode = retryMessageId ? "edit" : "follow-up";
    const repeated = recordConcurrency(threadId) >= 2;
    const refreshed = await ctx.refreshThread(threadId);
    ctx.reportConcurrencyRefresh?.(requestId, Boolean(refreshed));
    ctx.setDraft(prompt);
    if (!refreshed) {
      const messageId = `concurrency-refresh-${Date.now()}`;
      ctx.appendUser(threadId, {
        id: messageId, role: "user", content: prompt, requestId, excludeFromHistory: true,
        retryMode, retryMessageId, concurrencyRepeated: repeated,
      });
      ctx.failRequest(messageId, {
        ...failure,
        kind: "concurrency_refresh",
        retryMode, repeated,
      });
      ctx.updateThread(threadId);
      ctx.notice("최신 대화를 불러오지 못했습니다. 연결 상태를 확인한 뒤 다시 열어주세요.");
      ctx.queueScroll?.(messageId);
      ctx.render();
      return true;
    }
    const latestMessages = Array.isArray(refreshed?.messages) ? refreshed.messages : (ctx.getMessages?.() || ctx.state?.messages || []);
    const rawMessages = Array.isArray(refreshed?.raw?.messages) ? refreshed.raw.messages : [];
    const matchesRetryTarget = (message) => [message?.id, message?.messageId, message?.raw?.id, message?.raw?.messageId]
      .some((value) => String(value || "") === String(retryMessageId));
    const retryTargetContent = retryMessageId
      ? String([...latestMessages, ...rawMessages].find(matchesRetryTarget)?.content || "")
      : "";
    const messageId = `concurrency-${Date.now()}`;
    ctx.appendUser(threadId, {
      id: messageId, role: "user", content: prompt, requestId, excludeFromHistory: true,
      retryMode, retryMessageId, retryTargetContent, concurrencyRepeated: repeated,
    });
    ctx.failRequest(messageId, { ...failure, retryMode, repeated });
    ctx.updateThread(threadId);
    ctx.queueScroll?.(messageId);
    ctx.render();
    ctx.focusRestored?.(prompt);
    return true;
  }
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
    const requestId = ctx.shouldSync() && ctx.getBackendThreadId(threadId)
      ? resolveMakeRequestId({ prompt })
      : "";
    const startedAt = Date.now();
    ctx.reportStart?.("submit");
    const signal = ctx.startRequest();
    ctx.setDraft("");
    ctx.appendUser(threadId, { id: userMessageId, role: "user", content: prompt, ...(requestId ? { requestId } : {}) });
    ctx.setThinking(true);
    ctx.updateThread(threadId);
    ctx.render();
    ctx.scrollLatest();
    let result;
    try {
      await ctx.waitForPaint();
      result = await ctx.improve(prompt, { history, threadId, requestId, signal });
    } catch (error) {
      if (ctx.isCurrentRequest && !ctx.isCurrentRequest(signal)) return;
      ctx.setThinking(false);
      ctx.stopInFlight(signal);
      if (String(error?.code || "").toUpperCase() === "REQUEST_ABORTED") {
        ctx.reportCancel?.("submit");
        ctx.failRequest(userMessageId, ctx.classifyError(error));
        ctx.updateThread(threadId);
        ctx.renderCancellation?.();
        return;
      }
      ctx.reportFailure?.(error, requestId, Date.now() - startedAt);
      if (await handleThreadConcurrency(ctx, { error, prompt, requestId, threadId })) return;
      if (isRequestIdReusedError(error)) {
        await ctx.refreshThread(threadId);
        ctx.notice("요청 상태가 변경되어 서버 대화를 새로고침했습니다. 내용을 확인한 뒤 다시 요청해주세요.");
        return;
      }
      const recovered = await ctx.recover({ threadId, prompt, localMessagesSnapshot: [...ctx.state.messages] });
      if (recovered) { ctx.completeRequest(signal); ctx.notice("요청 상태를 서버 대화 기준으로 다시 확인했습니다."); return; }
      ctx.failRequest(userMessageId, ctx.classifyError(error));
      if (!ctx.state.isLoggedIn) ctx.state.guestImproveCount = Math.max(0, ctx.state.guestImproveCount - 1);
      ctx.setBackendFailure();
      ctx.handleError(error, "프롬프트 개선 요청에 실패했습니다.");
      ctx.render();
      ctx.scrollLatest();
      return;
    }
    if (ctx.isCurrentRequest && !ctx.isCurrentRequest(signal)) return;
    ctx.setThinking(false);
    ctx.completeRequest(signal);
    ctx.reportOutcome?.(result, Date.now() - startedAt);
    resetConcurrency(threadId);
    ctx.appendAssistant({ id: assistantMessageId, role: "assistant", mode: result.mode || "improve", content: result.text || "", answer: result.answer || "", improvedPrompt: result.improvedPrompt || "", questions: result.questions || [], changes: result.changes || [], fields: result.fields || [], techniques: result.techniques || [], summary: result.summary || "", sources: result.sources || [], ragStatus: result.ragStatus || "", ragMessage: result.ragMessage || "", sourcePrompt: prompt, requestId: result.requestId || requestId, replayed: result.replayed === true, isUnchanged: Boolean(result.isUnchanged), excludeFromHistory: Boolean(result.excludeFromHistory) });
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
    const existingMessage = ctx.getMessages()[index];
    const requestId = ctx.shouldSync() && ctx.getBackendThreadId(threadId)
      ? resolveMakeRequestId({ previousRequestId: existingMessage?.requestId, previousPrompt: existingMessage?.requestPrompt || existingMessage?.content, prompt: cleanValue })
      : "";
    const history = ctx.buildHistory(ctx.getMessages().slice(0, index));
    const startedAt = Date.now();
    ctx.reportStart?.("edit");
    const signal = ctx.startRequest();
    if (ctx.shouldSync()) {
      if (!ctx.getBackendThreadId(threadId)) { ctx.completeRequest(signal); ctx.notice(ctx.messages.missingThread); return; }
      existingMessage.requestId = requestId;
      existingMessage.requestPrompt = cleanValue;
      ctx.updateThread(threadId);
      ctx.setThinking(true);
      ctx.queueScroll(messageId);
      ctx.render();
      try {
        const result = await ctx.improve(cleanValue, { threadId, messageId, category: "prompt_techniques", requestId, signal });
        if (ctx.isCurrentRequest && !ctx.isCurrentRequest(signal)) return;
        ctx.setThinking(false);
        ctx.reportOutcome?.(result, Date.now() - startedAt);
        resetConcurrency(threadId);
        ctx.clearEditing();
        const refreshed = await ctx.refreshThread(threadId);
        if (!refreshed) ctx.render();
        ctx.notice(ctx.messages.edited);
      } catch (error) {
        if (ctx.isCurrentRequest && !ctx.isCurrentRequest(signal)) return;
        ctx.setThinking(false);
        if (String(error?.code || "").toUpperCase() === "REQUEST_ABORTED") {
          ctx.reportCancel?.("edit");
          ctx.failRequest(messageId, ctx.classifyError(error));
          ctx.setDraft(cleanValue);
          ctx.clearEditing();
          ctx.updateThread(threadId);
          ctx.renderCancellation?.();
          return;
        }
        ctx.reportFailure?.(error, requestId, Date.now() - startedAt);
        if (await handleThreadConcurrency(ctx, { error, prompt: cleanValue, requestId, retryMessageId: messageId, threadId })) {
          ctx.clearEditing();
          return;
        }
        ctx.setBackendFailure();
        if (Number(error?.status || 0) === 404) await ctx.refreshThreads();
        else if (isRequestIdReusedError(error)) {
          await ctx.refreshThread(threadId);
          ctx.notice("요청 상태가 변경되어 서버 대화를 새로고침했습니다. 내용을 확인한 뒤 다시 요청해주세요.");
          return;
        }
        else await ctx.recover({ threadId, prompt: cleanValue, localMessagesSnapshot: [...ctx.getMessages()] }).catch(() => null);
        ctx.handleError(error, ctx.messages.editFailed);
        ctx.render();
      } finally { ctx.stopInFlight(signal); }
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
      result = await ctx.improve(cleanValue, { history, threadId, requestId, signal });
    } catch (error) {
      if (ctx.isCurrentRequest && !ctx.isCurrentRequest(signal)) return;
      ctx.setThinking(false);
      ctx.stopInFlight(signal);
      if (String(error?.code || "").toUpperCase() === "REQUEST_ABORTED") {
        ctx.reportCancel?.("edit");
        ctx.failRequest(messageId, ctx.classifyError(error));
        ctx.clearEditing();
        ctx.updateThread(threadId);
        ctx.renderCancellation?.();
        return;
      }
      ctx.reportFailure?.(error, requestId, Date.now() - startedAt);
      ctx.failRequest(messageId, ctx.classifyError(error));
      ctx.setBackendFailure();
      ctx.handleError(error, ctx.messages.improveFailed);
      ctx.queueScroll(messageId);
      ctx.render();
      return;
    }
    if (ctx.isCurrentRequest && !ctx.isCurrentRequest(signal)) return;
    ctx.setThinking(false);
    ctx.completeRequest(signal);
    ctx.reportOutcome?.(result, Date.now() - startedAt);
    resetConcurrency(threadId);
    ctx.finishEdit({ id: assistantMessageId, role: "assistant", mode: result.mode || "improve", content: result.text || "", answer: result.answer || "", improvedPrompt: result.improvedPrompt || "", questions: result.questions || [], changes: result.changes || [], fields: result.fields || [], techniques: result.techniques || [], summary: result.summary || "", sources: result.sources || [], ragStatus: result.ragStatus || "", ragMessage: result.ragMessage || "", sourcePrompt: cleanValue, requestId: result.requestId || requestId, replayed: result.replayed === true, isUnchanged: Boolean(result.isUnchanged), excludeFromHistory: Boolean(result.excludeFromHistory) });
    ctx.queueScroll(assistantMessageId);
    ctx.updateThread(threadId);
    ctx.applyPendingThread(threadId);
    ctx.syncThread(threadId);
    ctx.notice(ctx.messages.edited);
    ctx.render();
    if (result.mode === "ask") ctx.focusAsk();
  }

export { collectAskAnswerPayload, handleThreadConcurrency, resetConcurrency, submitAskAnswers, submitPrompt, resendEdited };
