import { useRef, useState } from "react";
import { getRagStatusText } from "../utils/ragStatus";

export function Header({ currentUser, onLogin, onLogout, onWithdraw, ragStatus }) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const closeTimerRef = useRef(null);

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
