export function getRagStatusText(status) {
  if (status === "connected") return "Backend connected";
  if (status === "checking") return "Checking backend";
  if (status === "error") return "Backend error";
  return "Backend idle";
}
