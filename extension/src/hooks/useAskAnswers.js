// @ts-check
import { useEffect } from "react";
import { isAskResponse } from "../conversation/askAnswers.js";

export function useAskAnswers({ messages, isLoading, composerRef }) {
  const latestMessage = messages.at(-1);
  const answeringQuestions = !isLoading && latestMessage?.role === "assistant" && isAskResponse(latestMessage);

  useEffect(() => {
    if (!answeringQuestions) return;
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [answeringQuestions, composerRef, latestMessage?.id]);

  return { answeringQuestions };
}
