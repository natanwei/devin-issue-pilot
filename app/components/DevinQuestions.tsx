"use client";

interface DevinQuestionsProps {
  questions: string[];
  color: "amber" | "red";
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
}: DevinQuestionsProps) {
  const colors = colorMap[color];

  if (questions.length === 0) return null;

  return (
    <div
      className="rounded-r-lg bg-elevated p-4 flex flex-col gap-3"
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
    </div>
  );
}
