import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { Plus, Send } from "lucide-react";

/**
 * @typedef {object} ComposerProps
 * @property {string} value
 * @property {(value: string) => void} onChange
 * @property {() => void | Promise<void>} onSubmit
 * @property {boolean} disabled
 * @property {() => void} onNewChat
 * @property {boolean} hasMessages
 * @property {boolean} answeringQuestions
 */

/**
 * @param {ComposerProps} props
 * @param {import("react").ForwardedRef<HTMLTextAreaElement>} ref
 */
function ComposerView({ value, onChange, onSubmit, disabled, onNewChat, hasMessages, answeringQuestions }, ref) {
  const inputRef = useRef(null);
  useImperativeHandle(ref, () => inputRef.current);
  useLayoutEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "auto";
    const maxHeight = 132;
    const nextHeight = Math.min(input.scrollHeight, maxHeight);
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = input.scrollHeight > nextHeight ? "auto" : "hidden";
  }, [value]);
  return (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      {hasMessages && (
        <button className="newchat-button" type="button" onClick={onNewChat} disabled={disabled} aria-label="새 대화" title="새 대화">
          <Plus size={16} />
        </button>
      )}
      <textarea
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit();
          }
        }}
        rows={1}
        placeholder={answeringQuestions ? "위 질문에 대한 답변을 입력하세요..." : hasMessages ? "후속 개선 요청을 입력하세요..." : "개선하고 싶은 프롬프트를 입력하세요..."}
        aria-label={answeringQuestions ? "추가 질문 답변 입력" : "프롬프트 입력"}
      />
      <button className="send-button" type="submit" disabled={!value.trim() || disabled} aria-label="프롬프트 전송">
        <Send size={18} />
      </button>
    </form>
  );
}

export const Composer = forwardRef(ComposerView);
