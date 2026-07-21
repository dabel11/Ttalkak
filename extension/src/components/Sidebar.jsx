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
  isSaved,
  onOpenPrompt,
  onSavePrompt,
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
      ? "Search all prompts..."
      : activeTab === "saved"
        ? "Search saved prompts..."
        : "Search recent chats...";

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`} aria-label="Search, saved prompts, and recent chats">
      <div className="sidebar-top">
        <button className="collapse-button" type="button" aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={() => setCollapsed((v) => !v)}>
          <ChevronLeft size={16} />
        </button>
      </div>
      <nav className="tab-list" aria-label="Sidebar tabs">
        <TabButton id="search" activeTab={activeTab} onClick={selectTab} icon={<Search size={15} />} label="Search" />
        <TabButton id="saved" activeTab={activeTab} onClick={selectTab} icon={<Save size={15} />} label="Saved" />
        <TabButton id="recents" activeTab={activeTab} onClick={selectTab} icon={<Clock3 size={15} />} label="Recents" />
      </nav>
      <div className="sidebar-content">
        <label className="search-input">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        </label>
        {activeTab === "search" && (
          <PromptList
            items={searchItems}
            emptyText="검색할 수 있는 프롬프트가 없습니다."
            mode="search"
            isSaved={isSaved}
            onOpenPrompt={onOpenPrompt}
            onSavePrompt={onSavePrompt}
          />
        )}
        {activeTab === "saved" && (
          <PromptList
            items={savedItems}
            emptyText="저장한 프롬프트가 없습니다."
            mode="saved"
            onOpenPrompt={onOpenPrompt}
            onDelete={onDeleteSaved}
          />
        )}
        {activeTab === "recents" && <RecentList items={recentItems} onOpenThread={onOpenRecentThread} onDelete={onDeleteRecent} />}
      </div>
    </aside>
  );
}

function TabButton({ id, activeTab, onClick, icon, label }) {
  return (
    <button className={`tab-button ${activeTab === id ? "active" : ""}`} type="button" onClick={() => onClick(id)}>
      {icon}
      <span>{label}</span>
    </button>
  );
}
