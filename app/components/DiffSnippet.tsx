"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PRFileChange } from "@/lib/types";

interface DiffSnippetProps {
  files: PRFileChange[];
}

export default function DiffSnippet({ files }: DiffSnippetProps) {
  const [activeFileIndex, setActiveFileIndex] = useState(0);

  const filesWithDiffs = files.filter(
    (f) => f.diff_lines && f.diff_lines.length > 0
  );
  if (filesWithDiffs.length === 0) return null;

  const activeFile = filesWithDiffs[activeFileIndex];
  const isFirst = activeFileIndex === 0;
  const isLast = activeFileIndex === filesWithDiffs.length - 1;

  return (
    <div className="w-full rounded-md overflow-hidden border border-[#30363d] bg-[#0d1117]">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-3 py-2 bg-[#161b22] border-b border-[#30363d]">
        <span
          className="text-[#e6edf3] text-xs font-mono truncate"
          style={{ fontFamily: "'JetBrains Mono', monospace" }}
        >
          {activeFile.path}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#58a6ff] bg-[#1f6feb33] rounded px-1.5 py-0.5 whitespace-nowrap">
          +{activeFile.additions} −{activeFile.deletions}
        </span>
        <span className="flex-1" />
        <span className="text-[#8b949e] text-xs whitespace-nowrap">
          {activeFileIndex + 1} / {filesWithDiffs.length}
        </span>
        <button
          onClick={() => setActiveFileIndex((i) => Math.max(0, i - 1))}
          disabled={isFirst}
          className={`p-0.5 rounded ${
            isFirst
              ? "text-[#484f58] cursor-default"
              : "text-[#8b949e] hover:text-[#e6edf3]"
          }`}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={() =>
            setActiveFileIndex((i) =>
              Math.min(filesWithDiffs.length - 1, i + 1)
            )
          }
          disabled={isLast}
          className={`p-0.5 rounded ${
            isLast
              ? "text-[#484f58] cursor-default"
              : "text-[#8b949e] hover:text-[#e6edf3]"
          }`}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Diff lines */}
      <div className="max-h-[240px] overflow-y-auto diff-scrollbar">
        {activeFile.diff_lines?.map((line, i) => {
          let bg = "bg-[#0d1117]";
          let color = "text-[#8b949e]";
          let prefix = " ";

          if (line.type === "remove") {
            bg = "bg-[#1c1210]";
            color = "text-[#f85149]";
            prefix = "−";
          } else if (line.type === "add") {
            bg = "bg-[#0e1c0a]";
            color = "text-[#3fb950]";
            prefix = "+";
          }

          return (
            <div
              key={i}
              className={`${bg} ${color} font-mono text-[11px] px-3 py-[3px] whitespace-pre`}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {prefix} {line.content}
            </div>
          );
        })}
      </div>
    </div>
  );
}
