export default function PdfPreviewModal({ url, filename, onClose }) {
  if (!url) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{filename}</p>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm"
          >
            ✕ Close
          </button>
        </div>
        <iframe title={filename} src={url} className="flex-1 w-full" />
      </div>
    </div>
  );
}
