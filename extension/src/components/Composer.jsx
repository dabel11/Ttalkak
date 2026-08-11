import { forwardRef } from "react";
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
  return (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      {hasMessages && (
        <button className="newchat-button" type="button" onClick={onNewChat} disabled={disabled} aria-label="새 대화" title="새 대화">
          <Plus size={16} />
        </button>
      )}
      <textarea
        ref={ref}
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
