import { ChevronLeft, Clock3, Save, Search } from "lucide-react";
import { PromptList, RecentList } from "./SavedList";

export function Sidebar({
  activeTab,
  setActiveTab,
  collapsed,
  setCollapsed,
  query,
  setQuery,
  searchItems,
  savedItems,
  recentItems,
  activeRecentId,
  savedStatus,
  isSaved,
  isSavePending,
  onOpenPrompt,
  onSavePrompt,
  onRetrySaved,
  onOpenRecentThread,
  onDeleteSaved,
  onDeleteRecent,
}) {
  function selectTab(tabId) {
    setActiveTab(tabId);
    setQuery("");
    if (collapsed) setCollapsed(false);
  }

  const placeholder =
    activeTab === "search"
      ? "전체 프롬프트 검색..."
      : activeTab === "saved"
        ? "보관한 프롬프트 검색..."
        : "최근 대화 검색...";

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`} aria-label="검색, 보관함, 최근 대화">
      <div className="sidebar-top">
        <button className="collapse-button" type="button" aria-label={collapsed ? "사이드바 펼치기" : "사이드바 접기"} onClick={() => setCollapsed((v) => !v)}>
          <ChevronLeft size={16} />
        </button>
      </div>
      <nav className="tab-list" aria-label="사이드바 탭">
        <TabButton id="search" activeTab={activeTab} onClick={selectTab} icon={<Search size={15} />} label="검색" />
        <TabButton id="saved" activeTab={activeTab} onClick={selectTab} icon={<Save size={15} />} label="보관함" />
        <TabButton id="recents" activeTab={activeTab} onClick={selectTab} icon={<Clock3 size={15} />} label="최근" />
      </nav>
      <div className="sidebar-content" inert={collapsed ? true : undefined} aria-hidden={collapsed ? "true" : undefined}>
        <label className="search-input">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        </label>
        {activeTab === "search" && (
          <PromptList
            items={searchItems}
            emptyText="검색할 수 있는 프롬프트가 없습니다."
            mode="search"
            isSaved={isSaved}
            isSavePending={isSavePending}
            onOpenPrompt={onOpenPrompt}
            onSavePrompt={onSavePrompt}
          />
        )}
        {activeTab === "saved" && (
          <>
            {savedStatus === "loading" && <div className="sidebar-state" role="status" aria-live="polite">보관함을 불러오는 중…</div>}
            {savedStatus === "error" && (
              <div className="sidebar-state error" role="alert">
                <p>서버 보관함을 불러오지 못했습니다.</p>
                <button type="button" onClick={onRetrySaved}>다시 시도</button>
              </div>
            )}
            {(savedStatus !== "loading" || savedItems.length > 0) && (
              <PromptList
                items={savedItems}
                emptyText="저장한 프롬프트가 없습니다."
                mode="saved"
                onOpenPrompt={onOpenPrompt}
                onDelete={onDeleteSaved}
              />
            )}
          </>
        )}
        {activeTab === "recents" && <RecentList items={recentItems} activeId={activeRecentId} onOpenThread={onOpenRecentThread} onDelete={onDeleteRecent} />}
      </div>
    </aside>
  );
}

function TabButton({ id, activeTab, onClick, icon, label }) {
  return (
    <button
      className={`tab-button ${activeTab === id ? "active" : ""}`}
      type="button"
      onClick={() => onClick(id)}
      aria-label={label}
      title={label}
      data-tooltip={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
