import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { fetchSharedChat } from "../api";
import Citations from "./Citations";

export default function SharedChatView({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchSharedChat(token)
      .then(setData)
      .catch(() => setError("This shared chat link is invalid or has been revoked."));
  }, [token]);

  if (error) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 text-center px-4">
        <div>
          <p className="text-gray-500 dark:text-gray-400">{error}</p>
          <a href="/" className="text-brand-600 dark:text-brand-400 text-sm hover:underline mt-2 inline-block">
            Go to DocChat
          </a>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">Shared conversation</p>
          <h1 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{data.title}</h1>
        </div>
        <a
          href="/"
          className="text-xs font-medium bg-brand-600 hover:bg-brand-700 text-white px-3 py-1.5 rounded-lg"
        >
          Open DocChat
        </a>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {data.messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-2xl rounded-2xl px-4 py-3 text-sm shadow-sm ${
                m.role === "user"
                  ? "bg-brand-600 text-white"
                  : "bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 text-gray-800 dark:text-gray-100"
              }`}
            >
              {m.role === "assistant" ? (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                </div>
              ) : (
                <p className="whitespace-pre-wrap">{m.content}</p>
              )}
              {m.role === "assistant" && <Citations citations={m.citations} />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
