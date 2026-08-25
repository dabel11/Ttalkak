/**
 * @param {(state: {messageId: string, action: string}) => void} onChange
 */
export function createRecoveryActionCoordinator(onChange = () => {}) {
  let current = null;
  let disposed = false;

  function start(messageId, action) {
    if (disposed || current) return null;
    const token = Object.freeze({ messageId: String(messageId || ""), action: String(action || "") });
    if (!token.messageId || !token.action) return null;
    current = token;
    onChange(token);
    return token;
  }

  function finish(token) {
    if (disposed || current !== token) return false;
    current = null;
    onChange({ messageId: "", action: "" });
    return true;
  }

  function dispose() {
    disposed = true;
    current = null;
  }

  function activate() {
    disposed = false;
  }

  return Object.freeze({ activate, dispose, finish, isActive: () => Boolean(current), start });
}
