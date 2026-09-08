import { useEffect, useState } from "react";
import { updateProfile, changePassword, fetchAnalytics } from "../api";

export default function ProfileModal({ user, onClose, onUpdated }) {
  const [tab, setTab] = useState("profile"); // profile | settings | usage

  const [fullName, setFullName] = useState(user?.full_name || "");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState("");

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState("");

  const [webDefault, setWebDefault] = useState(() => localStorage.getItem("docchat-web-default") === "true");

  const [analytics, setAnalytics] = useState(null);
  const [analyticsError, setAnalyticsError] = useState("");

  useEffect(() => {
    if (tab === "usage" && !analytics) {
      fetchAnalytics()
        .then(setAnalytics)
        .catch(() => setAnalyticsError("Couldn't load usage stats."));
    }
  }, [tab, analytics]);

  async function handleSaveName(e) {
    e.preventDefault();
    setSavingName(true);
    setNameMsg("");
    try {
      const updated = await updateProfile(fullName);
      onUpdated(updated);
      setNameMsg("Saved.");
    } catch (err) {
      setNameMsg(err.message);
    } finally {
      setSavingName(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordMsg("");
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordMsg("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setPasswordMsg(err.message);
    } finally {
      setSavingPassword(false);
    }
  }

  function toggleWebDefault() {
    setWebDefault((v) => {
      localStorage.setItem("docchat-web-default", String(!v));
      return !v;
    });
  }

  const initials = (user?.full_name || user?.email || "?").slice(0, 1).toUpperCase();

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Account</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm">
            ✕
          </button>
        </div>

        <div className="flex border-b border-gray-100 dark:border-gray-800 px-2">
          {[
            ["profile", "Profile"],
            ["settings", "Settings"],
            ["usage", "Usage"],
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-3 py-2.5 text-xs font-medium border-b-2 transition ${
                tab === key
                  ? "border-brand-600 text-brand-600 dark:text-brand-400"
                  : "border-transparent text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="p-5 max-h-[60vh] overflow-y-auto scrollbar-thin">
          {tab === "profile" && (
            <div className="space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-brand-600 text-white flex items-center justify-center text-lg font-semibold">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{user?.email}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Account details</p>
                </div>
              </div>

              <form onSubmit={handleSaveName} className="space-y-2">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Display name</label>
                <div className="flex gap-2">
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Your name"
                    className="flex-1 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    type="submit"
                    disabled={savingName}
                    className="bg-brand-600 hover:bg-brand-700 text-white text-sm px-4 rounded-lg disabled:opacity-60"
                  >
                    Save
                  </button>
                </div>
                {nameMsg && <p className="text-xs text-gray-500 dark:text-gray-400">{nameMsg}</p>}
              </form>

              <form onSubmit={handleChangePassword} className="space-y-2 pt-4 border-t border-gray-100 dark:border-gray-800">
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400">Change password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Current password"
                  className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  type="submit"
                  disabled={savingPassword}
                  className="w-full bg-gray-800 hover:bg-gray-900 dark:bg-gray-700 dark:hover:bg-gray-600 text-white text-sm py-2 rounded-lg disabled:opacity-60"
                >
                  Update password
                </button>
                {passwordMsg && <p className="text-xs text-gray-500 dark:text-gray-400">{passwordMsg}</p>}
              </form>
            </div>
          )}

          {tab === "settings" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Web search by default</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">New chats start with the 🌐 toggle on</p>
                </div>
                <button
                  onClick={toggleWebDefault}
                  className={`w-11 h-6 rounded-full transition relative shrink-0 ${
                    webDefault ? "bg-brand-600" : "bg-gray-300 dark:bg-gray-700"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition ${
                      webDefault ? "left-5" : "left-0.5"
                    }`}
                  />
                </button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 pt-2 border-t border-gray-100 dark:border-gray-800">
                Note: even with this off, answers automatically pull in web results when your
                documents don't cover a question well.
              </p>
            </div>
          )}

          {tab === "usage" && (
            <div className="space-y-3">
              {analyticsError && <p className="text-xs text-red-500">{analyticsError}</p>}
              {!analytics && !analyticsError && <p className="text-xs text-gray-400 dark:text-gray-500">Loading…</p>}
              {analytics && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <StatBox label="Documents" value={analytics.total_documents} />
                    <StatBox label="Chunks indexed" value={analytics.total_chunks} />
                    <StatBox label="Chats" value={analytics.total_chats} />
                    <StatBox label="Messages" value={analytics.total_messages} />
                  </div>
                  <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-2">
                    <UsageBar
                      label="Uploads today"
                      used={analytics.uploads_today}
                      max={analytics.max_uploads_per_day}
                    />
                    <UsageBar
                      label="Queries today"
                      used={analytics.queries_today}
                      max={analytics.max_queries_per_day}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
      <p className="text-lg font-semibold text-gray-800 dark:text-gray-100">{value ?? 0}</p>
      <p className="text-[11px] text-gray-400 dark:text-gray-500">{label}</p>
    </div>
  );
}

function UsageBar({ label, used, max }) {
  const pct = max ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-1">
        <span>{label}</span>
        <span>
          {used} / {max}
        </span>
      </div>
      <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className="h-full bg-brand-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
