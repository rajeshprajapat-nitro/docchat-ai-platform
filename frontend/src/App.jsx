import { useEffect, useState, useCallback } from "react";

import AuthScreen from "./components/AuthScreen";
import ResetPassword from "./components/ResetPassword";
import DocumentSidebar from "./components/DocumentSidebar";
import SessionSidebar from "./components/SessionSidebar";
import ChatPanel from "./components/ChatPanel";
import ProfileModal from "./components/ProfileModal";
import SharedChatView from "./components/SharedChatView";

import {
  fetchDocuments,
  fetchSessions,
  fetchMessages,
  fetchMe,
} from "./api";

import { useDarkMode } from "./useDarkMode";


/* =========================================================
   Public Routes
   ========================================================= */

function PublicRoute() {
  const path = window.location.pathname;

  /* Shared Chat */
  const shareMatch = path.match(/^\/share\/([^/]+)/);

  if (shareMatch) {
    return <SharedChatView token={shareMatch[1]} />;
  }

  /* Reset Password */
  if (path === "/reset-password") {
    return <ResetPassword />;
  }

  return null;
}


/* =========================================================
   Main Authenticated App
   ========================================================= */

function AuthenticatedApp() {
  const [isDark, setIsDark] = useDarkMode();

  const [user, setUser] = useState(null);
  const [checkedAuth, setCheckedAuth] = useState(false);

  const [showProfile, setShowProfile] = useState(false);

  const [documents, setDocuments] = useState([]);
  const [selectedDocIds, setSelectedDocIds] = useState([]);

  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [activeMessages, setActiveMessages] = useState([]);

  const [pendingAsk, setPendingAsk] = useState(null);

  /*
    Separate remount trigger for ChatPanel.

    Only bumped on:
    - Explicit "New chat"
    - Selecting another chat

    It is NOT bumped when a new session is automatically
    created during the first message.
  */
  const [chatKey, setChatKey] = useState(0);

  const [mobileSessionsOpen, setMobileSessionsOpen] = useState(false);
  const [mobileDocsOpen, setMobileDocsOpen] = useState(false);


  /* =========================================================
     Check Existing Login
     ========================================================= */

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
      .finally(() => {
        setCheckedAuth(true);
      });
  }, []);


  /* =========================================================
     Refresh Documents
     ========================================================= */

  const refreshDocuments = useCallback(() => {
    fetchDocuments()
      .then(setDocuments)
      .catch(() => {});
  }, []);


  /* =========================================================
     Refresh Sessions
     ========================================================= */

  const refreshSessions = useCallback(() => {
    fetchSessions()
      .then(setSessions)
      .catch(() => {});
  }, []);


  /* =========================================================
     Load User Data
     ========================================================= */

  useEffect(() => {
    if (!user) return;

    refreshDocuments();
    refreshSessions();

    /*
      Poll documents every 4 seconds so processing status
      updates automatically.
    */
    const interval = setInterval(() => {
      refreshDocuments();
    }, 4000);

    return () => clearInterval(interval);
  }, [user, refreshDocuments, refreshSessions]);


  /* =========================================================
     Select Existing Chat
     ========================================================= */

  async function handleSelectSession(id) {
    setActiveSessionId(id);

    const msgs = await fetchMessages(id);

    setActiveMessages(msgs);

    /*
      Explicitly selecting another chat should remount
      ChatPanel so it loads the selected conversation.
    */
    setChatKey((k) => k + 1);

    /* Close mobile drawer */
    setMobileSessionsOpen(false);
  }


  /* =========================================================
     New Chat
     ========================================================= */

  function handleNewChat() {
    setActiveSessionId(null);
    setActiveMessages([]);

    /*
      Explicit new chat → remount ChatPanel.
    */
    setChatKey((k) => k + 1);

    /* Close mobile drawer */
    setMobileSessionsOpen(false);
  }


  /* =========================================================
     New Session Created
     ========================================================= */

  function handleSessionCreated(id) {
    /*
      IMPORTANT:
      Do NOT change chatKey here.

      This happens when the first message of a new chat
      creates a session on the backend.

      Remounting ChatPanel here would remove the
      currently streaming answer from the UI.
    */

    setActiveSessionId(id);

    refreshSessions();
  }


  /* =========================================================
     Logout
     ========================================================= */

  function handleLogout() {
    localStorage.removeItem("token");

    setUser(null);

    setDocuments([]);
    setSessions([]);

    setActiveSessionId(null);
    setActiveMessages([]);

    setSelectedDocIds([]);

    setShowProfile(false);
  }


  /* =========================================================
     After Login / Signup
     ========================================================= */

  async function handleAuthenticated() {
    try {
      const me = await fetchMe();

      setUser(me);
    } catch {
      /*
        If token is invalid, remove it and stay logged out.
      */
      localStorage.removeItem("token");
      setUser(null);
    }
  }


  /* =========================================================
     Loading
     ========================================================= */

  if (!checkedAuth) {
    return null;
  }


  /* =========================================================
     Login / Signup Screen
     ========================================================= */

  if (!user) {
    return (
      <AuthScreen
        onAuthenticated={handleAuthenticated}
      />
    );
  }


  /* =========================================================
     Active Session
     ========================================================= */

  const activeSession = sessions.find(
    (s) => s.id === activeSessionId
  );


  /* =========================================================
     Main UI
     ========================================================= */

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">

     {/* =====================================================
    Mobile Top Bar
    ===================================================== */}

<div className="md:hidden flex items-center px-3 py-2 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shrink-0">

  {/* Chat History */}
  <button
    onClick={() => setMobileSessionsOpen(true)}
    className="p-2 text-gray-600 dark:text-gray-300"
    aria-label="Open chat history"
  >
    ☰
  </button>

  {/* Logo */}
  <div className="flex-1 flex justify-center">
    <img
      src="/logo-full.png"
      alt="DocChat AI"
      className="h-20 w-auto object-contain dark:hidden"
    />

    <img
      src="/logo-full-dark.png"
      alt="DocChat AI"
      className="h-20 w-auto object-contain hidden dark:block"
    />
  </div>

  {/* Documents */}
  <button
    onClick={() => setMobileDocsOpen(true)}
    className="p-2 text-gray-600 dark:text-gray-300"
    aria-label="Open documents"
  >
    📄
  </button>

</div>


      {/* =====================================================
          Main Layout
          ===================================================== */}

      <div className="flex-1 flex overflow-hidden">

        {/* ===================================================
            Session Sidebar
            =================================================== */}

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


        {/* ===================================================
            Document Sidebar
            =================================================== */}

        <DocumentSidebar
          documents={documents}
          refreshDocuments={refreshDocuments}
          selectedDocIds={selectedDocIds}
          setSelectedDocIds={setSelectedDocIds}
          onAskSuggested={(question) =>
            setPendingAsk({
              text: question,
              key: Date.now(),
            })
          }
          mobileOpen={mobileDocsOpen}
          onCloseMobile={() => setMobileDocsOpen(false)}
        />


        {/* ===================================================
            Chat Panel
            =================================================== */}

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


      {/* =====================================================
          Profile Modal
          ===================================================== */}

      {showProfile && (
        <ProfileModal
          user={user}
          onClose={() => setShowProfile(false)}
          onUpdated={setUser}
        />
      )}

    </div>
  );
}


/* =========================================================
   App
   ========================================================= */

export default function App() {

  /*
    Public pages do not require authentication.

    /share/:token
    /reset-password?token=...

    Everything else uses the normal authenticated app.
  */

  const publicRoute = PublicRoute();

  if (publicRoute) {
    return publicRoute;
  }

  return <AuthenticatedApp />;
}