import { getRagStatusText } from "../utils/ragStatus";

export function Header({ currentUser, onLogin, onLogout, onWithdraw, ragStatus }) {
  return (
    <header className="header">
      <div className="brand-mark" aria-label="TTALKAK">
        <span className="brand-dot">T</span>
        <span className="brand-name">TTALKAK</span>
      </div>
      <div className="header-actions">
        <span className={`rag-status ${ragStatus}`}>{getRagStatusText(ragStatus)}</span>
        {currentUser ? (
          <div className="account-menu" aria-label={`${currentUser} 계정 메뉴`}>
            <button className="login-button account-menu-trigger" type="button" aria-haspopup="menu" aria-expanded="false" title={`${currentUser}님 계정`}>
              계정
            </button>
            <div className="account-menu-popover" role="menu">
              <p>{currentUser}</p>
              <button type="button" onClick={onLogout} role="menuitem">로그아웃</button>
              <button className="danger-menu-item" type="button" onClick={onWithdraw} role="menuitem">회원탈퇴</button>
            </div>
          </div>
        ) : (
          <button className="login-button" type="button" onClick={onLogin}>로그인</button>
        )}
      </div>
    </header>
  );
}
