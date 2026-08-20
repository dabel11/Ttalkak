// @ts-check
import { useEffect, useState } from "react";
import { requestMakeThreads } from "../api/make";
import { STORAGE } from "../constants";
import { loadStorage, saveStorage } from "../storage/extensionStorage";
import { isAuthExpiredError } from "../utils/apiErrors";

export function useConversationHistory({ authSession, ragConfig, showNotice, onAuthExpired }) {
  const [localRecentThreads, setLocalRecentThreads] = useState(() => loadStorage(STORAGE.RECENTS, []));
  const [serverRecentThreads, setServerRecentThreads] = useState([]);
  const isLoggedIn = Boolean(authSession?.accessToken);

  useEffect(() => {
    if (!isLoggedIn) saveStorage(STORAGE.RECENTS, localRecentThreads);
  }, [isLoggedIn, localRecentThreads]);

  useEffect(() => {
    let cancelled = false;
    if (!isLoggedIn) {
      setServerRecentThreads([]);
      return () => {
        cancelled = true;
      };
    }

    async function hydrateServerThreads() {
      try {
        const items = await requestMakeThreads(ragConfig, authSession.accessToken);
        if (!cancelled) setServerRecentThreads(items);
      } catch (error) {
        if (cancelled) return;
        if (isAuthExpiredError(error)) {
          await onAuthExpired?.();
          return;
        }
        showNotice(error?.message || "최근 서버 대화를 불러오지 못했습니다.");
      }
    }

    hydrateServerThreads();
    return () => {
      cancelled = true;
    };
  // The API client is keyed by token and backend URL; callback identities change every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authSession?.accessToken, isLoggedIn, ragConfig.backendApiUrl]);

  return {
    isLoggedIn,
    recentThreads: isLoggedIn ? serverRecentThreads : localRecentThreads,
    serverRecentThreads,
    setLocalRecentThreads,
    setServerRecentThreads,
  };
}
