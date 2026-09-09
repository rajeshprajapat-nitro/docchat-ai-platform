import { useRef, useState } from "react";
import { uploadDocument, deleteDocument, getPreviewUrl } from "../api";
import PdfPreviewModal from "./PdfPreviewModal";

const STATUS_STYLES = {
  processing:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  ready:
    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  failed:
    "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

export default function DocumentSidebar({
  documents,
  refreshDocuments,
  selectedDocIds,
  setSelectedDocIds,
  onAskSuggested,
  mobileOpen = false,
  onCloseMobile,
}) {
  const fileInputRef = useRef(null);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);

  async function handleFiles(files) {
    setError("");
    setUploading(true);

    try {
      for (const file of files) {
        await uploadDocument(file);
      }

      refreshDocuments();

      // Close drawer on mobile after upload
      if (onCloseMobile) {
        onCloseMobile();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  }

  function toggleDoc(id) {
    setSelectedDocIds((prev) =>
      prev.includes(id)
        ? prev.filter((d) => d !== id)
        : [...prev, id]
    );
  }

  async function handleDelete(id, e) {
    e.stopPropagation();

    try {
      await deleteDocument(id);

      setSelectedDocIds((prev) => prev.filter((d) => d !== id));
      refreshDocuments();
    } catch (err) {
      setError(err.message);
    }
  }

  function handlePreview(doc, e) {
    e.stopPropagation();

    setPreview({
      url: getPreviewUrl(doc.id),
      filename: doc.filename,
    });
  }

  function handleAskSuggested(question, docId, e) {
    e.stopPropagation();

    if (!selectedDocIds.includes(docId)) {
      setSelectedDocIds((prev) => [...prev, docId]);
    }

    if (onAskSuggested) {
      onAskSuggested(question);
    }

    // Close drawer on mobile
    if (onCloseMobile) {
      onCloseMobile();
    }
  }

  return (
    <>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          bg-white dark:bg-gray-900
          flex flex-col h-full
          border-gray-200 dark:border-gray-800

          /* Desktop */
          md:relative
          md:w-72
          md:border-r
          md:translate-x-0

          /* Mobile */
          fixed
          top-0
          right-0
          z-50
          w-[85vw]
          max-w-sm
          border-l
          shadow-2xl
          transition-transform
          duration-300
          ease-in-out

          ${mobileOpen ? "translate-x-0" : "translate-x-full"}
        `}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
              Documents
            </h2>

            {/* Mobile close button */}
            <button
              type="button"
              onClick={onCloseMobile}
              className="
                md:hidden
                w-8 h-8
                flex items-center justify-center
                rounded-lg
                text-gray-500
                hover:bg-gray-100
                hover:text-gray-800
                dark:text-gray-400
                dark:hover:bg-gray-800
                dark:hover:text-gray-100
                transition
              "
              aria-label="Close documents"
            >
              ✕
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files || []);

              if (files.length > 0) {
                handleFiles(files);
              }

              // Allow selecting the same file again
              e.target.value = "";
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="
              w-full
              text-sm
              font-medium
              bg-brand-600
              hover:bg-brand-700
              text-white
              rounded-lg
              py-2
              transition
              disabled:opacity-60
              disabled:cursor-not-allowed
            "
          >
            {uploading ? "Uploading…" : "+ Upload PDF"}
          </button>

          {error && (
            <p className="text-xs text-red-500 mt-2">
              {error}
            </p>
          )}

          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            {selectedDocIds.length === 0
              ? "No filter — searches all documents"
              : `${selectedDocIds.length} selected for this chat`}
          </p>
        </div>

        {/* Documents */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1">
          {documents.length === 0 && (
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-8 px-4">
              Upload a PDF to start chatting with your documents.
            </p>
          )}

          {documents.map((doc) => (
            <div
              key={doc.id}
              onClick={() => toggleDoc(doc.id)}
              className={`
                cursor-pointer
                rounded-lg
                p-3
                border
                text-sm
                transition
                ${
                  selectedDocIds.includes(doc.id)
                    ? "border-brand-500 bg-brand-50 dark:bg-brand-500/10"
                    : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800"
                }
              `}
            >
              {/* Filename + actions */}
              <div className="flex justify-between items-start gap-2">
                <p className="font-medium text-gray-800 dark:text-gray-100 truncate">
                  {doc.filename}
                </p>

                <div className="flex items-center gap-2 shrink-0">
                  {doc.status === "ready" && (
                    <button
                      type="button"
                      onClick={(e) => handlePreview(doc, e)}
                      className="
                        text-gray-300
                        dark:text-gray-500
                        hover:text-brand-600
                        dark:hover:text-brand-400
                        text-xs
                      "
                      title="Preview"
                    >
                      👁
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={(e) => handleDelete(doc.id, e)}
                    className="
                      text-gray-300
                      dark:text-gray-500
                      hover:text-red-500
                      text-xs
                    "
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* Status */}
              <div className="flex items-center gap-2 mt-1.5">
                <span
                  className={`
                    text-[10px]
                    px-1.5
                    py-0.5
                    rounded-full
                    font-medium
                    ${STATUS_STYLES[doc.status]}
                  `}
                >
                  {doc.status}
                </span>

                {doc.status === "ready" && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    {doc.num_pages}p · {doc.num_chunks} chunks
                  </span>
                )}
              </div>

              {/* AI Summary */}
              {doc.status === "ready" && doc.summary && (
                <details
                  className="mt-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <summary className="text-[11px] text-brand-600 dark:text-brand-400 cursor-pointer select-none">
                    ✨ AI summary
                  </summary>

                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                    {doc.summary}
                  </p>

                  {/* Key Topics */}
                  {doc.key_topics && doc.key_topics.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {doc.key_topics.map((topic, ti) => (
                        <span
                          key={ti}
                          className="
                            text-[10px]
                            bg-gray-100
                            dark:bg-gray-700
                            text-gray-600
                            dark:text-gray-300
                            px-1.5
                            py-0.5
                            rounded
                          "
                        >
                          {topic}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Suggested Questions */}
                  {doc.suggested_questions &&
                    doc.suggested_questions.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {doc.suggested_questions.map((q, qi) => (
                          <button
                            type="button"
                            key={qi}
                            onClick={(e) =>
                              handleAskSuggested(q, doc.id, e)
                            }
                            className="
                              block
                              w-full
                              text-left
                              text-[11px]
                              text-brand-600
                              dark:text-brand-400
                              hover:underline
                              truncate
                            "
                          >
                            → {q}
                          </button>
                        ))}
                      </div>
                    )}
                </details>
              )}
            </div>
          ))}
        </div>

        {/* PDF Preview */}
        {preview && (
          <PdfPreviewModal
            url={preview.url}
            filename={preview.filename}
            onClose={() => setPreview(null)}
          />
        )}
      </aside>
    </>
  );
}