import { Settings } from "lucide-react";
import { MODE_META } from "../constants";
import { getRagStatusText } from "../utils/ragStatus";

export function Header({ currentUser, onLogin, onLogout, onToggleRagSettings, ragMode, ragStatus, onToggleRagMode }) {
  const meta = MODE_META[ragMode] || MODE_META.prompt_techniques;
  return (
    <header className="header">
      <div className="brand-mark" aria-label="TTALKAK">
        <span className="brand-dot">T</span>
        <span className="brand-name">TTALKAK</span>
      </div>
      <div className="header-actions">
        <button className={`rag-mode-toggle ${ragMode}`} type="button" onClick={onToggleRagMode} title={`Current: ${meta.label}`}>
          {meta.label === "기법 모드" ? "기법" : "논문"}
        </button>
        <button className="rag-settings-button" type="button" onClick={onToggleRagSettings} title="Backend API settings">
          <Settings size={15} />
          <span>API</span>
        </button>
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
