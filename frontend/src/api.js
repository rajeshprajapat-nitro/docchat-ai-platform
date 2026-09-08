export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

function authHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function getPreviewUrl(documentId) {
  const token = localStorage.getItem("token");
  return `${API_BASE}/documents/${documentId}/file?token=${encodeURIComponent(token || "")}`;
}

export function exportChatAsMarkdown(messages, title = "chat") {
  const lines = [`# ${title}`, ""];
  for (const m of messages) {
    const speaker = m.role === "user" ? "**You**" : "**Assistant**";
    lines.push(`${speaker}: ${m.content}`);
    if (m.citations && m.citations.length) {
      lines.push("");
      lines.push("Sources:");
      m.citations.forEach((c, i) => {
        lines.push(`${i + 1}. ${c.filename}${c.page ? ` (p.${c.page})` : ""}`);
      });
    }
    lines.push("");
  }

  const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${title.replace(/[^a-z0-9]+/gi, "_").toLowerCase() || "chat"}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function fetchAnalytics() {
  const res = await fetch(`${API_BASE}/analytics/summary`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load analytics");
  return res.json();
}

export async function fetchMe() {
  const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load profile");
  return res.json();
}

export async function updateProfile(full_name) {
  const res = await fetch(`${API_BASE}/auth/me`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ full_name }),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Update failed");
  return res.json();
}

export async function changePassword(current_password, new_password) {
  const res = await fetch(`${API_BASE}/auth/change-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ current_password, new_password }),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Password change failed");
  return res.json();
}

export async function renameSession(id, title) {
  const res = await fetch(`${API_BASE}/chat/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) throw new Error("Rename failed");
  return res.json();
}

export async function deleteSession(id) {
  const res = await fetch(`${API_BASE}/chat/sessions/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Delete failed");
  return res.json();
}

export async function shareSession(id) {
  const res = await fetch(`${API_BASE}/chat/sessions/${id}/share`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to create share link");
  const data = await res.json();
  return `${window.location.origin}/share/${data.token}`;
}

export async function fetchSharedChat(token) {
  const res = await fetch(`${API_BASE}/chat/share/${token}`);
  if (!res.ok) throw new Error("Shared chat not found");
  return res.json();
}

export async function signup(email, password, full_name) {
  const res = await fetch(`${API_BASE}/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, full_name }),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Signup failed");
  return res.json();
}

export async function login(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Login failed");
  return res.json();
}

export async function fetchDocuments() {
  const res = await fetch(`${API_BASE}/documents`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load documents");
  return res.json();
}

export async function uploadDocument(file, onProgress) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch(`${API_BASE}/documents/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  if (!res.ok) throw new Error((await res.json()).detail || "Upload failed");
  return res.json();
}

export async function deleteDocument(id) {
  const res = await fetch(`${API_BASE}/documents/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Delete failed");
  return res.json();
}

export async function fetchSessions() {
  const res = await fetch(`${API_BASE}/chat/sessions`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to load sessions");
  return res.json();
}

export async function fetchMessages(sessionId) {
  const res = await fetch(`${API_BASE}/chat/sessions/${sessionId}/messages`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to load messages");
  return res.json();
}

/**
 * Streams a chat answer via SSE. Calls onToken(text) for each chunk,
 * onCitations(list) once sources are known, and onDone() at the end.
 */
export async function streamQuery({ sessionId, message, documentIds, useWeb, onToken, onCitations, onSuggestions, onGroundedness, onSessionId, onDone, onError, signal }) {
  try {
    const res = await fetch(`${API_BASE}/chat/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ session_id: sessionId, message, document_ids: documentIds, use_web_search: !!useWeb }),
      signal,
    });

    if (!res.ok) throw new Error("Query failed");

    const newSessionId = res.headers.get("X-Session-Id");
    if (newSessionId && onSessionId) onSessionId(newSessionId);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop(); // keep incomplete chunk in buffer

      for (const evt of events) {
        if (!evt.trim()) continue;
        const eventMatch = evt.match(/^event: (.+)$/m);
        const dataMatch = evt.match(/^data: (.+)$/m);
        if (!eventMatch || !dataMatch) continue;

        const eventType = eventMatch[1].trim();
        const data = JSON.parse(dataMatch[1]);

        if (eventType === "token") onToken(data.text);
        else if (eventType === "citations") onCitations(data);
        else if (eventType === "suggestions") onSuggestions && onSuggestions(data);
        else if (eventType === "groundedness") onGroundedness && onGroundedness(data);
        else if (eventType === "done") onDone && onDone();
      }
    }
  } catch (err) {
    if (err.name === "AbortError") {
      onDone && onDone();
    } else {
      onError && onError(err);
    }
  }
}
