import { Bookmark, BookmarkCheck, X } from "lucide-react";
import { getMakeRecentDateGroup } from "../../../shared/make-message-model.js";

export function PromptList({ items, emptyText, mode, isSaved = (_item) => false, onOpenPrompt, onSavePrompt = (_item) => {}, onDelete = (_id) => {} }) {
  if (items.length === 0) return <p className="empty-list">{emptyText}</p>;

  return (
    <div className="prompt-list" aria-label={mode === "search" ? "전체 프롬프트 검색 결과" : "저장한 프롬프트 목록"}>
      {items.map((item) => {
        const saved = isSaved?.(item);
        return (
          <div className="saved-item-wrap" key={item.id}>
            <div
              className="saved-item"
              role="button"
              tabIndex={0}
              onClick={() => onOpenPrompt(item)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onOpenPrompt(item);
                }
              }}
            >
              <strong>{item.title}</strong>
              <span>{item.preview}</span>
              {item.tags?.length > 0 && <small>{item.tags.map((tag) => `#${tag}`).join(" ")}</small>}
              {mode === "search" && (
                <button
                  className={`save-card-action ${saved ? "saved" : ""}`}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSavePrompt(item);
                  }}
                  aria-label={saved ? "보관 취소" : "보관"}
                  title={saved ? "보관 취소" : "보관"}
                >
                  {saved ? <BookmarkCheck size={14} /> : <Bookmark size={14} />}
                  {saved ? "보관됨" : "보관"}
                </button>
              )}
            </div>
            {mode === "saved" && (
              <button
                className="delete-item-btn"
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(item.id);
                }}
                aria-label="삭제"
                title="삭제"
              >
                <X size={11} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function RecentList({ items, activeId, onOpenThread, onDelete }) {
  if (items.length === 0) return <p className="empty-list">최근 대화가 없습니다.</p>;
  const groups = items.reduce((result, item) => {
    const label = getMakeRecentDateGroup(item.createdAt || item.updatedAt || item.time);
    const group = result.find((entry) => entry.label === label);
    if (group) group.items.push(item);
    else result.push({ label, items: [item] });
    return result;
  }, []);

  return (
    <div className="recent-list" aria-label="최근 대화 목록">
      {groups.map((group) => <section className="recent-group" key={group.label} aria-label={group.label}>
        <h3>{group.label}</h3>
        {group.items.map((item) => {
          const normalizedActiveId = String(activeId || "");
          const isActive = Boolean(normalizedActiveId) && [item.id, item.serverId]
            .some((value) => String(value || "") === normalizedActiveId);
          return (
        <div className="saved-item-wrap" key={item.id}>
          <button className={`recent-item ${isActive ? "active" : ""}`} type="button" aria-current={isActive ? "true" : undefined} onClick={() => onOpenThread(item)}>
            <strong>{item.title}</strong>
            <span>{item.time}</span>
          </button>
          <button
            className="delete-item-btn"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.id);
            }}
            aria-label="삭제"
            title="삭제"
          >
            <X size={11} />
          </button>
        </div>
          );
        })}
      </section>)}
    </div>
  );
}
