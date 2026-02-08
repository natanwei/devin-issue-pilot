"use client";

import { ConfidenceLevel } from "@/lib/types";
import { CONFIDENCE_CONFIG } from "@/lib/constants";

interface ConfidenceDotProps {
  confidence: ConfidenceLevel | null;
  size?: "sm" | "md";
}

export default function ConfidenceDot({
  confidence,
  size = "md",
}: ConfidenceDotProps) {
  const sizeClass = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";

  if (!confidence) {
    return (
      <span
        className={`${sizeClass} rounded-full bg-text-muted inline-block flex-shrink-0`}
        title="Not scoped"
      />
    );
  }

  const config = CONFIDENCE_CONFIG[confidence];

  return (
    <span
      className={`${sizeClass} rounded-full inline-block flex-shrink-0`}
      style={{ backgroundColor: config.color }}
      title={config.label}
    />
  );
}
