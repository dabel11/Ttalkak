  "use strict";

  let pendingLatestMessageScrollId = "";
  let pendingLatestMakeScrollMode = "";

  function bindMakeFeedScrollEvents({ state }) {
    const feed = document.querySelector(".chat-feed");
    if (!feed) return;
    const scrollButton = feed.querySelector("[data-scroll-latest-message]");
    if (!scrollButton) return;

    const updateScrollButton = () => {
      positionMakeLatestButton(scrollButton);
      scrollButton.classList.toggle("visible", isMakeFeedAwayFromLatest(feed));
    };

    scrollButton.addEventListener("click", () => {
      scrollToMakeLatestMessage(state, { behavior: "smooth" });
      window.setTimeout(updateScrollButton, 280);
    });
    feed.addEventListener("scroll", updateScrollButton, { passive: true });
    requestAnimationFrame(updateScrollButton);
  }

  function positionMakeLatestButton(button) {
    const textarea = document.querySelector(".composer textarea");
    const rect = textarea?.getBoundingClientRect();
    if (!rect) return;
    button.style.left = `${rect.left + rect.width / 2}px`;
  }

  function isMakeFeedAwayFromLatest(feed) {
    return feed.scrollHeight - feed.scrollTop - feed.clientHeight > 220;
  }

  /** @param {{ messages?: Array<{ id?: unknown }> }} state @param {{ behavior?: ScrollBehavior }} [options] */
  function scrollToMakeLatestMessage(state, { behavior = "smooth" } = {}) {
    const latestId = [...(state?.messages || [])].reverse().find((message) => message?.id)?.id || "";
    if (!latestId) return false;
    const safeId = String(latestId).replace(/"/g, '\\"');
    const target = document.querySelector("[data-make-thinking-indicator]") || document.querySelector(`[data-message-id="${safeId}"]`);
    if (!target) return false;
    const feed = target.closest(".chat-feed");
    if (feed) {
      feed.scrollTo({
        top: feed.scrollHeight - feed.clientHeight,
        behavior,
      });
      return true;
    }
    target.scrollIntoView({ behavior, block: "end" });
    return true;
  }

  function captureMakeScrollSnapshot() {
    const root = document.scrollingElement || document.documentElement;
    return {
      rootLeft: root?.scrollLeft || 0,
      rootTop: root?.scrollTop || 0,
      panels: [".chat-feed", ".make-side-panel"].map((selector) => {
        const element = document.querySelector(selector);
        return {
          left: element?.scrollLeft || 0,
          selector,
          top: element?.scrollTop || 0,
        };
      }),
    };
  }

  function restoreMakeScrollSnapshot(snapshot) {
    if (!snapshot) return;
    requestAnimationFrame(() => {
      const root = document.scrollingElement || document.documentElement;
      root?.scrollTo({ left: snapshot.rootLeft, top: snapshot.rootTop, behavior: "auto" });
      snapshot.panels.forEach(({ selector, left, top }) => {
        document.querySelector(selector)?.scrollTo({ left, top, behavior: "auto" });
      });
    });
  }

  function renderWithPreservedMakeScroll(render) {
    if (typeof render !== "function") return;
    const snapshot = captureMakeScrollSnapshot();
    render();
    restoreMakeScrollSnapshot(snapshot);
  }

  /** @param {unknown} state @param {{ behavior?: ScrollBehavior, hasPendingMessageScroll?: () => boolean }} [options] */
  function scrollToPendingLatestMakeMessage(state, { behavior = "smooth", hasPendingMessageScroll } = {}) {
    if (typeof hasPendingMessageScroll === "function" && hasPendingMessageScroll()) return;
    if (!pendingLatestMessageScrollId) return;
    const shouldClearFinalMode = pendingLatestMakeScrollMode === "final";
    const didScroll = scrollToMakeLatestMessage(state, { behavior });
    if (!didScroll) return;
    pendingLatestMessageScrollId = "";
    if (shouldClearFinalMode) pendingLatestMakeScrollMode = "";
  }

  function queueLatestMakeScroll(messageId = "", { mode = "immediate" } = {}) {
    if (messageId) pendingLatestMessageScrollId = String(messageId);
    pendingLatestMakeScrollMode = mode;
  }

  /** @param {{ messages?: Array<{ id?: unknown }> }} state @param {{ behavior?: ScrollBehavior }} [options] */
  function scheduleMakeLatestScroll(state, { behavior = "smooth" } = {}) {
    requestAnimationFrame(() => {
      scrollToMakeLatestMessage(state, { behavior });
    });
  }

  const makeScrollEvents = Object.freeze({
    bindMakeFeedScrollEvents,
    queueLatestMakeScroll,
    renderWithPreservedMakeScroll,
    scheduleMakeLatestScroll,
    scrollToMakeLatestMessage,
    scrollToPendingLatestMakeMessage,
  });
export { makeScrollEvents };
