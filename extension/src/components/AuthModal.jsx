import { useState } from "react";
import { Eye, EyeOff, Plus, X } from "lucide-react";
import { PRIVACY_POLICY_URL, TERMS_URL } from "../constants";

const INITIAL_FORM = {
  nickname: "",
  name: "",
  userId: "",
  email: "",
  phone: "",
  birth: "",
  password: "",
  passwordConfirm: "",
  terms: false,
  privacy: false,
};

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isValidPhone(value) {
  return /^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(String(value || "").trim());
}

function isFutureDate(value) {
  if (!value) return false;
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date > today;
}

function getUserIdWarning(value) {
  const userId = String(value || "").trim();
  if (!userId) return "";
  if (userId.length < 4) return "아이디는 4자 이상 입력해주세요.";
  if (!/^[a-zA-Z0-9._-]+$/.test(userId)) return "아이디는 영문, 숫자, '.', '_', '-'만 사용할 수 있습니다.";
  return "";
}

function PasswordInput({ value, onChange, placeholder, autoComplete, required = true }) {
  const [showPassword, setShowPassword] = useState(false);
  return (
    <div className="password-field">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={showPassword ? "text" : "password"}
        autoComplete={autoComplete}
        required={required}
      />
      <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}>
        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

export function AuthModal({
  mode,
  setMode,
  onClose,
  onLogin,
  onSignup,
  onFindId,
  onPasswordReset,
  onWithdraw,
  onCheckDuplicate,
  isLoggedIn,
}) {
  const isSignup = mode === "signup";
  const isFindId = mode === "findId";
  const isFindPassword = mode === "findPassword";
  const isWithdraw = mode === "withdraw";
  const [form, setForm] = useState(INITIAL_FORM);
  const [duplicateChecks, setDuplicateChecks] = useState(/** @type {{ nickname?: string, userId?: string }} */ ({}));
  const [result, setResult] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkingField, setCheckingField] = useState("");

  const title = isSignup ? "회원가입" : isFindId ? "아이디 찾기" : isFindPassword ? "비밀번호 찾기" : isWithdraw ? "회원탈퇴" : "로그인";
  const description = isSignup
    ? "웹사이트와 동일한 계정 정보로 가입합니다."
    : isFindId
      ? "이름과 이메일로 아이디 찾기를 요청합니다. 전화번호는 선택입니다."
      : isFindPassword
        ? "아이디와 이메일로 비밀번호 재설정을 요청합니다."
        : isWithdraw
          ? "탈퇴하면 다시 로그인할 수 없고 사용한 아이디는 재가입에 사용할 수 없습니다. 기존 닉네임은 다른 계정에서 다시 사용할 수 있습니다. 개인정보는 탈퇴 정책에 따라 익명화 또는 삭제되며, 이 기기에만 저장된 대화와 보관함은 유지됩니다."
          : "Spring Boot 계정으로 로그인해 웹과 동일한 회원 정보를 사용합니다.";

  function updateField(field, value) {
    setResult("");
    setForm((state) => ({ ...state, [field]: value }));
    if (field === "nickname" || field === "userId") {
      setDuplicateChecks((state) => {
        const next = { ...state };
        delete next[field];
        return next;
      });
    }
  }

  function moveMode(nextMode) {
    setResult("");
    setMode(nextMode);
  }

  function validateSignup() {
    const requiredFields = [
      ["nickname", "닉네임"],
      ["name", "이름"],
      ["userId", "아이디"],
      ["email", "이메일"],
      ["password", "비밀번호"],
      ["passwordConfirm", "비밀번호 확인"],
    ];
    const missing = requiredFields.filter(([field]) => !String(form[field] || "").trim()).map(([, label]) => label);
    if (missing.length > 0) return `다음 정보를 입력해주세요: ${missing.join(", ")}`;
    const userIdWarning = getUserIdWarning(form.userId);
    if (userIdWarning) return userIdWarning;
    if (!isValidEmail(form.email)) return "이메일 형식을 확인해주세요.";
    if (form.phone && !isValidPhone(form.phone)) return "전화번호 형식을 확인해주세요.";
    if (isFutureDate(form.birth)) return "생년월일은 오늘 이후 날짜로 입력할 수 없습니다.";
    if (form.password.length < 8) return "비밀번호는 8자 이상 입력해주세요.";
    if (form.password !== form.passwordConfirm) return "비밀번호와 비밀번호 확인이 일치하지 않습니다.";
    if (duplicateChecks.nickname !== form.nickname.trim()) return "닉네임 중복 확인을 완료해주세요.";
    if (duplicateChecks.userId !== form.userId.trim()) return "아이디 중복 확인을 완료해주세요.";
    if (!form.terms || !form.privacy) return "서비스 이용 약관과 개인정보 수집 및 이용에 동의해주세요.";
    return "";
  }

  function isDuplicateAvailable(response) {
    const data = response?.data && typeof response.data === "object" ? response.data : response || {};
    if (typeof data.available === "boolean") return data.available;
    if (typeof data.exists === "boolean") return !data.exists;
    if (typeof data.duplicate === "boolean") return !data.duplicate;
    if (typeof data.duplicated === "boolean") return !data.duplicated;
    return true;
  }

  async function checkDuplicate(field) {
    const label = field === "nickname" ? "닉네임" : "아이디";
    const value = String(form[field] || "").trim();
    if (!value) {
      setResult(`${label}을 입력해주세요.`);
      return;
    }
    if (field === "userId") {
      const warning = getUserIdWarning(value);
      if (warning) {
        setResult(warning);
        return;
      }
    }
    setCheckingField(field);
    setResult("");
    try {
      const response = await onCheckDuplicate(field, value);
      if (!isDuplicateAvailable(response)) {
        setResult(`이미 사용 중인 ${label}입니다.`);
        setDuplicateChecks((state) => {
          const next = { ...state };
          delete next[field];
          return next;
        });
        return;
      }
      setDuplicateChecks((state) => ({ ...state, [field]: value }));
      setResult(`사용 가능한 ${label}입니다.`);
    } catch (error) {
      setResult(error?.message || `${label} 중복 확인에 실패했습니다.`);
    } finally {
      setCheckingField("");
    }
  }

  async function submitAuth(e) {
    e.preventDefault();
    setResult("");

    const userId = form.userId.trim();
    const email = form.email.trim();
    const phone = form.phone.trim();
    const userIdWarning = getUserIdWarning(userId);

    if (isFindId) {
      if (!form.name.trim() || !email) {
        setResult("이름과 이메일을 입력해주세요.");
        return;
      }
      if (!isValidEmail(email)) {
        setResult("이메일 형식을 확인해주세요.");
        return;
      }
      if (phone && !isValidPhone(phone)) {
        setResult("전화번호 형식을 확인해주세요.");
        return;
      }
    } else if (isFindPassword) {
      if (!userId || !email) {
        setResult("아이디와 이메일을 입력해주세요.");
        return;
      }
      if (userIdWarning) {
        setResult(userIdWarning);
        return;
      }
      if (!isValidEmail(email)) {
        setResult("이메일 형식을 확인해주세요.");
        return;
      }
      if (phone && !isValidPhone(phone)) {
        setResult("전화번호 형식을 확인해주세요.");
        return;
      }
    } else if (isWithdraw) {
      if (!form.password) {
        setResult("회원탈퇴를 위해 비밀번호를 입력해주세요.");
        return;
      }
    } else if (isSignup) {
      const validationMessage = validateSignup();
      if (validationMessage) {
        setResult(validationMessage);
        return;
      }
    } else if (!userId || !form.password) {
      setResult("아이디와 비밀번호를 모두 입력해주세요.");
      return;
    } else if (userIdWarning) {
      setResult(userIdWarning);
      return;
    }

    setIsSubmitting(true);
    try {
      if (isFindId) {
        const response = await onFindId({ method: "email", name: form.name.trim(), email, phone });
        const maskedUserId = response?.maskedUserId || response?.data?.maskedUserId || "";
        setResult(maskedUserId ? `찾은 아이디: ${maskedUserId}` : "일치하는 아이디가 없습니다.");
        return;
      }
      if (isFindPassword) {
        await onPasswordReset({ userId, email, phone });
        setResult("비밀번호 재설정 요청을 보냈습니다.");
        return;
      }
      if (isWithdraw) {
        await onWithdraw(form.password);
        return;
      }
      if (isSignup) {
        await onSignup({
          nickname: form.nickname.trim(),
          name: form.name.trim(),
          userId,
          email,
          phone,
          birth: form.birth.trim(),
          password: form.password,
          passwordConfirm: form.passwordConfirm,
          agreeTerms: form.terms,
          agreePrivacy: form.privacy,
        });
        return;
      }
      await onLogin({ userId, password: form.password });
    } catch (error) {
      setResult(error?.message || "요청 처리에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="auth-modal" role="dialog" aria-modal="true">
        <button className="close-button" type="button" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        <div className="auth-heading">
          <div className="auth-icon"><Plus size={22} /></div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <form className="auth-form" onSubmit={submitAuth}>
          {isSignup && (
            <label>
              닉네임
              <div className="auth-check-row">
                <input value={form.nickname} onChange={(e) => updateField("nickname", e.target.value)} placeholder="닉네임" required />
                <button type="button" onClick={() => checkDuplicate("nickname")} disabled={checkingField === "nickname" || duplicateChecks.nickname === form.nickname.trim()}>
                  {duplicateChecks.nickname === form.nickname.trim() ? "확인 완료" : checkingField === "nickname" ? "확인 중" : "중복 확인"}
                </button>
              </div>
            </label>
          )}
          {(isSignup || isFindId) && (
            <label>
              이름
              <input value={form.name} onChange={(e) => updateField("name", e.target.value)} placeholder="이름" autoComplete="name" required />
            </label>
          )}
          {(isSignup || isFindPassword || (!isFindId && !isWithdraw)) && (
            <label>
              아이디
              {isSignup ? (
                <div className="auth-check-row">
                  <input value={form.userId} onChange={(e) => updateField("userId", e.target.value)} placeholder="아이디" autoComplete="username" required />
                  <button type="button" onClick={() => checkDuplicate("userId")} disabled={checkingField === "userId" || duplicateChecks.userId === form.userId.trim()}>
                    {duplicateChecks.userId === form.userId.trim() ? "확인 완료" : checkingField === "userId" ? "확인 중" : "중복 확인"}
                  </button>
                </div>
              ) : (
                <input value={form.userId} onChange={(e) => updateField("userId", e.target.value)} placeholder="아이디" autoComplete="username" required />
              )}
            </label>
          )}
          {(isSignup || isFindId || isFindPassword) && (
            <label>
              이메일
              <input value={form.email} onChange={(e) => updateField("email", e.target.value)} placeholder="이메일" type="email" autoComplete="email" required />
            </label>
          )}
          {(isSignup || isFindId || isFindPassword) && (
            <label>
              전화번호 <span className="optional-label">(선택)</span>
              <input value={form.phone} onChange={(e) => updateField("phone", e.target.value)} placeholder="010-0000-0000" autoComplete="tel" />
            </label>
          )}
          {isSignup && (
            <label>
              생년월일 <span className="optional-label">(선택)</span>
              <input value={form.birth} onChange={(e) => updateField("birth", e.target.value)} type="date" />
            </label>
          )}
          {(!isFindId && !isFindPassword) && (
            <label>
              비밀번호
              <PasswordInput
                value={form.password}
                onChange={(value) => updateField("password", value)}
                placeholder={isWithdraw ? "비밀번호 확인" : "비밀번호"}
                autoComplete={isSignup ? "new-password" : "current-password"}
              />
            </label>
          )}
          {isSignup && (
            <label>
              비밀번호 확인
              <PasswordInput
                value={form.passwordConfirm}
                onChange={(value) => updateField("passwordConfirm", value)}
                placeholder="비밀번호 확인"
                autoComplete="new-password"
              />
            </label>
          )}
          {isSignup && (
            <div className="auth-agreements">
              <label>
                <input type="checkbox" checked={form.terms} onChange={(e) => updateField("terms", e.target.checked)} />
                <span>
                  <a href={TERMS_URL} target="_blank" rel="noreferrer">서비스 이용 약관</a>에 동의합니다.
                </span>
              </label>
              <label>
                <input type="checkbox" checked={form.privacy} onChange={(e) => updateField("privacy", e.target.checked)} />
                <span>
                  <a href={PRIVACY_POLICY_URL} target="_blank" rel="noreferrer">개인정보 수집 및 이용</a>에 동의합니다.
                </span>
              </label>
            </div>
          )}
          {result && <p className="auth-result" role="alert">{result}</p>}
          <button className={`auth-submit ${isWithdraw ? "danger" : ""}`} type="submit" disabled={isSubmitting}>
            {isSubmitting ? "처리 중..." : isFindId ? "아이디 찾기" : isFindPassword ? "비밀번호 재설정 요청" : isSignup ? "가입하기" : isWithdraw ? "회원탈퇴" : "로그인"}
          </button>
        </form>
        {isSignup || isFindId || isFindPassword || isWithdraw ? (
          <p className="auth-switch"><button type="button" onClick={() => moveMode("login")}>로그인으로 돌아가기</button></p>
        ) : (
          <div className="auth-link-row" aria-label="계정 도움말">
            <button type="button" onClick={() => moveMode("findId")}>아이디 찾기</button>
            <button type="button" onClick={() => moveMode("findPassword")}>비밀번호 찾기</button>
            <button type="button" onClick={() => moveMode("signup")}>회원가입</button>
            {isLoggedIn && <button type="button" onClick={() => moveMode("withdraw")}>회원탈퇴</button>}
          </div>
        )}
      </section>
    </div>
  );
}
