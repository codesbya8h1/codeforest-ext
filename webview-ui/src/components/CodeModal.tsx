import React, { useEffect, useCallback, useMemo } from "react";
import Prism from "prismjs";
import "prismjs/components/prism-python";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-javascript";
import "prismjs/themes/prism-tomorrow.css";

interface CodeModalProps {
  name: string;
  nodeType: string;
  code: string;
  language?: string;
  onClose: () => void;
}

const typeColors: Record<string, string> = {
  function: "#6366f1",
  class: "#ec4899",
  module: "#10b981",
};

const typeLabels: Record<string, string> = {
  function: "fn",
  class: "class",
  module: "module",
};

export function CodeModal({ name, nodeType, code, language = "javascript", onClose }: CodeModalProps) {
  const accentColor = typeColors[nodeType] ?? "#60a5fa";
  const typeLabel = typeLabels[nodeType] ?? nodeType;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const highlightedCode = useMemo(() => {
    const grammar = Prism.languages[language] ?? Prism.languages.javascript;
    return Prism.highlight(code, grammar, language);
  }, [code, language]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "rgba(8, 12, 22, 0.82)", backdropFilter: "blur(6px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex flex-col w-full max-w-3xl rounded-2xl overflow-hidden"
        style={{
          background: "hsl(222, 22%, 11%)",
          border: "1px solid hsl(220, 15%, 20%)",
          boxShadow: `0 0 0 1px ${accentColor}22, 0 24px 60px rgba(0,0,0,0.6)`,
          maxHeight: "80vh",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-3.5 flex-shrink-0"
          style={{ borderBottom: "1px solid hsl(220, 15%, 17%)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="flex-shrink-0 text-[10px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded"
              style={{
                color: accentColor,
                background: accentColor + "22",
                border: `1px solid ${accentColor}44`,
              }}
            >
              {typeLabel}
            </span>
            <code
              className="text-sm font-mono truncate"
              style={{ color: "rgba(220, 230, 255, 0.92)" }}
            >
              {name}
            </code>
          </div>

          <button
            onClick={onClose}
            className="flex-shrink-0 ml-4 p-1.5 rounded-lg transition-colors"
            style={{ color: "hsl(215, 15%, 50%)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(220,230,255,0.9)"; (e.currentTarget as HTMLButtonElement).style.background = "hsl(220,15%,18%)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "hsl(215,15%,50%)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
            title="Close (Esc)"
          >
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none">
              <path
                d="M11.5 3.5L3.5 11.5M3.5 3.5L11.5 11.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        {/* Traffic-light row — purely decorative, gives IDE feel */}
        <div
          className="flex items-center gap-1.5 px-5 py-2 flex-shrink-0"
          style={{ borderBottom: "1px solid hsl(220, 15%, 14%)", background: "hsl(222, 22%, 9%)" }}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57] opacity-60" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e] opacity-60" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840] opacity-60" />
          <span className="ml-auto text-[10px] font-mono" style={{ color: "hsl(215,15%,35%)" }}>
            {code.split("\n").length} lines
          </span>
        </div>

        {/* Code block */}
        <div className="overflow-auto flex-1">
          <pre
            className={`p-5 text-xs leading-relaxed font-mono select-text language-${language}`}
            style={{
              tabSize: 4,
              whiteSpace: "pre",
              margin: 0,
              background: "transparent",
            }}
          >
            <code
              className={`language-${language}`}
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
          </pre>
        </div>
      </div>
    </div>
  );
}
