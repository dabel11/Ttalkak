import { getRagStatusText } from "../utils/ragStatus";

export function Header({ currentUser, onLogin, onLogout, ragStatus }) {
  return (
    <header className="header">
      <div className="brand-mark" aria-label="TTALKAK">
        <span className="brand-dot">T</span>
        <span className="brand-name">TTALKAK</span>
      </div>
      <div className="header-actions">
        <span className={`rag-status ${ragStatus}`}>{getRagStatusText(ragStatus)}</span>
        {currentUser ? (
          <button className="login-button" type="button" onClick={onLogout}>{currentUser}님</button>
        ) : (
          <button className="login-button" type="button" onClick={onLogin}>로그인</button>
        )}
      </div>
    </header>
  );
}
