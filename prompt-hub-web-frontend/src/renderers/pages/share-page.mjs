  "use strict";

  function SharePageView(ctx, data) {
    const { icons, escapeAttr, escapeHtml } = ctx;
    const { isLoggedIn, draft, draftTags, selectedTags, suggestedTags, shareTagQuery, shareError } = data;

    if (!isLoggedIn) {
      return `
        <section class="share-page login-required" aria-labelledby="share-required-title">
          <div class="empty-state share-required-card">
            <span>${icons.share}</span>
            <h1 id="share-required-title">로그인이 필요합니다</h1>
            <p>프롬프트를 공유하려면 먼저 로그인해주세요.</p>
            <button class="primary-button" type="button" data-open-auth="login">로그인</button>
          </div>
        </section>
      `;
    }

    const trimmedTagQuery = String(shareTagQuery || "").trim();

    return `
      <section class="share-page" aria-labelledby="share-title">
        <div class="share-shell">
          <div class="page-title share-title">
            <span>${icons.share}</span>
            <h1 id="share-title">프롬프트 공유하기</h1>
          </div>
          <form class="share-form">
            <label>
              <span>제목</span>
              <input name="title" type="text" value="${escapeAttr(draft.title || "")}" placeholder="예: SEO 블로그 포스팅 프롬프트" />
            </label>
            <label>
              <span>프롬프트</span>
              <textarea name="prompt" rows="8" placeholder="다른 사용자들과 공유하고 싶은 프롬프트를 입력하세요...">${escapeHtml(draft.text || "")}</textarea>
            </label>
            <div class="share-field-block">
              <div class="share-label-with-help">
                <label for="share-tag-search">해시태그</label>
                <span class="share-field-help-wrap">
                  <button class="search-help share-help share-field-help" type="button" aria-label="해시태그 도움말">
                    <span>${icons.bulb}</span>
                    <span class="help-text">태그를 추가하면 검색에 더 잘 노출됩니다.</span>
                  </button>
                </span>
              </div>
              <input id="share-tag-search" name="tagSearch" type="text" value="${escapeAttr(shareTagQuery)}" placeholder="선택 사항: 기존 태그를 검색하거나 새 태그를 입력하세요" autocomplete="off" />
              <input name="tags" type="hidden" value="${escapeAttr(draftTags)}" />
              <div class="share-tag-suggestions" aria-label="해시태그 검색 결과">
                ${
                  suggestedTags.length
                    ? suggestedTags.map((tag) => `<button type="button" data-add-share-tag="${escapeAttr(tag)}">#${escapeHtml(tag)}</button>`).join("")
                    : trimmedTagQuery
                      ? `<button type="button" data-add-share-tag="${escapeAttr(trimmedTagQuery)}">새 태그로 추가: #${escapeHtml(trimmedTagQuery)}</button>`
                      : `<span>해시태그 없이도 공유할 수 있습니다.</span>`
                }
              </div>
              <div class="tag-chip-list" data-share-tag-chips>
                ${
                  selectedTags.length
                    ? selectedTags
                        .map((tag) => `<button class="tag-chip" type="button" data-remove-share-tag="${escapeAttr(tag)}">#${escapeHtml(tag)} <span aria-hidden="true">×</span></button>`)
                        .join("")
                    : `<span class="tag-chip-empty">태그 없이 공유됩니다.</span>`
                }
              </div>
            </div>
            <div class="share-helper">
              <span>${escapeHtml(shareError || "공유 후 Home으로 이동하며, 최신 정렬에서 방금 공유한 프롬프트를 확인할 수 있습니다.")}</span>
            </div>
            <div class="form-actions">
              <button class="primary-button" type="submit">공유하기</button>
            </div>
          </form>
          ${SharePreviewView({ escapeHtml }, { draft, draftTags, tags: selectedTags.slice(0, 4) })}
        </div>
      </section>
    `;
  }

  function SharePreviewView(ctx, data) {
    const { escapeHtml } = ctx;
    const { draft, draftTags } = data;
    const tags = Array.isArray(data.tags) ? data.tags : String(draftTags || "").split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 4);

    return `
      <aside class="share-preview" aria-label="공유 미리보기">
        <div class="share-preview-head">
          <strong>Home 카드 미리보기</strong>
          <span>공유 후 노출되는 모습</span>
        </div>
        <article class="prompt-card share-preview-card">
          <div class="card-head">
            <h2 data-share-preview-title>${escapeHtml(draft.title || "프롬프트 제목 미리보기")}</h2>
          </div>
          <p data-share-preview-text>${escapeHtml(draft.text || "공유할 프롬프트 내용을 입력하면 이곳에서 Home 카드 형태로 미리 확인할 수 있습니다.")}</p>
          <div class="tag-row" data-share-preview-tags>
            ${tags.length ? tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("") : `<span class="tag-chip-empty">태그 없음</span>`}
          </div>
        </article>
      </aside>
    `;
  }

  const renderers = Object.freeze({
    SharePageView,
    SharePreviewView,
  });
  if (typeof document !== "undefined") document.dispatchEvent(new CustomEvent("ttalkak:route-renderers-registered", { detail: { renderers: { SharePageView, SharePreviewView } } }));
export { renderers };
