import { useEffect, useMemo, useState } from "react";
import { PROMPT_LIBRARY, STORAGE } from "../constants";
import { loadStorage, saveStorage } from "../storage/extensionStorage";
import { makePreview, promptMatches } from "../utils/promptUtils";

export function useSavedLibrary({ query, showNotice, setConfirmAction }) {
  const [savedItems, setSavedItems] = useState(() => loadStorage(STORAGE.SAVED, []));

  useEffect(() => saveStorage(STORAGE.SAVED, savedItems), [savedItems]);

  const searchItems = useMemo(() => {
    const generated = savedItems
      .filter((item) => item.content)
      .map((item) => ({ ...item, source: "saved" }));
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

  function saveLibraryPrompt(item) {
    const id = item.id.startsWith("library-") ? item.id : `saved-${item.id}`;
    setSavedItems((items) => {
      const alreadySaved = items.some((saved) => saved.id === id || saved.id === item.id || saved.content === item.content);
      if (alreadySaved) {
        showNotice("저장을 해제했습니다.");
        return items.filter((saved) => saved.id !== id && saved.id !== item.id && saved.content !== item.content);
      }
      showNotice("Saved에 저장했습니다.");
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

  function isSaved(item) {
    return savedItems.some((saved) => saved.id === item.id || saved.id === `saved-${item.id}` || saved.content === item.content);
  }

  function requestDeleteSavedItem(id) {
    setConfirmAction({
      title: "저장한 프롬프트 삭제",
      message: "이 저장한 프롬프트를 삭제할까요?",
      confirmLabel: "삭제",
      onConfirm: () => setSavedItems((prev) => prev.filter((i) => i.id !== id)),
    });
  }

  return {
    filteredSavedItems,
    isSaved,
    requestDeleteSavedItem,
    saveLibraryPrompt,
    searchItems,
    setSavedItems,
  };
}
