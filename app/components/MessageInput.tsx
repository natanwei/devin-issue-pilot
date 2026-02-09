"use client";

import { useState } from "react";
import { Send, Check, Loader2 } from "lucide-react";

interface MessageInputProps {
  color: "amber" | "red" | "blue" | "default";
  placeholder?: string;
  onSend: (message: string) => void | Promise<void>;
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
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (!value.trim() || sending) return;
    const msg = value.trim();
    setSending(true);
    try {
      await onSend(msg);
      setValue("");
      setSent(true);
      setTimeout(() => setSent(false), 1500);
    } catch {
      // Keep value so user can retry — error shown via Dashboard banner
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const btnColors = buttonColorMap[color];
  const disabled = (!value.trim() && !sent) || sending;

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={2}
        disabled={sending}
        className={`w-full bg-dp-card border border-border-subtle rounded-lg px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted resize-none outline-none transition-colors disabled:opacity-50 ${focusColorMap[color]}`}
      />
      <div className="flex items-center justify-between">
        <span className="text-text-muted text-[11px]">{helperText}</span>
        <button
          onClick={() => void handleSend()}
          disabled={disabled}
          className={`flex items-center gap-1.5 px-3 py-1 rounded-md border text-[13px] font-medium transition-opacity ${btnColors.text} ${btnColors.border} ${
            disabled ? "opacity-40 cursor-not-allowed" : "hover:opacity-80"
          }`}
        >
          {sending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Sending...
            </>
          ) : sent ? (
            <>
              <Check className="h-3.5 w-3.5" />
              Sent
            </>
          ) : (
            <>
              <Send className="h-3.5 w-3.5" />
              Send
            </>
          )}
        </button>
      </div>
    </div>
  );
}
