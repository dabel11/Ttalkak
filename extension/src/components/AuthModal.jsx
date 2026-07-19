import { useState } from "react";
import { Eye, EyeOff, Plus, X } from "lucide-react";

export function AuthModal({ mode, setMode, onClose, onLogin, backendApiUrl }) {
  const isSignup = mode === "signup";
  const isFindId = mode === "findId";
  const isFindPassword = mode === "findPassword";
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ userId: "", password: "", name: "", phone: "" });
  const [result, setResult] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const title = isSignup ? "Sign up" : isFindId ? "Find ID" : isFindPassword ? "Find password" : "Login";
  const description = isSignup
    ? "회원가입은 웹사이트에서 진행해주세요."
    : isFindId
      ? "Enter your name and phone number to find your ID."
      : isFindPassword
        ? "Enter your ID and phone number to request a password reset."
        : "Spring Boot 계정으로 로그인해 웹과 동일한 회원 정보를 사용합니다.";

  function updateField(field, value) {
    setResult("");
    setForm((state) => ({ ...state, [field]: value }));
  }

  function moveMode(nextMode) {
    setResult("");
    setMode(nextMode);
  }

  async function submitAuth(e) {
    e.preventDefault();
    if (isFindId) {
      setResult("After backend account API integration, the matching ID will be shown here.");
      return;
    }
    if (isFindPassword) {
      setResult("After backend account API integration, this will start the password reset flow.");
      return;
    }
    if (isSignup) {
      setResult("Extension 회원가입은 아직 지원하지 않습니다. 웹사이트에서 가입한 뒤 로그인해주세요.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onLogin({ userId: form.userId.trim(), password: form.password });
    } catch (error) {
      setResult(error?.message || "로그인에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true">
        <button className="close-button" type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        <div className="auth-heading">
          <div className="auth-icon"><Plus size={22} /></div>
          <h2>{title}</h2>
          <p>{description}</p>
          {!isSignup && !isFindId && !isFindPassword && backendApiUrl && <p className="auth-result">API: {backendApiUrl}</p>}
        </div>
        <form className="auth-form" onSubmit={submitAuth}>
          {(isSignup || isFindId) && (
            <label>
              Name
              <input value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="Name" required />
            </label>
          )}
          {(isSignup || isFindId || isFindPassword) && (
            <label>
              Phone
              <input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="010-0000-0000" required />
            </label>
          )}
          {(!isFindId || isFindPassword) && (
            <label>
              ID
              <input value={form.userId} onChange={(e) => updateField("userId", e.target.value)} placeholder="Enter your ID" required />
            </label>
          )}
          {!isFindId && !isFindPassword && (
            <label>
              Password
              <div className="password-field">
                <input value={form.password} onChange={(e) => updateField("password", e.target.value)} placeholder="Enter your password" type={showPassword ? "text" : "password"} required />
                <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label="Toggle password visibility">
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </label>
          )}
          {result && <p className="auth-result">{result}</p>}
          <button className="auth-submit" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Signing in..." : isFindId ? "Find ID" : isFindPassword ? "Find password" : isSignup ? "Sign up" : "Login"}
          </button>
        </form>
        {isSignup || isFindId || isFindPassword ? (
          <p className="auth-switch"><button type="button" onClick={() => moveMode("login")}>Back to login</button></p>
        ) : (
          <div className="auth-link-row" aria-label="Account help">
            <button type="button" onClick={() => moveMode("findId")}>Find ID</button>
            <button type="button" onClick={() => moveMode("findPassword")}>Find password</button>
            <button type="button" onClick={() => moveMode("signup")}>Sign up</button>
          </div>
        )}
      </section>
    </div>
  );
}
