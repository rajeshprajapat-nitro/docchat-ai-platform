
import { useState } from "react";
import { renameSession, deleteSession, shareSession } from "../api";

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
  const [sharingId, setSharingId] = useState(null);

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

    try {
      await deleteSession(id);

      if (id === activeSessionId) {
        onNewChat();
      }

      onSessionsChanged();
    } catch {
      /* silently ignore */
    }
  }

  async function handleShare(id, e) {
    e.stopPropagation();

    if (sharingId) return;

    setSharingId(id);

    try {
      const shareUrl = await shareSession(id);

      await navigator.clipboard.writeText(shareUrl);

      alert("Share link copied to clipboard!");
    } catch (err) {
      console.error(err);

      // Fallback for browsers where clipboard API is unavailable
      try {
        const shareUrl = await shareSession(id);
        window.prompt("Copy this share link:", shareUrl);
      } catch {
        alert("Failed to create share link.");
      }
    } finally {
      setSharingId(null);
    }
  }

  const initials = (
    user?.full_name ||
    user?.email ||
    "?"
  )
    .slice(0, 1)
    .toUpperCase();

  async function handleSelect(id) {
    onSelect(id);
    if (onCloseMobile) {
      onCloseMobile();
    }
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
          mobileOpen
            ? "translate-x-0"
            : "-translate-x-full md:translate-x-0"
        }`}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-800 flex gap-2">
          <button
            type="button"
            onClick={() => {
              onNewChat();
              if (onCloseMobile) {
                onCloseMobile();
              }
            }}
            className="flex-1 text-sm font-medium bg-white/10 hover:bg-white/20 rounded-lg py-2 transition"
          >
            + New chat
          </button>

          <button
            type="button"
            onClick={() => setIsDark(!isDark)}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="w-10 shrink-0 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition"
          >
            {isDark ? "☀️" : "🌙"}
          </button>

          <button
            type="button"
            onClick={onCloseMobile}
            className="w-10 shrink-0 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition md:hidden"
          >
            ✕
          </button>
        </div>

        {/* Sessions */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() =>
                editingId !== s.id && handleSelect(s.id)
              }
              className={`group flex items-center gap-1 rounded-lg px-1 transition ${
                activeSessionId === s.id
                  ? "bg-white/15"
                  : "hover:bg-white/5"
              }`}
            >
              {editingId === s.id ? (
                <input
                  autoFocus
                  value={editingTitle}
                  onChange={(e) =>
                    setEditingTitle(e.target.value)
                  }
                  onBlur={() => commitRename(s.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      commitRename(s.id);
                    }

                    if (e.key === "Escape") {
                      setEditingId(null);
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 bg-white/10 text-sm px-2 py-2 rounded-lg outline-none"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => handleSelect(s.id)}
                  className="flex-1 text-left text-sm px-2 py-2 truncate text-gray-200 group-hover:text-white"
                >
                  {s.title || "New Chat"}
                </button>
              )}

              {editingId !== s.id && (
                <div
                  className="
                    flex
                    items-center
                    gap-1
                    pr-1
                  "
                >
                  {/* Share */}
                  <button
                    type="button"
                    onClick={(e) => handleShare(s.id, e)}
                    disabled={sharingId === s.id}
                    title="Share chat"
                    className="
                      text-gray-400
                      hover:text-blue-400
                      text-xs
                      disabled:opacity-50
                      disabled:cursor-not-allowed
                    "
                  >
                    {sharingId === s.id ? "…" : "🔗"}
                  </button>

                  {/* Rename */}
                  <button
                    type="button"
                    onClick={(e) => startRename(s, e)}
                    title="Rename"
                    className="text-gray-400 hover:text-white text-xs"
                  >
                    ✎
                  </button>

                  {/* Delete */}
                  <button
                    type="button"
                    onClick={(e) => handleDelete(s.id, e)}
                    title="Delete"
                    className="text-gray-400 hover:text-red-400 text-xs"
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Profile */}
        <div className="p-3 border-t border-gray-800">
          <button
            type="button"
            onClick={onOpenProfile}
            className="w-full flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/10 transition text-left"
          >
            <div className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-semibold shrink-0">
              {initials}
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-medium text-white truncate text-sm">
                {user?.full_name || user?.email}
              </p>

              <p className="text-[11px] text-gray-400">
                View profile
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="w-full text-xs text-gray-400 hover:text-white text-left px-2 mt-1"
          >
            Log out
          </button>
        </div>
      </aside>
    </>
  );
}

