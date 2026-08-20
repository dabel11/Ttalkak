export function getAdminUserActivityPresentation(activity = {}, memberId = "") {
  const isWithdrawn = activity.active === false || /^withdrawn_user_/i.test(String(activity.nickname || ""));
  return Object.freeze({
    canManage: !isWithdrawn && Boolean(String(memberId || "").trim()),
    displayNickname: isWithdrawn ? "탈퇴한 사용자" : String(activity.nickname || "사용자").trim() || "사용자",
    isWithdrawn,
    unavailableMessage: isWithdrawn
      ? "탈퇴한 사용자는 차단 상태를 변경할 수 없습니다."
      : "샘플 작성자는 실제 회원 ID가 없어 차단할 수 없습니다.",
  });
}
