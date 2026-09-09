import { useState } from "react";
import { renameSession, deleteSession } from "../api";

export default function SessionSidebar({
  sessions,
  activeSessionId,
  onSelect,
  onNewChat,
  user,
  onLogout,
  isDark,
  setIsDark,
  onSessionsChanged,
  onOpenProfile,
  mobileOpen,
  onCloseMobile,
}) {
  const [editingId, setEditingId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");

  function startRename(s, e) {
    e.stopPropagation();
    setEditingId(s.id);
    setEditingTitle(s.title || "");
  }

  async function commitRename(id) {
    const title = editingTitle.trim();
    setEditingId(null);
    if (!title) return;
    try {
      await renameSession(id, title);
      onSessionsChanged();
    } catch {
      /* silently ignore - title just won't update */
    }
  }

  async function handleDelete(id, e) {
    e.stopPropagation();
    if (!confirm("Delete this chat? This can't be undone.")) return;
    await deleteSession(id);
    if (id === activeSessionId) onNewChat();
    onSessionsChanged();
  }

  const initials = (user?.full_name || user?.email || "?").slice(0, 1).toUpperCase();

  async function handleSelect(id) {
    onSelect(id);
    onCloseMobile && onCloseMobile();
  }

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={onCloseMobile}
        />
      )}
      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-64 bg-gray-900 dark:bg-black text-gray-200 flex flex-col h-full transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="p-4 border-b border-gray-800 flex gap-2">
          <button
            onClick={() => {
              onNewChat();
              onCloseMobile && onCloseMobile();
            }}
            className="flex-1 text-sm font-medium bg-white/10 hover:bg-white/20 rounded-lg py-2 transition"
          >
            + New chat
          </button>
          <button
            onClick={() => setIsDark(!isDark)}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="w-10 shrink-0 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition"
          >
            {isDark ? "☀️" : "🌙"}
          </button>
          <button
            onClick={onCloseMobile}
            className="w-10 shrink-0 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition md:hidden"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => editingId !== s.id && handleSelect(s.id)}
              className={`group flex items-center gap-1 rounded-lg px-1 transition ${
                activeSessionId === s.id ? "bg-white/15" : "hover:bg-white/5"
              }`}
            >
            {editingId === s.id ? (
              <input
                autoFocus
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                onBlur={() => commitRename(s.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(s.id);
                  if (e.key === "Escape") setEditingId(null);
                }}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 bg-white/10 text-sm px-2 py-2 rounded-lg outline-none"
              />
            ) : (
              <button className="flex-1 text-left text-sm px-2 py-2 truncate text-gray-200 group-hover:text-white">
                {s.title || "New Chat"}
              </button>
            )}
            {editingId !== s.id && (
              <div className="hidden group-hover:flex items-center gap-1 pr-1">
                <button onClick={(e) => startRename(s, e)} title="Rename" className="text-gray-400 hover:text-white text-xs">
                  ✎
                </button>
                <button onClick={(e) => handleDelete(s.id, e)} title="Delete" className="text-gray-400 hover:text-red-400 text-xs">
                  ✕
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-gray-800">
        <button
          onClick={onOpenProfile}
          className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/10 transition text-left"
        >
          <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-white truncate text-sm">{user?.full_name || user?.email}</p>
            <p className="text-[11px] text-gray-400">View profile</p>
          </div>
        </button>
        <button onClick={onLogout} className="w-full text-xs text-gray-400 hover:text-white text-left px-2 mt-1">
          Log out
        </button>
      </div>
    </aside>
    </>
  );
}
