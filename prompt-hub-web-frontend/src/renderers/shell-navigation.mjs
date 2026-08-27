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
    const settingsMenu = state.isLoggedIn || showPromptTools
      ? `<details class="topbar-settings">
          <summary aria-label="계정 및 화면 설정">설정</summary>
          <div class="topbar-settings-menu">
            ${showPromptTools ? `<span class="topbar-settings-label">화면 도구</span><button class="topbar-menu-action ${state.hideReportedPrompts ? "active" : ""}" type="button" data-toggle-reported ${hasReportedPrompts ? "" : "disabled"}>${state.hideReportedPrompts ? "신고한 게시물 표시" : "신고한 게시물 숨기기"}</button><button class="topbar-menu-action" type="button" data-reset-demo>로컬 데모 데이터 초기화</button>` : ""}
            ${state.isLoggedIn ? `<span class="topbar-settings-label">계정</span><button class="topbar-menu-action danger" type="button" data-open-auth="withdraw">회원탈퇴</button>` : ""}
          </div>
        </details>`
      : "";
    const resolvedAuthButton = state.isLoggedIn
      ? `<div class="account-actions">${adminAccessButton}<button class="login-button logged-in" type="button" data-logout>${escapeHtml(state.currentUser || "사용자")}님 · 로그아웃</button>${settingsMenu}</div>`
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
          ${!state.isLoggedIn ? settingsMenu : ""}
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
