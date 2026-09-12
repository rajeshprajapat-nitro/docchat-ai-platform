export const API_BASE =
    import.meta.env.VITE_API_BASE || "http://localhost:8000";



/* =========================================================
   Authentication Headers
   ========================================================= */

function authHeaders() {
    const token = localStorage.getItem("token");

    return token ? {
        Authorization: `Bearer ${token}`,
    } : {};
}

export async function fetchGeneratedImage(imageUrl) {
    const url =
        imageUrl.startsWith("http://") ||
        imageUrl.startsWith("https://") ?
        imageUrl :
        `${API_BASE.replace(/\/$/, "")}/${imageUrl.replace(
                  /^\//,
                  ""
              )}`;

    const res = await fetch(url, {
        headers: {
            ...authHeaders(),
        },
    });

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));

        throw new Error(
            data.detail ||
            data.message ||
            "Unable to load generated image."
        );
    }

    const blob = await res.blob();

    return URL.createObjectURL(blob);
}


/* =========================================================
   Document Preview URL
   ========================================================= */

export function getPreviewUrl(documentId) {
    const token = localStorage.getItem("token");

    return `${API_BASE}/documents/${documentId}/file?token=${encodeURIComponent(
        token || ""
    )}`;
}


/* =========================================================
   Export Chat as Markdown
   ========================================================= */

export function exportChatAsMarkdown(messages, title = "chat") {
    const lines = [`# ${title}`, ""];

    for (const m of messages) {
        const speaker =
            m.role === "user" ?
            "**You**" :
            "**Assistant**";

        lines.push(`${speaker}: ${m.content}`);

        if (m.citations && m.citations.length) {
            lines.push("");
            lines.push("Sources:");

            m.citations.forEach((c, i) => {
                        lines.push(
                                `${i + 1}. ${c.filename}${
                        c.page ? ` (p.${c.page})` : ""
                    }`
                );
            });
        }

        lines.push("");
    }

    const blob = new Blob(
        [lines.join("\n")],
        {
            type: "text/markdown",
        }
    );

    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");

    a.href = url;

    a.download =
        `${title
            .replace(/[^a-z0-9]+/gi, "_")
            .toLowerCase() || "chat"}.md`;

    document.body.appendChild(a);

    a.click();

    document.body.removeChild(a);

    URL.revokeObjectURL(url);
}


/* =========================================================
   Analytics
   ========================================================= */

export async function fetchAnalytics() {
    const res = await fetch(
        `${API_BASE}/analytics/summary`,
        {
            headers: authHeaders(),
        }
    );

    if (!res.ok) {
        throw new Error("Failed to load analytics");
    }

    return res.json();
}


/* =========================================================
   Current User
   ========================================================= */

export async function fetchMe() {
    const res = await fetch(
        `${API_BASE}/auth/me`,
        {
            headers: authHeaders(),
        }
    );

    if (!res.ok) {
        throw new Error("Failed to load profile");
    }

    return res.json();
}


/* =========================================================
   Update Profile
   ========================================================= */

export async function updateProfile(full_name) {
    const res = await fetch(
        `${API_BASE}/auth/me`,
        {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                ...authHeaders(),
            },
            body: JSON.stringify({
                full_name,
            }),
        }
    );

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));

        throw new Error(
            data.detail || "Update failed"
        );
    }

    return res.json();
}


/* =========================================================
   Change Password
   ========================================================= */

export async function changePassword(
    current_password,
    new_password
) {
    const res = await fetch(
        `${API_BASE}/auth/change-password`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...authHeaders(),
            },
            body: JSON.stringify({
                current_password,
                new_password,
            }),
        }
    );

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));

        throw new Error(
            data.detail || "Password change failed"
        );
    }

    return res.json();
}


/* =========================================================
   Rename Chat Session
   ========================================================= */

export async function renameSession(id, title) {
    const res = await fetch(
        `${API_BASE}/chat/sessions/${id}`,
        {
            method: "PATCH",
            headers: {
                "Content-Type": "application/json",
                ...authHeaders(),
            },
            body: JSON.stringify({
                title,
            }),
        }
    );

    if (!res.ok) {
        throw new Error("Rename failed");
    }

    return res.json();
}


/* =========================================================
   Delete Chat Session
   ========================================================= */

export async function deleteSession(id) {
    const res = await fetch(
        `${API_BASE}/chat/sessions/${id}`,
        {
            method: "DELETE",
            headers: authHeaders(),
        }
    );

    if (!res.ok) {
        throw new Error("Delete failed");
    }

    return res.json();
}


/* =========================================================
   Share Chat Session
   ========================================================= */

export async function shareSession(id) {
    const res = await fetch(
        `${API_BASE}/chat/sessions/${id}/share`,
        {
            method: "POST",
            headers: authHeaders(),
        }
    );

    if (!res.ok) {
        throw new Error(
            "Failed to create share link"
        );
    }

    const data = await res.json();

    return `${window.location.origin}/share/${data.token}`;
}


/* =========================================================
   Fetch Shared Chat
   ========================================================= */

export async function fetchSharedChat(token) {
    const res = await fetch(
        `${API_BASE}/chat/share/${token}`
    );

    if (!res.ok) {
        throw new Error(
            "Shared chat not found"
        );
    }

    return res.json();
}


/* =========================================================
   Signup
   ========================================================= */

export async function signup(
    email,
    password,
    full_name
) {
    const res = await fetch(
        `${API_BASE}/auth/signup`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                email,
                password,
                full_name,
            }),
        }
    );

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));

        throw new Error(
            data.detail || "Signup failed"
        );
    }

    return res.json();
}


/* =========================================================
   Login
   ========================================================= */

export async function login(
    email,
    password
) {
    const res = await fetch(
        `${API_BASE}/auth/login`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                email,
                password,
            }),
        }
    );

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));

        throw new Error(
            data.detail || "Login failed"
        );
    }

    return res.json();
}


/* =========================================================
   Forgot Password
   ========================================================= */

export async function forgotPassword(email) {
    const res = await fetch(
        `${API_BASE}/auth/forgot-password`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                email,
            }),
        }
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new Error(
            data.detail ||
                "Unable to send password reset email"
        );
    }

    return data;
}


/* =========================================================
   Reset Password
   ========================================================= */

export async function resetPassword(
    token,
    newPassword
) {
    const res = await fetch(
        `${API_BASE}/auth/reset-password`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                token,
                new_password: newPassword,
            }),
        }
    );

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
        throw new Error(
            data.detail ||
                "Unable to reset password"
        );
    }

    return data;
}


/* =========================================================
   Fetch Documents
   ========================================================= */

export async function fetchDocuments() {
    const res = await fetch(
        `${API_BASE}/documents`,
        {
            headers: authHeaders(),
        }
    );

    if (!res.ok) {
        throw new Error(
            "Failed to load documents"
        );
    }

    return res.json();
}


/* =========================================================
   Upload Document
   ========================================================= */

export async function uploadDocument(
    file,
    onProgress
) {
    const formData = new FormData();

    formData.append("file", file);

    const res = await fetch(
        `${API_BASE}/documents/upload`,
        {
            method: "POST",
            headers: authHeaders(),
            body: formData,
        }
    );

    if (!res.ok) {
        const data = await res.json().catch(() => ({}));

        throw new Error(
            data.detail || "Upload failed"
        );
    }

    return res.json();
}


/* =========================================================
   Delete Document
   ========================================================= */

export async function deleteDocument(id) {
    const res = await fetch(
        `${API_BASE}/documents/${id}`,
        {
            method: "DELETE",
            headers: authHeaders(),
        }
    );

    if (!res.ok) {
        throw new Error("Delete failed");
    }

    return res.json();
}


/* =========================================================
   Fetch Chat Sessions
   ========================================================= */

export async function fetchSessions() {
    const res = await fetch(
        `${API_BASE}/chat/sessions`,
        {
            headers: authHeaders(),
        }
    );

    if (!res.ok) {
        throw new Error(
            "Failed to load sessions"
        );
    }

    return res.json();
}


/* =========================================================
   Fetch Chat Messages
   ========================================================= */

export async function fetchMessages(sessionId) {
    const res = await fetch(
        `${API_BASE}/chat/sessions/${sessionId}/messages`,
        {
            headers: authHeaders(),
        }
    );

    if (!res.ok) {
        throw new Error(
            "Failed to load messages"
        );
    }

    return res.json();
}


/* =========================================================
   Stream Chat Query
   ========================================================= */

export async function streamQuery({
    sessionId,
    message,
    documentIds,
    useWeb,
    onToken,
    onCitations,
    onSuggestions,
    onGroundedness,
    onSessionId,
    onDone,
    onError,
    signal,
}) {
    try {
        const res = await fetch(
            `${API_BASE}/chat/query`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...authHeaders(),
                },
                body: JSON.stringify({
                    session_id: sessionId,
                    message,
                    document_ids: documentIds,
                    use_web_search: !!useWeb,
                }),
                signal,
            }
        );


        /* =====================================================
           HTTP Errors
           ===================================================== */

        if (!res.ok) {
            let errorMessage =
                `Request failed (${res.status})`;

            try {
                const errorText =
                    await res.text();

                if (errorText) {
                    try {
                        const errorData =
                            JSON.parse(errorText);

                        errorMessage =
                            errorData.detail ||
                            errorData.message ||
                            errorData.error ||
                            errorText;
                    } catch {
                        errorMessage =
                            errorText;
                    }
                }
            } catch {
                // Keep default error
            }

            throw new Error(errorMessage);
        }


        /* =====================================================
           Session ID
           ===================================================== */

        const newSessionId =
            res.headers.get("X-Session-Id");

        if (
            newSessionId &&
            onSessionId
        ) {
            onSessionId(newSessionId);
        }


        /* =====================================================
           Response Body
           ===================================================== */

        if (!res.body) {
            throw new Error(
                "Empty response from server"
            );
        }

        const reader =
            res.body.getReader();

        const decoder =
            new TextDecoder();

        let buffer = "";


        /* =====================================================
           SSE Stream
           ===================================================== */

        while (true) {
            const {
                value,
                done,
            } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(
                value,
                {
                    stream: true,
                }
            );

            const events =
                buffer.split("\n\n");

            buffer =
                events.pop() || "";


            for (const evt of events) {
                if (!evt.trim()) {
                    continue;
                }

                const eventMatch =
                    evt.match(
                        /^event:\s*(.+)$/m
                    );

                const dataMatch =
                    evt.match(
                        /^data:\s*(.+)$/m
                    );

                if (
                    !eventMatch ||
                    !dataMatch
                ) {
                    continue;
                }

                const eventType =
                    eventMatch[1].trim();

                let data;


                /* =================================================
                   Parse SSE JSON
                   ================================================= */

                try {
                    data = JSON.parse(
                        dataMatch[1]
                    );
                } catch {
                    data =
                        dataMatch[1];
                }


                /* =================================================
                   TOKEN
                   ================================================= */

                if (
                    eventType === "token"
                ) {
                    if (onToken) {
                        onToken(
                            data?.text || ""
                        );
                    }
                }


                /* =================================================
                   CITATIONS
                   ================================================= */

                else if (
                    eventType === "citations"
                ) {
                    if (onCitations) {
                        onCitations(data);
                    }
                }


                /* =================================================
                   SUGGESTIONS
                   ================================================= */

                else if (
                    eventType === "suggestions"
                ) {
                    if (onSuggestions) {
                        onSuggestions(data);
                    }
                }


                /* =================================================
                   GROUNDEDNESS
                   ================================================= */

                else if (
                    eventType === "groundedness"
                ) {
                    if (onGroundedness) {
                        onGroundedness(data);
                    }
                }


                /* =================================================
                   BACKEND ERROR
                   ================================================= */

                else if (
                    eventType === "error"
                ) {
                    const errorMessage =
                        typeof data === "string"
                            ? data
                            : data?.detail ||
                              data?.message ||
                              data?.error ||
                              "AI service temporarily unavailable";

                    throw new Error(
                        errorMessage
                    );
                }


                /* =================================================
                   DONE
                   ================================================= */

                else if (
                    eventType === "done"
                ) {
                    if (onDone) {
                        onDone();
                    }
                }
            }
        }
    } catch (err) {

        /* =======================================================
           User Cancelled Request
           ======================================================= */

        if (
            err.name === "AbortError"
        ) {
            if (onDone) {
                onDone();
            }

            return;
        }


        /* =======================================================
           Forward Real Error
           ======================================================= */

        console.error(
            "[streamQuery]",
            err
        );

        if (onError) {
            onError(err);
        }
    }
}

/* =========================================================
   Image Generation
   ========================================================= */

export async function generateImage(
    prompt,
    sessionId = null
) {
    const res = await fetch(
        `${API_BASE}/images/generate`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...authHeaders(),
            },
            body: JSON.stringify({
                prompt,
                session_id: sessionId,
            }),
        }
    );

    const data = await res.json().catch(
        () => ({})
    );

    if (!res.ok) {
        throw new Error(
            data.detail ||
            data.message ||
            "Image generation failed"
        );
    }

    return data;
}