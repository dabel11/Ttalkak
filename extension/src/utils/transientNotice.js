export function showTransientNotice({ setNotice, timerRef, message, host = globalThis, durationMs = 1800 }) {
  setNotice(message);
  if (timerRef.current) host.clearTimeout(timerRef.current);
  timerRef.current = host.setTimeout(() => {
    timerRef.current = null;
    setNotice("");
  }, durationMs);
}
