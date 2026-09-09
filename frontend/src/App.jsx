import { useEffect, useState, useCallback } from "react";
import AuthScreen from "./components/AuthScreen";
import DocumentSidebar from "./components/DocumentSidebar";
import SessionSidebar from "./components/SessionSidebar";
import ChatPanel from "./components/ChatPanel";
import ProfileModal from "./components/ProfileModal";
import SharedChatView from "./components/SharedChatView";
import { fetchDocuments, fetchSessions, fetchMessages, fetchMe } from "./api";
import { useDarkMode } from "./useDarkMode";

export default function App() {
  const [isDark, setIsDark] = useDarkMode();

  // Simple manual routing for the one public route this app needs - no
  // router library required. /share/<token> renders a read-only view with
  // no auth, everything else renders the normal authenticated app.
  const shareMatch = window.location.pathname.match(/^\/share\/([^/]+)/);
  if (shareMatch) {
    return <SharedChatView token={shareMatch[1]} />;
  }

  const [user, setUser] = useState(null);
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);

  const [documents, setDocuments] = useState([]);
  const [selectedDocIds, setSelectedDocIds] = useState([]);

  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [activeMessages, setActiveMessages] = useState([]);
  const [pendingAsk, setPendingAsk] = useState(null);
  // Separate remount trigger for ChatPanel - only bumped on an EXPLICIT
  // "New chat" click or picking a different chat from the sidebar. A
  // session ID that appears mid-conversation (auto-created by the first
  // message of a new chat) must NOT remount ChatPanel, or the in-progress
  // streamed answer disappears from view even though it saved fine.
  const [chatKey, setChatKey] = useState(0);
  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false);
  const [mobileDocsOpen, setMobileDocsOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      setCheckedAuth(true);
      return;
    }
    fetchMe()
      .then(setUser)
      .catch(() => {
        localStorage.removeItem("token");
        setUser(null);
      })
      .finally(() => setCheckedAuth(true));
  }, []);

  const refreshDocuments = useCallback(() => {
    fetchDocuments().then(setDocuments).catch(() => {});
  }, []);

  const refreshSessions = useCallback(() => {
    fetchSessions().then(setSessions).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    refreshDocuments();
    refreshSessions();

    // poll documents while any are processing, so status updates live
    const interval = setInterval(() => {
      refreshDocuments();
    }, 4000);
    return () => clearInterval(interval);
  }, [user, refreshDocuments, refreshSessions]);

  async function handleSelectSession(id) {
    setActiveSessionId(id);
    const msgs = await fetchMessages(id);
    setActiveMessages(msgs);
    setChatKey((k) => k + 1);
  }

  function handleNewChat() {
    setActiveSessionId(null);
    setActiveMessages([]);
    setChatKey((k) => k + 1);
  }

  function handleSessionCreated(id) {
    // Intentionally does NOT touch chatKey - this fires mid-conversation
    // when a brand-new chat's first message creates its session on the
    // backend. Remounting here would wipe the answer that's still
    // streaming/just streamed, even though it saved correctly server-side.
    setActiveSessionId(id);
    refreshSessions();
  }

  function handleLogout() {
    localStorage.removeItem("token");
    setUser(null);
    setDocuments([]);
    setSessions([]);
    setActiveSessionId(null);
    setActiveMessages([]);
  }

  async function handleAuthenticated() {
    try {
      const me = await fetchMe();
      setUser(me);
    } catch {
      setUser({ email: "" });
    }
  }

  if (!checkedAuth) return null;
  if (!user) return <AuthScreen onAuthenticated={handleAuthenticated} />;

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* Mobile top bar - hidden on desktop, gives access to both drawers */}
      <div className="md:hidden flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">
        <button
          onClick={() => setMobileSessionsOpen(true)}
          className="p-2 text-gray-600 dark:text-gray-300"
          aria-label="Open chat history"
        >
          ☰
        </button>
        <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">DocChat</span>
        <button
          onClick={() => setMobileDocsOpen(true)}
          className="p-2 text-gray-600 dark:text-gray-300"
          aria-label="Open documents"
        >
          📄
        </button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <SessionSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelect={handleSelectSession}
          onNewChat={handleNewChat}
          user={user}
          onLogout={handleLogout}
          isDark={isDark}
          setIsDark={setIsDark}
          onSessionsChanged={refreshSessions}
          onOpenProfile={() => setShowProfile(true)}
          mobileOpen={mobileSessionsOpen}
          onCloseMobile={() => setMobileSessionsOpen(false)}
        />
        <DocumentSidebar
          documents={documents}
          refreshDocuments={refreshDocuments}
          selectedDocIds={selectedDocIds}
          setSelectedDocIds={setSelectedDocIds}
          onAskSuggested={(question) => setPendingAsk({ text: question, key: Date.now() })}
          mobileOpen={mobileDocsOpen}
          onCloseMobile={() => setMobileDocsOpen(false)}
        />
        <ChatPanel
          key={chatKey}
          sessionId={activeSessionId}
          setSessionId={handleSessionCreated}
          selectedDocIds={selectedDocIds}
          initialMessages={activeMessages}
          sessionTitle={activeSession?.title}
          pendingAsk={pendingAsk}
        />
      </div>

      {showProfile && (
        <ProfileModal user={user} onClose={() => setShowProfile(false)} onUpdated={setUser} />
      )}
    </div>
  );
}
