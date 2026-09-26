import { useRef, useState } from "react";
import { getRagStatusText } from "../utils/ragStatus";
import { formatUsageAccessibilityLabel, formatUsageSummary } from "../policies/usage-entitlement.mjs";

export function Header({ currentUser, onLogin, onLogout, onWithdraw, ragStatus, entitlement, onUpgrade }) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const closeTimerRef = useRef(null);
  const usageSummary = formatUsageSummary(entitlement);
  const usageLabel = formatUsageAccessibilityLabel(entitlement);

  function clearCloseTimer() {
    if (!closeTimerRef.current) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }

  function openAccountMenu() {
    clearCloseTimer();
    setIsAccountMenuOpen(true);
  }

  function scheduleAccountMenuClose() {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setIsAccountMenuOpen(false);
      closeTimerRef.current = null;
    }, 180);
  }

  function toggleAccountMenu() {
    clearCloseTimer();
    setIsAccountMenuOpen((value) => !value);
  }

  function closeAccountMenu() {
    clearCloseTimer();
    setIsAccountMenuOpen(false);
  }

  function handleLogout() {
    closeAccountMenu();
    onLogout();
  }

  function handleWithdraw() {
    closeAccountMenu();
    onWithdraw();
  }

  return (
    <header className="header">
      <div className="extension-brand" aria-label="TTALKAK">
        <span className="brand-name">TTALKAK</span>
      </div>
      <div className="header-actions">
        <span className={`rag-status ${ragStatus}`}>{getRagStatusText(ragStatus)}</span>
        <button className="usage-button" type="button" onClick={onUpgrade} title={`${usageLabel} · 웹에서 요금제와 사용량 보기`} aria-label={`${usageLabel}. 웹에서 요금제와 사용량 보기`}>
          {usageSummary}
        </button>
        {currentUser ? (
          <div
            className={`account-menu ${isAccountMenuOpen ? "open" : ""}`}
            aria-label={`${currentUser} 계정 메뉴`}
            onMouseEnter={openAccountMenu}
            onMouseLeave={scheduleAccountMenuClose}
          >
            <button
              className="login-button account-menu-trigger"
              type="button"
              aria-haspopup="menu"
              aria-expanded={isAccountMenuOpen}
              title={`${currentUser}님 계정`}
              onClick={toggleAccountMenu}
              onFocus={openAccountMenu}
            >
              계정
            </button>
            <div className="account-menu-popover" role="menu" onMouseEnter={openAccountMenu}>
              <p>{currentUser}</p>
              <button type="button" onClick={onUpgrade} role="menuitem">요금제 및 사용량</button>
              <button type="button" onClick={handleLogout} role="menuitem">로그아웃</button>
              <button className="danger-menu-item" type="button" onClick={handleWithdraw} role="menuitem">회원탈퇴</button>
            </div>
          </div>
        ) : (
          <button className="login-button" type="button" onClick={onLogin}>로그인</button>
        )}
      </div>
    </header>
  );
}
