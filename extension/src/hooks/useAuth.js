import { useEffect, useState } from "react";
import { requestCheckNickname, requestCheckUserId, requestFindId, requestLogin, requestPasswordReset, requestSignup, requestWithdrawAccount } from "../api/auth";
import { STORAGE } from "../constants";
import { getOrCreateSessionUuid, loadExtensionStorage, removeExtensionStorage, saveExtensionStorage } from "../storage/extensionStorage";

export function useAuth({ ragConfig, showNotice }) {
  const [authMode, setAuthMode] = useState(null);
  const [authSession, setAuthSession] = useState(null);
  const [sessionUuid, setSessionUuid] = useState("");
  const currentUser = authSession?.displayName || authSession?.user?.nickname || authSession?.user?.userId || "";

  useEffect(() => {
    let mounted = true;
    loadExtensionStorage(STORAGE.AUTH, null).then((session) => {
      if (!mounted || !session?.accessToken) return;
      setAuthSession(session);
    });
    getOrCreateSessionUuid().then((uuid) => {
      if (mounted) setSessionUuid(uuid);
    });
    return () => {
      mounted = false;
    };
  }, []);

  async function saveSession(session) {
    setAuthSession(session);
    await saveExtensionStorage(STORAGE.AUTH, session);
    setAuthMode(null);
  }

  async function handleLogin(credentials) {
    const session = await requestLogin(ragConfig, credentials);
    await saveSession(session);
    showNotice(`${session.displayName}님으로 로그인했습니다.`);
  }

  async function handleSignup(payload) {
    const session = await requestSignup(ragConfig, payload);
    await saveSession(session);
    showNotice("회원가입이 완료되었습니다.");
  }

  async function handleFindId(payload) {
    return requestFindId(ragConfig, payload);
  }

  async function handlePasswordReset(payload) {
    return requestPasswordReset(ragConfig, payload);
  }

  async function handleCheckDuplicate(field, value) {
    if (field === "nickname") return requestCheckNickname(ragConfig, value);
    if (field === "userId") return requestCheckUserId(ragConfig, value);
    throw new Error("지원하지 않는 중복 확인 항목입니다.");
  }

  async function handleWithdraw(password) {
    if (!authSession?.accessToken) {
      setAuthMode("login");
      throw new Error("회원탈퇴를 진행하려면 먼저 로그인해주세요.");
    }
    await requestWithdrawAccount(ragConfig, { password }, authSession.accessToken);
    setAuthSession(null);
    await removeExtensionStorage(STORAGE.AUTH);
    setAuthMode(null);
    showNotice("회원탈퇴가 완료되었습니다.");
  }

  async function handleLogout(message = "로그아웃했습니다.") {
    setAuthSession(null);
    await removeExtensionStorage(STORAGE.AUTH);
    showNotice(message);
  }

  async function handleAuthExpired() {
    await handleLogout("로그인이 만료되었습니다. 다시 로그인해주세요.");
    setAuthMode("login");
  }

  return {
    authMode,
    authSession,
    currentUser,
    handleAuthExpired,
    handleCheckDuplicate,
    handleFindId,
    handleLogin,
    handleLogout,
    handlePasswordReset,
    handleSignup,
    handleWithdraw,
    sessionUuid,
    setAuthMode,
    setSessionUuid,
  };
}
