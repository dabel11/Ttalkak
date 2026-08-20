  "use strict";

  function SidebarView(ctx, data) {
    const { icons, state, escapeAttr, escapeHtml, formatNumber } = ctx;
    const { adminTabs, isAdminAccount } = data;
    const adminIcons = {
      reports: icons.siren,
      prompts: icons.edit,
      tags: icons.hash,
      users: icons.user,
      audit: icons.shield,
    };
    const item = (route, label, icon) => `
      <button class="nav-item ${state.route === route ? "active" : ""}" data-route="${escapeAttr(route)}">
        <span class="nav-icon">${icon}</span>
        <span>${escapeHtml(label)}</span>
      </button>
    `;
    const adminItem = (tab) => `
      <button class="nav-item admin-nav-item ${state.adminTab === tab.id ? "active" : ""}" type="button" data-admin-tab="${escapeAttr(tab.id)}">
        <span class="nav-icon">${adminIcons[tab.id] || icons.shield}</span>
        <span>${escapeHtml(tab.label)}</span>
        ${tab.hideCount ? "" : `<em>${formatNumber(tab.count)}</em>`}
      </button>
    `;

    return `
      <aside class="sidebar" aria-label="주요 메뉴">
        <nav class="nav-list">
          ${
            state.adminMode
              ? adminTabs.map(adminItem).join("")
              : `
                ${item("home", "Home", icons.home)}
                ${!isAdminAccount ? item("make", "Make", icons.make) : ""}
                ${state.isLoggedIn && !isAdminAccount ? item("saved", "My page", icons.user) : ""}
                ${!isAdminAccount ? item("share", "Share", icons.share) : ""}
              `
          }
        </nav>
      </aside>
    `;
  }

  function HeaderView(ctx, data) {
    const { icons, state, escapeHtml, BackendStatusBadge } = ctx;
    const {
      adminAccessButton,
      authButton,
      hasReportedPrompts,
      remaining,
      showPromptTools,
    } = data;
    const resolvedAuthButton = state.isLoggedIn
      ? `<div class="account-actions">${adminAccessButton}<button class="topbar-tool" type="button" data-open-auth="withdraw">회원탈퇴</button><button class="login-button logged-in" type="button" data-logout>${escapeHtml(state.currentUser || "사용자")}님 · 로그아웃</button></div>`
      : authButton;

    return `
      <header class="topbar">
        <button class="brand" data-route="home" aria-label="TTALKAK 홈">
          <span class="brand-mark">T</span>
          <span>TTALKAK</span>
        </button>
        <div class="topbar-auth">
          ${resolvedAuthButton}
          ${BackendStatusBadge()}
          ${
            showPromptTools
              ? `<div class="topbar-tools">
                  <button class="topbar-tool ${state.hideReportedPrompts ? "active" : ""}" type="button" data-toggle-reported title="내가 신고한 게시물만 Home에서 숨깁니다." ${hasReportedPrompts ? "" : "disabled"}>${state.hideReportedPrompts ? "신고 숨김 해제" : "신고 숨김"}</button>
                  <button class="topbar-tool" type="button" data-reset-demo title="브라우저에 저장된 화면 상태만 지우며, 서버 DB 데이터는 삭제하지 않습니다.">데모 초기화</button>
                </div>`
              : ""
          }
          ${state.route === "make" && !state.isLoggedIn ? `<p class="make-auth-hint">비로그인 체험 ${remaining}/${data.freeMakeLimit}회 남음<br />로그인하면 제한 없이 저장하고 이어서 사용할 수 있습니다.</p>` : ""}
        </div>
      </header>
    `;
  }

  const renderers = Object.freeze({
    HeaderView,
    SidebarView,
  });
export { renderers };
