import { useEffect, useRef, useState } from "react";
import { getRagStatusText } from "../utils/ragStatus";

function formatTokens(value) {
  return Number(value || 0).toLocaleString("ko-KR");
}

function getUsageText(usage, usageStatus) {
  if (usageStatus === "loading") return "사용량 확인 중";
  if (usageStatus === "error") return "사용량을 불러오지 못했습니다.";
  if (!usage) return "사용량 확인 전";
  if (usage.usageBlocked) return "사용량 확인 문제로 요청이 잠시 중단됐습니다.";
  if (usage.usageAvailable === false) return "일부 사용량 기록을 확인하고 있습니다.";
  if (usage.limitTokens == null) return `${formatTokens(usage.totalTokens)} 토큰 사용`;
  const base = `${formatTokens(usage.totalTokens)} / ${formatTokens(usage.limitTokens)} 토큰`;
  return usage.limitReached ? `${base} · 한도 도달` : base;
}

export function Header({
  currentUser,
  onLogin,
  onLogout,
  onOpenBilling,
  onRetryUsage,
  onWithdraw,
  ragStatus,
  usage,
  usageStatus,
  inlineImproveEnabled,
  onToggleInlineImprove,
}) {
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const accountMenuTriggerRef = useRef(null);

  useEffect(() => {
    if (!isAccountMenuOpen) return undefined;

    function closeAndReturnFocus() {
      setIsAccountMenuOpen(false);
      requestAnimationFrame(() => accountMenuTriggerRef.current?.focus({ preventScroll: true }));
    }

    function handleOutsidePointerDown(event) {
      if (accountMenuRef.current?.contains(event.target)) return;
      setIsAccountMenuOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeAndReturnFocus();
    }

    document.addEventListener("pointerdown", handleOutsidePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountMenuOpen]);

  function openAccountMenu() {
    setIsAccountMenuOpen(true);
  }

  function toggleAccountMenu() {
    setIsAccountMenuOpen((value) => !value);
  }

  function closeAccountMenu() {
    setIsAccountMenuOpen(false);
  }

  function handleAccountMenuBlur(event) {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    closeAccountMenu();
  }

  function focusMenuItem(position) {
    requestAnimationFrame(() => {
      const items = accountMenuRef.current?.querySelectorAll('[role="menuitem"]');
      if (!items?.length) return;
      items[position < 0 ? items.length - 1 : position]?.focus();
    });
  }

  function handleTriggerKeyDown(event) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    openAccountMenu();
    focusMenuItem(event.key === "ArrowUp" ? -1 : 0);
  }

  function handleMenuKeyDown(event) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const items = [...(accountMenuRef.current?.querySelectorAll('[role="menuitem"]') || [])];
    if (!items.length) return;
    event.preventDefault();
    const currentIndex = items.indexOf(document.activeElement);
    if (event.key === "Home") items[0].focus();
    else if (event.key === "End") items.at(-1).focus();
    else if (event.key === "ArrowDown") items[(currentIndex + 1 + items.length) % items.length].focus();
    else items[(currentIndex - 1 + items.length) % items.length].focus();
  }

  function handleLogout() {
    closeAccountMenu();
    onLogout();
  }

  function handleWithdraw() {
    closeAccountMenu();
    onWithdraw();
  }

  function handleOpenBilling() {
    closeAccountMenu();
    onOpenBilling?.();
  }

  const usageText = getUsageText(usage, usageStatus);
  const usageNeedsAttention = usageStatus === "error" || usage?.limitReached || usage?.usageBlocked || usage?.usageAvailable === false;

  return (
    <header className="header">
      <div className="extension-brand" aria-label="TTALKAK">
        <span className="brand-name">TTALKAK</span>
      </div>
      <div className="header-actions">
        <label style={{display:"inline-flex",alignItems:"center",gap:5,fontSize:12,cursor:"pointer"}}><input type="checkbox" checked={Boolean(inlineImproveEnabled)} onChange={(e)=>onToggleInlineImprove?.(e.target.checked)} /> 인라인 개선</label>
        <span className={`rag-status ${ragStatus}`}>{getRagStatusText(ragStatus)}</span>
        {currentUser ? (
          <div
            ref={accountMenuRef}
            className={`account-menu ${isAccountMenuOpen ? "open" : ""}`}
            aria-label={`${currentUser} 계정 메뉴`}
            onBlur={handleAccountMenuBlur}
          >
            <button
              ref={accountMenuTriggerRef}
              className="login-button account-menu-trigger"
              type="button"
              aria-haspopup="menu"
              aria-expanded={isAccountMenuOpen}
              aria-controls="account-menu-popover"
              title={`${currentUser}님 계정`}
              onClick={toggleAccountMenu}
              onKeyDown={handleTriggerKeyDown}
            >
              계정
            </button>
            <div
              id="account-menu-popover"
              className="account-menu-popover"
              role="menu"
              aria-hidden={!isAccountMenuOpen}
              onKeyDown={handleMenuKeyDown}
            >
              <p>{currentUser}</p>
              <div className={`account-usage ${usageNeedsAttention ? "needs-attention" : ""}`} role="status" aria-live="polite">
                <strong>{usage?.plan || "FREE"}</strong>
                <span>{usageText}</span>
              </div>
              {usageStatus === "error" ? (
                <button type="button" onClick={onRetryUsage} role="menuitem" tabIndex={isAccountMenuOpen ? 0 : -1}>사용량 다시 확인</button>
              ) : null}
              <button type="button" onClick={handleOpenBilling} role="menuitem" tabIndex={isAccountMenuOpen ? 0 : -1}>요금제·사용량</button>
              <button type="button" onClick={handleLogout} role="menuitem" tabIndex={isAccountMenuOpen ? 0 : -1}>로그아웃</button>
              <button className="danger-menu-item" type="button" onClick={handleWithdraw} role="menuitem" tabIndex={isAccountMenuOpen ? 0 : -1}>회원탈퇴</button>
            </div>
          </div>
        ) : (
          <button className="login-button" type="button" onClick={onLogin}>로그인</button>
        )}
      </div>
    </header>
  );
}
