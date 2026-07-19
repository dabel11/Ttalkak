(function attachMakePageRenderer(global) {
  "use strict";

  function MakePageView(ctx, data) {
    const { icons, escapeAttr, escapeHtml } = ctx;
    const {
      composerDraft,
      hasMessages,
      messages,
      promptTemplates,
      renderMessageBubble,
      sidePanelHtml,
      templateCollapsed,
    } = data;

    return `
      <section class="make-page" aria-label="프롬프트 첨삭">
        ${sidePanelHtml}
        <div class="chat-feed">
          <div class="make-template-bar ${templateCollapsed ? "collapsed" : ""}" aria-label="분야 선택">
            <button class="template-toggle" type="button" data-toggle-templates aria-label="${templateCollapsed ? "분야 버튼 펼치기" : "분야 버튼 숨기기"}" aria-expanded="${templateCollapsed ? "false" : "true"}">${templateCollapsed ? "&gt;" : "&lt;"}</button>
            ${
              templateCollapsed
                ? ""
                : `<div class="template-list">
                    ${promptTemplates.map((template) => `<button type="button" data-template="${escapeAttr(template.id)}">${escapeHtml(template.label)}</button>`).join("")}
                  </div>`
            }
          </div>
          ${
            hasMessages
              ? messages.map(renderMessageBubble).join("")
              : `<div class="empty-state make-empty">
                  <div class="spark-badge">${icons.make}</div>
                  <h1>프롬프트 첨삭 도우미</h1>
                  <p>AI 도구에서 최적의 결과를 얻기 위한 프롬프트를 작성해보세요.<br />더 명확하고 효과적인 프롬프트로 개선해드립니다.</p>
                </div>`
          }
        </div>
        <form class="composer ${hasMessages ? "has-newchat" : ""}" data-composer>
          <textarea name="prompt" rows="1" data-autosize-textarea placeholder="개선하고 싶은 프롬프트를 입력하세요...">${escapeHtml(composerDraft)}</textarea>
          <button class="send-button" type="submit" aria-label="보내기">${icons.send}</button>
        </form>
      </section>
    `;
  }

  global.TtalkakRenderers = Object.freeze({
    ...(global.TtalkakRenderers || {}),
    MakePageView,
  });
})(window);
