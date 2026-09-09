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
  const [chatKey, setChatKey] = useState(0);

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
    <div className="h-screen w-screen flex overflow-hidden">
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
      />
      <DocumentSidebar
        documents={documents}
        refreshDocuments={refreshDocuments}
        selectedDocIds={selectedDocIds}
        setSelectedDocIds={setSelectedDocIds}
        onAskSuggested={(question) => setPendingAsk({ text: question, key: Date.now() })}
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

      {showProfile && (
        <ProfileModal user={user} onClose={() => setShowProfile(false)} onUpdated={setUser} />
      )}
    </div>
  );
}