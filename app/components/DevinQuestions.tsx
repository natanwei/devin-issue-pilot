"use client";

import { ExternalLink } from "lucide-react";

interface DevinQuestionsProps {
  questions: string[];
  color: "amber" | "red";
  githubUrl?: string;
  githubCommentUrl?: string | null;
}

const colorMap = {
  amber: {
    border: "#f59e0b",
    label: "#f59e0b",
  },
  red: {
    border: "#ef4444",
    label: "#ef4444",
  },
};

export default function DevinQuestions({
  questions,
  color,
  githubUrl,
  githubCommentUrl,
}: DevinQuestionsProps) {
  const colors = colorMap[color];

  if (questions.length === 0) return null;

  return (
    <div
      className="rounded-r-lg bg-[#1a1a1a] p-4 flex flex-col gap-3"
      style={{ borderLeft: `3px solid ${colors.border}` }}
    >
      <span
        className="text-xs font-semibold uppercase tracking-wider"
        style={{ color: colors.label }}
      >
        Devin&apos;s Questions
      </span>
      {questions.map((q, i) => (
        <p
          key={i}
          className="text-text-primary text-sm leading-relaxed"
        >
          {i + 1}. {q}
        </p>
      ))}
      {(githubCommentUrl || githubUrl) && (
        <a
          href={githubCommentUrl || githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-accent-blue text-[13px] mt-1"
        >
          <ExternalLink className="h-3 w-3" />
          {githubCommentUrl ? "Posted on GitHub issue \u2192" : "View on GitHub \u2192"}
        </a>
      )}
    </div>
  );
}
