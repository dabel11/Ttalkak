  "use strict";

  function AuthModalView(ctx, data) {
    const { icons, escapeAttr, escapeHtml } = ctx;
    const {
      title,
      authError,
      isSignup,
      isFindId,
      isFindPassword,
      isWithdraw,
      isLoggedIn,
      hasGoogleCredential,
      nicknameChecked,
      userIdChecked,
      authDraft,
      authUserIdWarning,
    } = data;

    if (isWithdraw) {
      return `
        <div class="modal-backdrop visible auth-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <form class="modal auth-modal" data-auth-form>
            <div class="modal-head">
              <h2 id="auth-title">${title}</h2>
              <button class="ghost-icon" type="button" data-close-auth aria-label="닫기">${icons.close}</button>
            </div>
            <p class="auth-helper">탈퇴하면 계정이 비활성화되고 다시 로그인할 수 없습니다. 사용한 아이디는 재가입에 사용할 수 없으며, 기존 닉네임은 다른 계정에서 다시 사용할 수 있습니다. 이름·이메일·전화번호 등 개인정보는 탈퇴 정책에 따라 익명화 또는 삭제됩니다. 이 기기에만 저장된 대화와 보관함은 유지됩니다.</p>
            ${authError ? `<p class="auth-form-error" role="alert" data-auth-error>${authError}</p>` : ""}
            <label class="password-field">
              <input name="password" type="password" placeholder="비밀번호 확인" autocomplete="current-password" />
              <button class="password-toggle" type="button" data-toggle-password aria-label="비밀번호 보기">${icons.eye}</button>
            </label>
            <p class="auth-field-warning caps-warning" data-caps-warning hidden>Caps Lock이 켜져 있습니다.</p>
            <button class="primary-button danger-primary full" type="submit">회원탈퇴</button>
            <button class="text-button" type="button" data-close-auth>취소</button>
          </form>
        </div>
      `;
    }

    if (isFindId || isFindPassword) {
      return `
        <div class="modal-backdrop visible auth-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-title">
          <form class="modal auth-modal" data-auth-form>
            <div class="modal-head">
              <h2 id="auth-title">${title}</h2>
              <button class="ghost-icon" type="button" data-close-auth aria-label="닫기">${icons.close}</button>
            </div>
            <p class="auth-helper">${isFindId ? "이름과 이메일로 아이디 찾기 데모를 진행합니다. 전화번호는 선택 보조 정보입니다." : "아이디와 이메일로 비밀번호 재설정 데모를 진행합니다. 전화번호는 선택 보조 정보입니다."}</p>
            ${authError ? `<p class="auth-form-error" role="alert" data-auth-error>${authError}</p>` : ""}
            ${
              isFindId
                ? `<input name="name" placeholder="이름" autocomplete="name" />`
                : `<input name="userId" placeholder="아이디" autocomplete="username" />
                   <p class="auth-field-warning" data-user-id-warning>${escapeHtml(authUserIdWarning || "")}</p>`
            }
            <input name="email" type="email" placeholder="이메일" autocomplete="email" />
            <input name="phone" placeholder="전화번호 (선택)" autocomplete="tel" />
            <button class="primary-button full" type="submit">${isFindId ? "아이디 찾기" : "비밀번호 재설정 요청"}</button>
            <div class="auth-link-row">
              <button class="text-button inline" type="button" data-open-auth="login">로그인으로 돌아가기</button>
              <button class="text-button inline" type="button" data-open-auth="${isFindId ? "find-password" : "find-id"}">${isFindId ? "비밀번호 찾기" : "아이디 찾기"}</button>
            </div>
          </form>
        </div>
      `;
    }

    return `
      <div class="modal-backdrop visible auth-backdrop" role="dialog" aria-modal="true" aria-labelledby="auth-title">
        <form class="modal auth-modal" data-auth-form>
          <div class="modal-head">
            <h2 id="auth-title">${title}</h2>
            <button class="ghost-icon" type="button" data-close-auth aria-label="닫기">${icons.close}</button>
          </div>
          <button class="google-auth-button" type="button" data-google-auth><span>G</span>${hasGoogleCredential ? (isSignup ? "Google로 회원가입" : "Google로 로그인") : (isSignup ? "Google 회원가입 데모" : "Google 로그인 데모")}</button>
          ${!hasGoogleCredential ? `<p class="auth-helper compact">실제 Google OAuth는 Google Client ID와 credential 설정 후 연결됩니다.</p>` : ""}
          <div class="auth-divider"><span>또는</span></div>
          ${authError ? `<p class="auth-form-error" role="alert" data-auth-error>${authError}</p>` : ""}
          ${
            isSignup
              ? `<div class="auth-check-row">
                  <input name="nickname" placeholder="닉네임" value="${escapeAttr(authDraft.nickname || "")}" />
                  <button type="button" data-check-duplicate="nickname" ${nicknameChecked ? "disabled" : ""}>${nicknameChecked ? "확인 완료" : "중복 확인"}</button>
                </div>
                <input name="name" placeholder="이름" value="${escapeAttr(authDraft.name || "")}" />
                <div class="auth-check-row">
                  <input name="userId" placeholder="아이디" autocomplete="username" value="${escapeAttr(authDraft.userId || "")}" />
                  <button type="button" data-check-duplicate="userId" ${userIdChecked ? "disabled" : ""}>${userIdChecked ? "확인 완료" : "중복 확인"}</button>
                </div>
                <p class="auth-field-warning" data-user-id-warning>${escapeHtml(authUserIdWarning || "")}</p>
                <input name="email" type="email" placeholder="이메일" autocomplete="email" value="${escapeAttr(authDraft.email || "")}" />
                <input name="phone" placeholder="전화번호 (선택)" autocomplete="tel" value="${escapeAttr(authDraft.phone || "")}" />
                <label class="date-field ${authDraft.birth ? "has-value" : ""}">
                  <input name="birth" type="date" aria-label="생년월일 선택" value="${escapeAttr(authDraft.birth || "")}" />
                  <span>생년월일</span>
                </label>`
              : `<input name="userId" placeholder="아이디" autocomplete="username" />
                 <p class="auth-field-warning" data-user-id-warning>${escapeHtml(authUserIdWarning || "")}</p>`
          }
          <label class="password-field">
            <input name="password" type="password" placeholder="비밀번호" autocomplete="${isSignup ? "new-password" : "current-password"}" value="${isSignup ? escapeAttr(authDraft.password || "") : ""}" />
            <button class="password-toggle" type="button" data-toggle-password aria-label="비밀번호 보기">${icons.eye}</button>
          </label>
          <p class="auth-field-warning caps-warning" data-caps-warning hidden>Caps Lock이 켜져 있습니다.</p>
          ${
            isSignup
              ? `<label class="password-field">
                  <input name="passwordConfirm" type="password" placeholder="비밀번호 확인" autocomplete="new-password" value="${escapeAttr(authDraft.passwordConfirm || "")}" />
                  <button class="password-toggle" type="button" data-toggle-password aria-label="비밀번호 보기">${icons.eye}</button>
                </label>
                <p class="auth-field-warning caps-warning" data-caps-warning hidden>Caps Lock이 켜져 있습니다.</p>
                <label class="agreement-row"><input type="checkbox" name="terms" ${authDraft.terms ? "checked" : ""} /> 사이트 이용 약관에 동의합니다</label>
                <label class="agreement-row"><input type="checkbox" name="privacy" ${authDraft.privacy ? "checked" : ""} /> 개인정보 수집 및 이용에 동의합니다</label>`
              : ""
          }
          <button class="primary-button full" type="submit">${isSignup ? "가입하기" : "로그인"}</button>
          ${
            isSignup
              ? ""
              : `<div class="auth-link-row">
                  <button class="text-button inline" type="button" data-open-auth="find-id">아이디 찾기</button>
                  <button class="text-button inline" type="button" data-open-auth="find-password">비밀번호 찾기</button>
                  <button class="text-button inline" type="button" data-open-auth="signup">회원가입</button>
                </div>`
          }
          ${isSignup ? `<button class="text-button" type="button" data-open-auth="login">이미 계정이 있어요</button>` : isLoggedIn ? `<button class="text-button" type="button" data-open-auth="withdraw">회원탈퇴</button>` : ""}
        </form>
      </div>
    `;
  }

  const renderers = Object.freeze({
    AuthModalView,
  });
export { renderers };
