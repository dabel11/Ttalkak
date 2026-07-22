import { forwardRef } from "react";
import { Plus, Send } from "lucide-react";

export const Composer = forwardRef(function Composer({ value, onChange, onSubmit, disabled, onNewChat, hasMessages }, ref) {
  return (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      {hasMessages && (
        <button className="newchat-button" type="button" onClick={onNewChat} disabled={disabled} aria-label="New chat" title="New chat">
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
        placeholder={hasMessages ? "Enter a follow-up improvement request..." : "Enter a prompt to improve..."}
        aria-label="Prompt input"
      />
      <button className="send-button" type="submit" disabled={!value.trim() || disabled} aria-label="Send prompt">
        <Send size={18} />
      </button>
    </form>
  );
});
