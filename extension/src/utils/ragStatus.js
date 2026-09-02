export function getRagStatusText(status) {
  if (status === "connected") return "연결됨";
  if (status === "checking") return "확인 중";
  if (status === "error") return "연결 오류";
  return "대기 중";
}
