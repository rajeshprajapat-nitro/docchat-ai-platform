export default function Citations({ citations }) {
  if (!citations || citations.length === 0) return null;

  return (
    <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-2">
      <p className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">Sources</p>
      <div className="space-y-1.5">
        {citations.map((c, i) => (
          <details key={i} className="text-xs bg-gray-50 dark:bg-gray-900/50 rounded-lg px-2.5 py-1.5 border border-gray-100 dark:border-gray-700">
            <summary className="cursor-pointer font-medium text-gray-700 dark:text-gray-200 flex items-center justify-between gap-2">
              {c.type === "web" ? (
                <span className="truncate">🌐 [{i + 1}] {c.title}</span>
              ) : (
                <span className="truncate">
                  📄 [{i + 1}] {c.filename}
                  {c.page ? ` · p.${c.page}` : ""}
                </span>
              )}
              {c.type !== "web" && <span className="text-gray-400 dark:text-gray-500 shrink-0">{Math.round(c.score * 100)}% match</span>}
            </summary>
            <p className="text-gray-500 dark:text-gray-400 mt-1.5 leading-relaxed">{c.snippet}</p>
            {c.type === "web" && (
              <a
                href={c.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-600 dark:text-brand-400 hover:underline mt-1 inline-block break-all"
              >
                {c.url}
              </a>
            )}
          </details>
        ))}
      </div>
    </div>
  );
}
