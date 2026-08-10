(function attachAuthView(global) {
  "use strict";
  function createAuthView(ctx) {
    const { state, AuthModalView, escapeAttr, escapeHtml } = ctx;
    const icons = new Proxy({}, { get: (_target, key) => ctx.getIcons()[key] });

    function AuthModal() {
      const isSignup = state.authView === "signup";
      const isFindId = state.authView === "find-id";
      const isFindPassword = state.authView === "find-password";
      const isWithdraw = state.authView === "withdraw";
      const title = isFindId ? "아이디 찾기" : isFindPassword ? "비밀번호 찾기" : isWithdraw ? "회원탈퇴" : isSignup ? "회원가입" : "로그인";
      const authError = escapeHtml(state.authError || "");
      const nicknameChecked = state.authDuplicateChecks.nickname && state.authDuplicateChecks.nickname === String(state.authDraft.nickname || "").trim();
      const userIdChecked = state.authDuplicateChecks.userId && state.authDuplicateChecks.userId === String(state.authDraft.userId || "").trim();

      if (isWithdraw && !state.isLoggedIn) {
        state.authView = "login";
        return AuthModal();
      }

      return AuthModalView(
        { icons, escapeAttr, escapeHtml },
        {
          title,
          authError,
          isSignup,
          isFindId,
          isFindPassword,
          isWithdraw,
          isLoggedIn: state.isLoggedIn,
          hasGoogleCredential: Boolean(window.TTALKAK_GOOGLE_CREDENTIAL),
          nicknameChecked,
          userIdChecked,
          authDraft: state.authDraft,
          authUserIdWarning: state.authUserIdWarning,
        },
      );
    }

    return Object.freeze({ AuthModal });
  }
  const api = Object.freeze({ createAuthView });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  global.TtalkakAuthView = api;
})(typeof window !== "undefined" ? window : globalThis);
