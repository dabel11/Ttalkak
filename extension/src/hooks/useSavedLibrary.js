import { useEffect, useMemo, useRef, useState } from "react";
import { getPromptSaveId, requestSavedPrompts, savePrompt, unsavePrompt } from "../api/saved";
import { PROMPT_LIBRARY, STORAGE } from "../constants";
import { loadStorage, saveStorage } from "../storage/extensionStorage";
import { isAuthExpiredError } from "../utils/apiErrors";
import { makePreview, promptMatches } from "../utils/promptUtils";

export function useSavedLibrary({ authSession, query, ragConfig, showNotice, setConfirmAction, onAuthExpired }) {
  const [localSavedItems, setLocalSavedItems] = useState(() => loadStorage(STORAGE.SAVED, []));
  const [serverSavedItems, setServerSavedItems] = useState([]);
  const [savedStatus, setSavedStatus] = useState("idle");
  const [pendingSaveIds, setPendingSaveIds] = useState(() => new Set());
  const mergedTokenRef = useRef("");
  const isLoggedIn = Boolean(authSession?.accessToken);
  const savedItems = isLoggedIn ? serverSavedItems : localSavedItems;

  useEffect(() => {
    if (!isLoggedIn) saveStorage(STORAGE.SAVED, localSavedItems);
  }, [isLoggedIn, localSavedItems]);

  useEffect(() => {
    let cancelled = false;
    if (!isLoggedIn) {
      setServerSavedItems([]);
      setSavedStatus("local");
      mergedTokenRef.current = "";
      return () => {
        cancelled = true;
      };
    }

    async function hydrateSavedItems() {
      setSavedStatus("loading");
      try {
        const token = authSession.accessToken;
        if (mergedTokenRef.current !== token && localSavedItems.length > 0) {
          const mergeable = localSavedItems
            .map(getPromptSaveId)
            .filter(Boolean)
            .filter((id, index, list) => list.indexOf(id) === index);
          if (mergeable.length > 0) {
            await Promise.allSettled(mergeable.map((promptId) => savePrompt(ragConfig, promptId, token)));
            setLocalSavedItems((items) => items.filter((item) => !mergeable.includes(getPromptSaveId(item))));
            showNotice("로컬 보관함을 서버 보관함에 병합했습니다.");
          }
          mergedTokenRef.current = token;
        }

        const items = await requestSavedPrompts(ragConfig, { accessToken: authSession.accessToken });
        if (cancelled) return;
        setServerSavedItems(items);
        setSavedStatus("server");
      } catch (error) {
        if (cancelled) return;
        setSavedStatus("error");
        if (isAuthExpiredError(error)) {
          await onAuthExpired?.();
          return;
        }
        showNotice(error?.message || "서버 저장 목록을 불러오지 못했습니다.");
      }
    }

    hydrateSavedItems();
    return () => {
      cancelled = true;
    };
  }, [authSession?.accessToken, isLoggedIn, ragConfig.backendApiUrl]);

  const searchItems = useMemo(() => {
    const generated = savedItems
      .filter((item) => item.content)
      .map((item) => ({ ...item, source: item.source || "saved" }));
    const merged = [...PROMPT_LIBRARY.map((item) => ({ ...item, source: "library" })), ...generated];
    const seen = new Set();
    return merged
      .filter((item) => {
        const key = `${item.title}:${item.content || item.preview}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .filter((item) => promptMatches(item, query));
  }, [query, savedItems]);

  const filteredSavedItems = useMemo(
    () => savedItems.filter((item) => promptMatches(item, query)),
    [query, savedItems]
  );

  function setPromptPending(promptId, pending) {
    setPendingSaveIds((current) => {
      const next = new Set(current);
      if (pending) next.add(promptId);
      else next.delete(promptId);
      return next;
    });
  }

  async function refreshSavedItems() {
    if (!isLoggedIn) return localSavedItems;
    setSavedStatus("loading");
    try {
      const items = await requestSavedPrompts(ragConfig, { accessToken: authSession.accessToken });
      setServerSavedItems(items);
      setSavedStatus("server");
      return items;
    } catch (error) {
      setSavedStatus("error");
      if (isAuthExpiredError(error)) await onAuthExpired?.();
      else showNotice(error?.message || "서버 저장 목록을 불러오지 못했습니다.");
      return [];
    }
  }

  async function saveLibraryPrompt(item) {
    if (isLoggedIn) {
      const promptId = getPromptSaveId(item);
      if (!promptId) {
        showNotice("서버에 등록된 프롬프트만 보관함에 저장할 수 있습니다.");
        return;
      }
      if (pendingSaveIds.has(promptId)) return;
      setPromptPending(promptId, true);
      try {
        if (isSaved(item)) {
          await unsavePrompt(ragConfig, promptId, authSession.accessToken);
          showNotice("서버 보관함에서 제거했습니다.");
        } else {
          await savePrompt(ragConfig, promptId, authSession.accessToken);
          showNotice("서버 보관함에 저장했습니다.");
        }
        await refreshSavedItems();
      } catch (error) {
        if (isAuthExpiredError(error)) await onAuthExpired?.();
        else showNotice(error?.message || "저장 상태를 변경하지 못했습니다.");
      } finally {
        setPromptPending(promptId, false);
      }
      return;
    }

    const id = item.id.startsWith("library-") ? item.id : `saved-${item.id}`;
    setLocalSavedItems((items) => {
      const alreadySaved = items.some((saved) => saved.id === id || saved.id === item.id || saved.content === item.content);
      if (alreadySaved) {
        showNotice("저장을 해제했습니다.");
        return items.filter((saved) => saved.id !== id && saved.id !== item.id && saved.content !== item.content);
      }
      showNotice("보관함에 저장했습니다.");
      return [
        {
          id,
          title: item.title,
          preview: item.preview || makePreview(item.content),
          content: item.content,
          executablePrompt: item.content,
          sourcePrompt: item.content,
          tags: item.tags || [],
        },
        ...items,
      ];
    });
  }

  function setSavedItems(updater) {
    if (isLoggedIn) {
      setServerSavedItems(updater);
      return;
    }
    setLocalSavedItems(updater);
  }

  function isSaved(item) {
    const promptId = getPromptSaveId(item);
    return savedItems.some((saved) => {
      const savedPromptId = getPromptSaveId(saved);
      return (promptId && savedPromptId === promptId) || saved.id === item.id || saved.id === `saved-${item.id}` || saved.content === item.content;
    });
  }

  function requestDeleteSavedItem(id) {
    const item = savedItems.find((saved) => saved.id === id || saved.serverId === id);
    if (isLoggedIn) {
      const promptId = getPromptSaveId(item || { id });
      setConfirmAction({
        title: "서버 보관함에서 제거",
        message: "이 프롬프트를 서버 보관함에서 제거할까요?",
        confirmLabel: "제거",
        onConfirm: async () => {
          if (!promptId) {
            showNotice("서버 프롬프트 ID를 확인할 수 없습니다.");
            return;
          }
          try {
            await unsavePrompt(ragConfig, promptId, authSession.accessToken);
            showNotice("서버 보관함에서 제거했습니다.");
            await refreshSavedItems();
          } catch (error) {
            if (isAuthExpiredError(error)) await onAuthExpired?.();
            else showNotice(error?.message || "서버 보관함에서 제거하지 못했습니다.");
          }
        },
      });
      return;
    }

    setConfirmAction({
      title: "저장한 프롬프트 삭제",
      message: "이 저장한 프롬프트를 삭제할까요?",
      confirmLabel: "삭제",
      onConfirm: () => setLocalSavedItems((prev) => prev.filter((i) => i.id !== id)),
    });
  }

  return {
    filteredSavedItems,
    isSaved,
    refreshSavedItems,
    requestDeleteSavedItem,
    saveLibraryPrompt,
    savedStatus,
    searchItems,
    setSavedItems,
  };
}
