(function attachMakeScrollEvents(global) {
  "use strict";

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

  function scrollToMakeLatestMessage(state, { behavior = "smooth" } = {}) {
    const latestId = [...(state?.messages || [])].reverse().find((message) => message?.id)?.id || "";
    if (!latestId) return;
    const safeId = String(latestId).replace(/"/g, '\\"');
    const target = document.querySelector(`[data-message-id="${safeId}"]`);
    if (!target) return;
    const feed = target.closest(".chat-feed");
    if (feed) {
      const feedRect = feed.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      feed.scrollTo({
        top: feed.scrollTop + targetRect.bottom - feedRect.bottom + 18,
        behavior,
      });
      return;
    }
    target.scrollIntoView({ behavior, block: "end" });
  }

  global.TtalkakMakeScrollEvents = Object.freeze({
    bindMakeFeedScrollEvents,
    scrollToMakeLatestMessage,
  });
})(window);
