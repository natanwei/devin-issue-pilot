"use client";

import { useState } from "react";
import { Send } from "lucide-react";

interface MessageInputProps {
  color: "amber" | "red" | "blue" | "default";
  placeholder?: string;
  onSend: (message: string) => void;
  helperText?: string;
}

const focusColorMap = {
  amber: "focus:border-accent-amber",
  red: "focus:border-accent-red",
  blue: "focus:border-accent-blue",
  default: "focus:border-border-hover",
};

const buttonColorMap = {
  amber: { text: "text-accent-amber", border: "border-accent-amber" },
  red: { text: "text-accent-red", border: "border-accent-red" },
  blue: { text: "text-accent-blue", border: "border-accent-blue" },
  default: { text: "text-text-secondary", border: "border-border-hover" },
};

export default function MessageInput({
  color,
  placeholder = "Add context for Devin...",
  onSend,
  helperText = "This will be sent to Devin\u2019s session",
}: MessageInputProps) {
  const [value, setValue] = useState("");

  function handleSend() {
    if (!value.trim()) return;
    onSend(value.trim());
    setValue("");
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  const btnColors = buttonColorMap[color];

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={2}
        className={`w-full bg-dp-card border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted resize-none outline-none transition-colors ${focusColorMap[color]}`}
      />
      <div className="flex items-center justify-between">
        <span className="text-text-muted text-[11px]">{helperText}</span>
        <button
          onClick={handleSend}
          disabled={!value.trim()}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md border text-[13px] font-medium transition-opacity ${btnColors.text} ${btnColors.border} ${
            !value.trim() ? "opacity-40 cursor-not-allowed" : "hover:opacity-80"
          }`}
        >
          <Send className="h-3.5 w-3.5" />
          Send
        </button>
      </div>
    </div>
  );
}
