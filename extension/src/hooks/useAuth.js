import { useEffect, useState } from "react";
import { requestLogin } from "../api/auth";
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

  async function handleLogin(credentials) {
    const session = await requestLogin(ragConfig, credentials);
    setAuthSession(session);
    await saveExtensionStorage(STORAGE.AUTH, session);
    setAuthMode(null);
    showNotice(`${session.displayName}님으로 로그인했습니다.`);
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
    handleLogin,
    handleLogout,
    sessionUuid,
    setAuthMode,
    setSessionUuid,
  };
}
