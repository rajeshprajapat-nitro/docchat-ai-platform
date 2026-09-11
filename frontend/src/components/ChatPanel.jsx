import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

import { streamQuery, shareSession } from "../api";
import Citations from "./Citations";

export default function ChatPanel({
  sessionId,
  setSessionId,
  selectedDocIds,
  initialMessages,
  sessionTitle,
  pendingAsk,
}) {
  const [messages, setMessages] = useState(initialMessages || []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);

  const [useWeb, setUseWeb] = useState(
    () => localStorage.getItem("docchat-web-default") === "true"
  );

  const [editingIdx, setEditingIdx] = useState(null);
  const [shareStatus, setShareStatus] = useState("");

  // AI unavailable / retry
  const [aiUnavailable, setAiUnavailable] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(45);
  const [failedRequest, setFailedRequest] = useState(null);

  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    setMessages(initialMessages || []);
    setShareStatus("");
  }, [initialMessages]);

  useEffect(() => {
    if (pendingAsk?.text) {
      handleSend(null, pendingAsk.text);
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAsk?.key]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  // -----------------------------------------
  // AI unavailable countdown
  // -----------------------------------------
  useEffect(() => {
    if (!aiUnavailable || retryCountdown <= 0) {
      return;
    }

    const timer = setInterval(() => {
      setRetryCountdown((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [aiUnavailable, retryCountdown]);

  // -----------------------------------------
  // Auto resize textarea
  // -----------------------------------------
  function autoResize() {
    const el = textareaRef.current;

    if (!el) return;

    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  // -----------------------------------------
  // Detect AI rate-limit / quota errors
  // -----------------------------------------
  function isAIUnavailableError(error) {
    const message =
      typeof error === "string"
        ? error
        : error?.message || "";

    const lowerMessage = message.toLowerCase();

    return (
      lowerMessage.includes(
        "ai model is temporarily unavailable"
      ) ||
      lowerMessage.includes("all configured key") ||
      lowerMessage.includes("rate-limit") ||
      lowerMessage.includes("rate limit") ||
      lowerMessage.includes("rate_limit") ||
      lowerMessage.includes("quota") ||
      lowerMessage.includes("resource exhausted") ||
      lowerMessage.includes("resource_exhausted") ||
      lowerMessage.includes("too many requests") ||
      lowerMessage.includes("429") ||
      lowerMessage.includes("temporarily unavailable")
    );
  }

  // -----------------------------------------
  // Show unavailable card
  // -----------------------------------------
  function showAIUnavailable(userText, targetIndex) {
    setAiUnavailable(true);
    setRetryCountdown(45);

    setFailedRequest({
      text: userText,
      targetIndex,
    });
  }

  // -----------------------------------------
  // Hide unavailable card
  // -----------------------------------------
  function hideAIUnavailable() {
    setAiUnavailable(false);
    setRetryCountdown(45);
  }

  // -----------------------------------------
  // Stream AI response
  // -----------------------------------------
  function runStream(userText, targetIndex) {
    setStreaming(true);

    hideAIUnavailable();

    const controller = new AbortController();
    abortRef.current = controller;

    function patchMessage(patch) {
      setMessages((prev) => {
        if (targetIndex >= prev.length) {
          return prev;
        }

        const updated = [...prev];

        updated[targetIndex] = {
          ...updated[targetIndex],
          ...patch,
        };

        return updated;
      });
    }

    streamQuery({
      sessionId,
      message: userText,
      documentIds: selectedDocIds?.length
        ? selectedDocIds
        : null,
      useWeb,
      signal: controller.signal,

      // -----------------------------------------
      // Session ID
      // -----------------------------------------
      onSessionId: (id) => {
        if (!sessionId) {
          setSessionId(id);
        }
      },

      // -----------------------------------------
      // Token
      // -----------------------------------------
      onToken: (token) => {
        setMessages((prev) => {
          if (targetIndex >= prev.length) {
            return prev;
          }

          const updated = [...prev];

          updated[targetIndex] = {
            ...updated[targetIndex],
            content:
              (updated[targetIndex].content || "") +
              token,
          };

          return updated;
        });
      },

      // -----------------------------------------
      // Citations
      // -----------------------------------------
      onCitations: (citations) => {
        patchMessage({
          citations,
        });
      },

      // -----------------------------------------
      // Suggestions
      // -----------------------------------------
      onSuggestions: (suggestions) => {
        patchMessage({
          suggestions,
        });
      },

      // -----------------------------------------
      // Groundedness
      // -----------------------------------------
      onGroundedness: (groundedness) => {
        patchMessage({
          groundedness,
        });
      },

      // -----------------------------------------
      // Done
      // -----------------------------------------
      onDone: () => {
        setStreaming(false);
        abortRef.current = null;
      },

      // -----------------------------------------
      // Error
      // -----------------------------------------
      onError: (error) => {
        setStreaming(false);
        abortRef.current = null;

        console.error(
          "[DocChat] Stream error:",
          error
        );

        if (isAIUnavailableError(error)) {
          showAIUnavailable(
            userText,
            targetIndex
          );
        }
      },
    });
  }

  // -----------------------------------------
  // Send message
  // -----------------------------------------
  async function handleSend(e, overrideText) {
    e?.preventDefault();

    const text = (overrideText ?? input).trim();

    if (!text || streaming) {
      return;
    }

    hideAIUnavailable();
    setFailedRequest(null);

    setInput("");

    requestAnimationFrame(autoResize);

    const targetIndex = messages.length + 1;

    setMessages((prev) => [
      ...prev,
      {
        role: "user",
        content: text,
      },
      {
        role: "assistant",
        content: "",
        citations: [],
        suggestions: [],
      },
    ]);

    runStream(text, targetIndex);
  }

  // -----------------------------------------
  // Retry failed AI request
  // -----------------------------------------
  function handleRetry() {
    if (streaming || !failedRequest) {
      return;
    }

    const {
      text,
      targetIndex,
    } = failedRequest;

    hideAIUnavailable();

    // Clear the previous failed assistant response
    setMessages((prev) => {
      if (targetIndex >= prev.length) {
        return prev;
      }

      const updated = [...prev];

      updated[targetIndex] = {
        role: "assistant",
        content: "",
        citations: [],
        suggestions: [],
      };

      return updated;
    });

    runStream(text, targetIndex);
  }

  // -----------------------------------------
  // Regenerate response
  // -----------------------------------------
  function handleRegenerate(assistantIdx) {
    if (streaming) {
      return;
    }

    const userMsg = messages[assistantIdx - 1];

    if (!userMsg || userMsg.role !== "user") {
      return;
    }

    hideAIUnavailable();
    setFailedRequest(null);

    setMessages((prev) => {
      const updated = [...prev];

      updated[assistantIdx] = {
        role: "assistant",
        content: "",
        citations: [],
        suggestions: [],
      };

      return updated;
    });

    runStream(
      userMsg.content,
      assistantIdx
    );
  }

  // -----------------------------------------
  // Edit user message
  // -----------------------------------------
  function handleStartEdit(idx) {
    setEditingIdx(idx);
  }

  function handleSubmitEdit(idx, newText) {
    const text = newText.trim();

    setEditingIdx(null);

    if (!text || streaming) {
      return;
    }

    hideAIUnavailable();
    setFailedRequest(null);

    setMessages((prev) => [
      ...prev.slice(0, idx),
      {
        role: "user",
        content: text,
      },
      {
        role: "assistant",
        content: "",
        citations: [],
        suggestions: [],
      },
    ]);

    runStream(text, idx + 1);
  }

  // -----------------------------------------
  // Suggestion click
  // -----------------------------------------
  function handleSuggestionClick(text) {
    if (streaming) {
      return;
    }

    handleSend(null, text);
  }

  // -----------------------------------------
  // Stop streaming
  // -----------------------------------------
  function handleStop() {
    abortRef.current?.abort();

    setStreaming(false);
    abortRef.current = null;
  }

  // -----------------------------------------
  // Keyboard
  // -----------------------------------------
  function handleKeyDown(e) {
    if (
      e.key === "Enter" &&
      !e.shiftKey
    ) {
      e.preventDefault();
      handleSend();
    }
  }

  // -----------------------------------------
  // Copy
  // -----------------------------------------
  async function handleCopy(text, idx) {
    try {
      await navigator.clipboard.writeText(text);

      setCopiedIdx(idx);

      setTimeout(() => {
        setCopiedIdx((cur) =>
          cur === idx ? null : cur
        );
      }, 1500);
    } catch {
      // Clipboard unavailable
    }
  }

  // -----------------------------------------
  // Web toggle
  // -----------------------------------------
  function toggleWeb() {
    setUseWeb((v) => {
      localStorage.setItem(
        "docchat-web-default",
        String(!v)
      );

      return !v;
    });
  }

  // -----------------------------------------
  // Share
  // -----------------------------------------
  async function handleShare() {
    if (!sessionId) {
      return;
    }

    setShareStatus("sharing");

    try {
      const url = await shareSession(
        sessionId
      );

      await navigator.clipboard.writeText(url);

      setShareStatus("copied");

      setTimeout(() => {
        setShareStatus("");
      }, 2000);
    } catch {
      setShareStatus("");
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-gray-950 min-w-0">

      {/* Top bar */}
      <div className="flex items-center justify-end px-3 sm:px-4 py-2 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <button
          onClick={handleShare}
          disabled={
            !sessionId ||
            shareStatus === "sharing"
          }
          className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 disabled:opacity-40 flex items-center gap-1"
          title={
            sessionId
              ? "Copy a read-only share link"
              : "Send a message first"
          }
        >
          {shareStatus === "copied"
            ? "✓ Link copied"
            : shareStatus === "sharing"
            ? "Sharing…"
            : "🔗 Share"}
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto scrollbar-thin min-w-0">

        {messages.length === 0 && (
          <div className="text-center text-gray-400 dark:text-gray-600 mt-20 sm:mt-24 px-5">
            <p className="text-lg font-medium">
              Ask me anything
            </p>

            <p className="text-sm mt-1 leading-6 max-w-md mx-auto">
              I'll use your uploaded documents
              and the live web when useful —
              or just my own knowledge if nothing
              else fits.
            </p>
          </div>
        )}

        {messages.map((m, i) => {
          const isLastAssistant =
            m.role === "assistant" &&
            i === messages.length - 1 &&
            !streaming &&
            m.content;

          const isUser = m.role === "user";

          return (
            <div
              key={i}
              className={`group border-b border-gray-50 dark:border-gray-900 ${
                isUser
                  ? "bg-white dark:bg-gray-950"
                  : "bg-gray-50/70 dark:bg-gray-900/40"
              }`}
            >

              {/* Message container */}
              <div className="w-full max-w-3xl mx-auto px-3 sm:px-4 md:px-6 py-4 sm:py-6 flex gap-3 sm:gap-4">

                {/* Avatar */}
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 ${
                    isUser
                      ? "bg-gray-700 dark:bg-gray-600 text-white"
                      : "bg-brand-600 text-white"
                  }`}
                >
 {isUser ? (
  <img
    src="/user-icon.png"
    alt="User"
   className="w-full h-full object-cover scale-[1.35]"
  />
) : (
  <img
    src="/logo-icon.png"
    alt="AI"
     className="w-full h-full object-cover scale-[1.35]"
  />
)}
                </div>

                {/* Message content */}
                <div className="flex-1 min-w-0 relative overflow-hidden">

                  {isUser ? (
                    editingIdx === i ? (
                      <EditBox
                        initialText={m.content}
                        onSubmit={(t) =>
                          handleSubmitEdit(i, t)
                        }
                        onCancel={() =>
                          setEditingIdx(null)
                        }
                      />
                    ) : (
                      <p className="whitespace-pre-wrap break-words text-[15px] leading-7 text-gray-800 dark:text-gray-100">
                        {m.content}
                      </p>
                    )
                  ) : (
                    <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none leading-7 text-left break-words overflow-hidden">
                      <ReactMarkdown>
                        {m.content || "…"}
                      </ReactMarkdown>
                    </div>
                  )}

                  {/* Citations */}
                  {!isUser && (
                    <Citations
                      citations={m.citations}
                    />
                  )}

                  {/* Groundedness */}
                  {!isUser && m.content && (
                    <GroundednessBadge
                      groundedness={
                        m.groundedness
                      }
                    />
                  )}

                  {/* Assistant actions */}
                  {!isUser &&
                    m.content &&
                    editingIdx !== i && (
                      <div className="mt-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition">

                        <button
                          onClick={() =>
                            handleCopy(
                              m.content,
                              i
                            )
                          }
                          className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400"
                        >
                          {copiedIdx === i
                            ? "Copied ✓"
                            : "Copy"}
                        </button>

                        <button
                          onClick={() =>
                            handleRegenerate(i)
                          }
                          disabled={streaming}
                          className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 disabled:opacity-40"
                        >
                          ↻ Regenerate
                        </button>

                        <SpeakButton
                          text={m.content}
                        />
                      </div>
                    )}

                  {/* User edit */}
                  {isUser &&
                    editingIdx !== i && (
                      <button
                        onClick={() =>
                          handleStartEdit(i)
                        }
                        className="mt-1 text-[11px] text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 opacity-0 group-hover:opacity-100 transition"
                      >
                        ✎ Edit
                      </button>
                    )}

                  {/* Suggestions */}
                  {isLastAssistant &&
                    m.suggestions &&
                    m.suggestions.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {m.suggestions.map(
                          (s, si) => (
                            <button
                              key={si}
                              onClick={() =>
                                handleSuggestionClick(
                                  s
                                )
                              }
                              className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 px-3 py-1.5 rounded-full transition"
                            >
                              {s}
                            </button>
                          )
                        )}
                      </div>
                    )}
                </div>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* =========================================
          AI UNAVAILABLE CARD
          ========================================= */}
      {aiUnavailable && (
        <div className="w-full max-w-3xl mx-auto px-3 pb-3 shrink-0">

          <div className="rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-500/10 p-4 sm:p-5 text-center">

            <div className="text-2xl mb-2">
              🤖
            </div>

            <h3 className="text-sm sm:text-base font-semibold text-gray-800 dark:text-gray-100">
              AI is taking a short break
            </h3>

            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-md mx-auto">
              The AI service is temporarily
              rate-limited. Please wait a moment
              and try again.
            </p>

            {/* Countdown */}
            {retryCountdown > 0 ? (
              <div className="mt-3 inline-flex items-center gap-2 text-xs sm:text-sm font-medium text-brand-600 dark:text-brand-400">
                <span>⏳</span>

                <span>
                  Try again in{" "}
                  <strong>
                    {retryCountdown}s
                  </strong>
                </span>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleRetry}
                disabled={
                  streaming ||
                  !failedRequest
                }
                className="mt-3 px-4 py-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ↻ Retry Now
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom composer */}
      <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2.5 sm:p-4 shrink-0">

        <form
          onSubmit={handleSend}
          className="w-full max-w-3xl mx-auto flex items-center gap-2"
        >

          {/* Text input */}
          <div className="flex-1 relative min-w-0">

            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoResize();
              }}
              onKeyDown={handleKeyDown}
              placeholder="Message DocChat…"
              className="w-full resize-none border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-xl sm:rounded-2xl pl-3 sm:pl-4 pr-10 sm:pr-11 py-2.5 sm:py-3 text-[14px] sm:text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-500 max-h-40"
            />

            {/* Web toggle */}
            <button
              type="button"
              onClick={toggleWeb}
              title={
                useWeb
                  ? "Web search on for this chat"
                  : "Web search off — click to enable"
              }
              className={`absolute right-2 bottom-2 w-7 h-7 rounded-full flex items-center justify-center text-sm transition ${
                useWeb
                  ? "bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-400"
                  : "text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400"
              }`}
            >
              🌐
            </button>
          </div>

          {/* Voice input */}
          <VoiceInputButton
            disabled={streaming}
            onResult={(transcript) => {
              setInput((prev) =>
                prev
                  ? prev + " " + transcript
                  : transcript
              );

              requestAnimationFrame(
                autoResize
              );
            }}
          />

          {/* Send / Stop */}
          {streaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="shrink-0 h-10 sm:h-11 px-3.5 sm:px-5 bg-red-600 hover:bg-red-700 text-white rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium flex items-center justify-center"
            >
              ■

              <span className="hidden sm:inline ml-1">
                Stop
              </span>
            </button>
          ) : (
            <button
              type="submit"
              className="shrink-0 h-10 sm:h-11 px-3.5 sm:px-5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl sm:rounded-2xl text-xs sm:text-sm font-medium flex items-center justify-center"
            >
              Send
            </button>
          )}
        </form>

        <p className="max-w-3xl mx-auto text-center text-[10px] sm:text-[11px] text-gray-400 dark:text-gray-600 mt-1.5 sm:mt-2 px-2">
          {useWeb
            ? "🌐 Web search is on for this chat."
            : "Answers auto-search the web when your documents don't cover the question."}
        </p>
      </div>
    </div>
  );
}

// =====================================================
// EDIT BOX
// =====================================================

function EditBox({
  initialText,
  onSubmit,
  onCancel,
}) {
  const [text, setText] =
    useState(initialText);

  return (
    <div className="space-y-2">

      <textarea
        autoFocus
        value={text}
        onChange={(e) =>
          setText(e.target.value)
        }
        onKeyDown={(e) => {
          if (
            e.key === "Enter" &&
            !e.shiftKey
          ) {
            e.preventDefault();
            onSubmit(text);
          }

          if (e.key === "Escape") {
            onCancel();
          }
        }}
        className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-brand-500"
        rows={2}
      />

      <div className="flex gap-2">

        <button
          type="button"
          onClick={() =>
            onSubmit(text)
          }
          className="text-xs bg-brand-600 hover:bg-brand-700 text-white px-3 py-1 rounded-lg"
        >
          Save & resend
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          Cancel
        </button>

      </div>
    </div>
  );
}

// =====================================================
// GROUNDEDNESS BADGE
// =====================================================

function GroundednessBadge({
  groundedness,
}) {
  if (
    !groundedness ||
    groundedness.score === undefined
  ) {
    return null;
  }

  const {
    score,
    note,
  } = groundedness;

  if (score < 0) {
    return (
      <div
        className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500"
        title={note}
      >
        <span>💭</span>
        <span>
          General knowledge (no sources)
        </span>
      </div>
    );
  }

  const tone =
    score >= 75
      ? "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-800"
      : score >= 40
      ? "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-800"
      : "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-800";

  return (
    <div
      title={note}
      className={`mt-2 inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${tone}`}
    >
      🎯 {score}% grounded in sources
    </div>
  );
}

// =====================================================
// SPEAK BUTTON
// =====================================================

function SpeakButton({ text }) {
  const [speaking, setSpeaking] =
    useState(false);

  function stripMarkdown(md) {
    return md
      .replace(/\[\d+\]/g, "")
      .replace(/[*_#`>]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  function handleClick() {
    if (
      !("speechSynthesis" in window)
    ) {
      alert(
        "Voice output isn't supported in this browser."
      );

      return;
    }

    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const utterance =
      new SpeechSynthesisUtterance(
        stripMarkdown(text)
      );

    utterance.onend = () =>
      setSpeaking(false);

    utterance.onerror = () =>
      setSpeaking(false);

    window.speechSynthesis.cancel();

    window.speechSynthesis.speak(
      utterance
    );

    setSpeaking(true);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400"
    >
      {speaking
        ? "⏹ Stop"
        : "🔊 Listen"}
    </button>
  );
}

// =====================================================
// VOICE INPUT BUTTON
// =====================================================

function VoiceInputButton({
  onResult,
  disabled,
}) {
  const [listening, setListening] =
    useState(false);

  const recognitionRef =
    useRef(null);

  function handleClick() {
    const SpeechRecognition =
      window.SpeechRecognition ||
      window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert(
        "Voice input isn't supported in this browser. Try Chrome or Edge."
      );

      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition =
      new SpeechRecognition();

    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () =>
      setListening(true);

    recognition.onend = () =>
      setListening(false);

    recognition.onerror = () =>
      setListening(false);

    recognition.onresult = (event) => {
      const transcript =
        event.results[0][0]
          .transcript;

      onResult(transcript);
    };

    recognitionRef.current =
      recognition;

    recognition.start();
  }

return (
  <button
    type="button"
    onClick={handleClick}
    disabled={disabled}
    title={
      listening
        ? "Listening… click to stop"
        : "Voice input"
    }
    className={`w-10 h-10 sm:w-11 sm:h-11 shrink-0
      rounded-xl sm:rounded-2xl
      border flex items-center justify-center
      transition-all duration-200
      disabled:opacity-40
      ${
        listening
          ? "bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-700 animate-pulse"
          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-brand-400 hover:scale-105"
      }
    `}
  >
    <img
      src={
        listening
          ? "/microphone-listening.png"
          : "/microphone-icon.png"
      }
      alt={listening ? "Listening" : "Voice input"}
      className={`w-8 h-8 sm:w-9 sm:h-9 object-contain
        transition-transform duration-200
        ${listening ? "scale-110" : ""}
      `}
    />
  </button>
  );
}