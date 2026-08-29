// GENERATED FILE. Edit shared/account-withdrawal-policy.mjs and run node scripts/build-account-withdrawal-policy.cjs.
export const ACCOUNT_WITHDRAWAL_POLICY = /* @__PURE__ */ Object.freeze({
  userIdReusable: false,
  nicknameReusable: true,
  personalDataDisposition: "anonymize-or-delete",
  discardAccountScope: true,
  retainLocalConversations: true,
  retainLocalSavedItems: true,
});

export const ACCOUNT_WITHDRAWAL_NOTICE = "탈퇴하면 다시 로그인할 수 없고 사용한 아이디는 재가입에 사용할 수 없습니다. 기존 닉네임은 다른 계정에서 다시 사용할 수 있습니다. 이름·이메일·전화번호 등 개인정보는 탈퇴 정책에 따라 익명화 또는 삭제됩니다. 이 기기에만 저장된 대화와 보관함은 유지됩니다.";

export const ACCOUNT_WITHDRAWAL_CONFIRMATION = `${ACCOUNT_WITHDRAWAL_NOTICE} 계속할까요?`;
