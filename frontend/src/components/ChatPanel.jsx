import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { streamQuery, shareSession } from "../api";
import Citations from "./Citations";

export default function ChatPanel({ sessionId, setSessionId, selectedDocIds, initialMessages, sessionTitle, pendingAsk }) {
  const [messages, setMessages] = useState(initialMessages || []);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState(null);
  const [useWeb, setUseWeb] = useState(() => localStorage.getItem("docchat-web-default") === "true");
  const [editingIdx, setEditingIdx] = useState(null);
  const [shareStatus, setShareStatus] = useState(""); // "" | "sharing" | "copied"
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
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  // targetIndex is fixed at call time so trailing events (groundedness,
  // suggestions) for THIS turn always land on the right message, even if
  // the user has already moved on to a new message by the time they arrive.
  function runStream(userText, targetIndex) {
    setStreaming(true);
    const controller = new AbortController();
    abortRef.current = controller;

    function patchMessage(patch) {
      setMessages((prev) => {
        if (targetIndex >= prev.length) return prev;
        const updated = [...prev];
        updated[targetIndex] = { ...updated[targetIndex], ...patch };
        return updated;
      });
    }

    streamQuery({
      sessionId,
      message: userText,
      documentIds: selectedDocIds.length ? selectedDocIds : null,
      useWeb,
      signal: controller.signal,
      onSessionId: (id) => {
        if (!sessionId) setSessionId(id);
      },
      onToken: (token) => {
        setMessages((prev) => {
          if (targetIndex >= prev.length) return prev;
          const updated = [...prev];
          updated[targetIndex] = { ...updated[targetIndex], content: (updated[targetIndex].content || "") + token };
          return updated;
        });
      },
      // Unlock the input as soon as the main answer + citations are ready -
      // like ChatGPT, you can start typing the next message immediately.
      // Groundedness/suggestions keep streaming in and patch this same
      // message a moment later without blocking anything.
      onCitations: (citations) => {
        patchMessage({ citations });
        setStreaming(false);
      },
      onSuggestions: (suggestions) => patchMessage({ suggestions }),
      onGroundedness: (groundedness) => patchMessage({ groundedness }),
      onDone: () => setStreaming(false),
      onError: () => setStreaming(false),
    });
  }

  async function handleSend(e, overrideText) {
    e?.preventDefault();
    const text = (overrideText ?? input).trim();
    if (!text || streaming) return;

    setInput("");
    requestAnimationFrame(autoResize);
    const targetIndex = messages.length + 1; // user goes at .length, assistant right after
    setMessages((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: "", citations: [], suggestions: [] }]);
    runStream(text, targetIndex);
  }

  function handleRegenerate(assistantIdx) {
    if (streaming) return;
    const userMsg = messages[assistantIdx - 1];
    if (!userMsg || userMsg.role !== "user") return;

    setMessages((prev) => {
      const updated = [...prev];
      updated[assistantIdx] = { role: "assistant", content: "", citations: [], suggestions: [] };
      return updated;
    });
    runStream(userMsg.content, assistantIdx);
  }

  function handleStartEdit(idx) {
    setEditingIdx(idx);
  }

  function handleSubmitEdit(idx, newText) {
    const text = newText.trim();
    setEditingIdx(null);
    if (!text || streaming) return;
    // Truncate everything from this message onward, then resend as a fresh turn.
    setMessages((prev) => [
      ...prev.slice(0, idx),
      { role: "user", content: text },
      { role: "assistant", content: "", citations: [], suggestions: [] },
    ]);
    runStream(text, idx + 1);
  }

  function handleSuggestionClick(text) {
    if (streaming) return;
    handleSend(null, text);
  }

  function handleStop() {
    abortRef.current?.abort();
    setStreaming(false);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleCopy(text, idx) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx((cur) => (cur === idx ? null : cur)), 1500);
    } catch {
      /* clipboard unavailable - ignore */
    }
  }

  function toggleWeb() {
    setUseWeb((v) => {
      localStorage.setItem("docchat-web-default", String(!v));
      return !v;
    });
  }

  async function handleShare() {
    if (!sessionId) return;
    setShareStatus("sharing");
    try {
      const url = await shareSession(sessionId);
      await navigator.clipboard.writeText(url);
      setShareStatus("copied");
      setTimeout(() => setShareStatus(""), 2000);
    } catch {
      setShareStatus("");
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-white dark:bg-gray-950">
      <div className="flex items-center justify-end px-4 py-2 border-b border-gray-100 dark:border-gray-800">
        <button
          onClick={handleShare}
          disabled={!sessionId || shareStatus === "sharing"}
          className="text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-brand-600 dark:hover:text-brand-400 disabled:opacity-40 flex items-center gap-1"
          title={sessionId ? "Copy a read-only share link" : "Send a message first"}
        >
          {shareStatus === "copied" ? "✓ Link copied" : shareStatus === "sharing" ? "Sharing…" : "🔗 Share"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 dark:text-gray-600 mt-24 px-6">
            <p className="text-lg font-medium">Ask me anything</p>
            <p className="text-sm mt-1">
              I'll use your uploaded documents and the live web when useful — or just my own
              knowledge if nothing else fits.
            </p>
          </div>
        )}

        {messages.map((m, i) => {
          const isLastAssistant = m.role === "assistant" && i === messages.length - 1 && !streaming && m.content;
          const isUser = m.role === "user";
          return (
            <div
              key={i}
              className={`group border-b border-gray-50 dark:border-gray-900 ${
                isUser ? "bg-white dark:bg-gray-950" : "bg-gray-50/70 dark:bg-gray-900/40"
              }`}
            >
              <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 flex gap-4">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 ${
                    isUser ? "bg-gray-700 dark:bg-gray-600 text-white" : "bg-brand-600 text-white"
                  }`}
                >
                  {isUser ? "🧑" : "🤖"}
                </div>

                <div className="flex-1 min-w-0 relative">
                  {isUser ? (
                    editingIdx === i ? (
                      <EditBox initialText={m.content} onSubmit={(t) => handleSubmitEdit(i, t)} onCancel={() => setEditingIdx(null)} />
                    ) : (
                      <p className="whitespace-pre-wrap text-[15px] leading-7 text-gray-800 dark:text-gray-100">{m.content}</p>
                    )
                  ) : (
                    <div className="prose prose-sm md:prose-base dark:prose-invert max-w-none leading-7">
                      <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
                    </div>
                  )}

                  {!isUser && <Citations citations={m.citations} />}
                  {!isUser && m.content && <GroundednessBadge groundedness={m.groundedness} />}

                  {!isUser && m.content && editingIdx !== i && (
                    <div className="mt-2 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={() => handleCopy(m.content, i)}
                        className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400"
                      >
                        {copiedIdx === i ? "Copied ✓" : "Copy"}
                      </button>
                      <button
                        onClick={() => handleRegenerate(i)}
                        disabled={streaming}
                        className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 disabled:opacity-40"
                      >
                        ↻ Regenerate
                      </button>
                      <SpeakButton text={m.content} />
                    </div>
                  )}

                  {isUser && editingIdx !== i && (
                    <button
                      onClick={() => handleStartEdit(i)}
                      className="mt-1 text-[11px] text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400 opacity-0 group-hover:opacity-100 transition"
                    >
                      ✎ Edit
                    </button>
                  )}

                  {isLastAssistant && m.suggestions && m.suggestions.length > 0 && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {m.suggestions.map((s, si) => (
                        <button
                          key={si}
                          onClick={() => handleSuggestionClick(s)}
                          className="text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-400 px-3 py-1.5 rounded-full transition"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4">
        <form onSubmit={handleSend} className="max-w-3xl mx-auto flex gap-2 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                autoResize();
              }}
              onKeyDown={handleKeyDown}
              placeholder="Message DocChat… (Shift+Enter for new line)"
              className="w-full resize-none border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-2xl pl-4 pr-11 py-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-brand-500 max-h-40"
            />
            <button
              type="button"
              onClick={toggleWeb}
              title={useWeb ? "Web search on for this chat" : "Web search off — click to enable"}
              className={`absolute right-2.5 bottom-2.5 w-7 h-7 rounded-full flex items-center justify-center text-sm transition ${
                useWeb
                  ? "bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-400"
                  : "text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400"
              }`}
            >
              🌐
            </button>
          </div>
          <VoiceInputButton
            disabled={streaming}
            onResult={(transcript) => {
              setInput((prev) => (prev ? prev + " " + transcript : transcript));
              requestAnimationFrame(autoResize);
            }}
          />
          {streaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-2xl text-sm font-medium shrink-0"
            >
              ■ Stop
            </button>
          ) : (
            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 text-white px-5 py-3 rounded-2xl text-sm font-medium shrink-0"
            >
              Send
            </button>
          )}
        </form>
        <p className="max-w-3xl mx-auto text-center text-[11px] text-gray-400 dark:text-gray-600 mt-2">
          {useWeb ? "🌐 Web search is on for this chat." : "Answers auto-search the web when your documents don't cover the question."}
        </p>
      </div>
    </div>
  );
}

function EditBox({ initialText, onSubmit, onCancel }) {
  const [text, setText] = useState(initialText);
  return (
    <div className="space-y-2">
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSubmit(text);
          }
          if (e.key === "Escape") onCancel();
        }}
        className="w-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-lg px-3 py-2 text-sm outline-none resize-none focus:ring-2 focus:ring-brand-500"
        rows={2}
      />
      <div className="flex gap-2">
        <button onClick={() => onSubmit(text)} className="text-xs bg-brand-600 hover:bg-brand-700 text-white px-3 py-1 rounded-lg">
          Save & resend
        </button>
        <button onClick={onCancel} className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          Cancel
        </button>
      </div>
    </div>
  );
}

function GroundednessBadge({ groundedness }) {
  if (!groundedness || groundedness.score === undefined) return null;
  const { score, note } = groundedness;

  if (score < 0) {
    return (
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-gray-500" title={note}>
        <span>💭</span>
        <span>General knowledge (no sources)</span>
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

function SpeakButton({ text }) {
  const [speaking, setSpeaking] = useState(false);

  function stripMarkdown(md) {
    return md
      .replace(/\[\d+\]/g, "")
      .replace(/[*_#`>]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\s+/g, " ")
      .trim();
  }

  function handleClick() {
    if (!("speechSynthesis" in window)) {
      alert("Voice output isn't supported in this browser.");
      return;
    }
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(stripMarkdown(text));
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }

  return (
    <button
      onClick={handleClick}
      className="text-[11px] text-gray-400 dark:text-gray-500 hover:text-brand-600 dark:hover:text-brand-400"
    >
      {speaking ? "⏹ Stop" : "🔊 Listen"}
    </button>
  );
}

function VoiceInputButton({ onResult, disabled }) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  function handleClick() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input isn't supported in this browser. Try Chrome or Edge.");
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title={listening ? "Listening… click to stop" : "Voice input"}
      className={`w-11 h-11 shrink-0 rounded-2xl border flex items-center justify-center text-lg transition disabled:opacity-40 ${
        listening
          ? "bg-red-50 dark:bg-red-500/10 border-red-300 dark:border-red-700 animate-pulse"
          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 hover:border-brand-400"
      }`}
    >
      {listening ? "🔴" : "🎤"}
    </button>
  );
}
