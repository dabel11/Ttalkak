const test = require("node:test");
const assert = require("node:assert/strict");

test("account withdrawal policy remains explicit and shared across clients", async () => {
  const {
    ACCOUNT_WITHDRAWAL_CONFIRMATION,
    ACCOUNT_WITHDRAWAL_NOTICE,
    ACCOUNT_WITHDRAWAL_POLICY,
  } = await import("../../shared/account-withdrawal-policy.mjs");
  assert.deepEqual(ACCOUNT_WITHDRAWAL_POLICY, {
    userIdReusable: false,
    nicknameReusable: true,
    personalDataDisposition: "anonymize-or-delete",
    discardAccountScope: true,
    retainLocalConversations: true,
    retainLocalSavedItems: true,
  });
  assert.match(ACCOUNT_WITHDRAWAL_NOTICE, /아이디는 재가입에 사용할 수 없습니다/);
  assert.match(ACCOUNT_WITHDRAWAL_NOTICE, /닉네임은 다른 계정에서 다시 사용할 수 있습니다/);
  assert.match(ACCOUNT_WITHDRAWAL_NOTICE, /개인정보는 탈퇴 정책에 따라 익명화 또는 삭제/);
  assert.match(ACCOUNT_WITHDRAWAL_NOTICE, /이 기기에만 저장된 대화와 보관함은 유지/);
  assert.equal(ACCOUNT_WITHDRAWAL_CONFIRMATION, `${ACCOUNT_WITHDRAWAL_NOTICE} 계속할까요?`);
});
