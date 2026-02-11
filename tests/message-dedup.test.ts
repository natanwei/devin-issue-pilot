import { describe, it, expect } from "vitest";
import type { ConversationMessage, DashboardIssue } from "@/lib/types";

/**
 * Extracted dedup logic from Dashboard.tsx reducer UPDATE_ISSUE case.
 * This mirrors the exact merge logic used when patching messages.
 */
function mergeMessages(
  existing: ConversationMessage[],
  incoming: ConversationMessage[],
): ConversationMessage[] {
  const mergedMap = new Map<string, ConversationMessage>();
  for (const m of [...existing, ...incoming]) {
    const key = `${m.role}|${m.text}|${m.timestamp}`;
    mergedMap.set(key, m);
  }
  return Array.from(mergedMap.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
}

function makeMsg(
  role: ConversationMessage["role"],
  text: string,
  timestamp: string,
  source: ConversationMessage["source"] = "app",
): ConversationMessage {
  return { role, text, timestamp, source };
}

// ---------------------------------------------------------------------------
// Message dedup logic
// ---------------------------------------------------------------------------

describe("Message dedup logic (reducer merge)", () => {
  it("merges non-overlapping messages in chronological order", () => {
    const existing = [
      makeMsg("devin", "Hello", "2026-02-08T10:00:00Z"),
    ];
    const incoming = [
      makeMsg("user", "Hi there", "2026-02-08T10:01:00Z"),
    ];
    const merged = mergeMessages(existing, incoming);
    expect(merged).toHaveLength(2);
    expect(merged[0].role).toBe("devin");
    expect(merged[1].role).toBe("user");
  });

  it("deduplicates identical messages by role+text+timestamp", () => {
    const existing = [
      makeMsg("devin", "Hello", "2026-02-08T10:00:00Z"),
      makeMsg("user", "Hi", "2026-02-08T10:01:00Z"),
    ];
    const incoming = [
      makeMsg("devin", "Hello", "2026-02-08T10:00:00Z"),
      makeMsg("user", "Hi", "2026-02-08T10:01:00Z"),
      makeMsg("devin", "New message", "2026-02-08T10:02:00Z"),
    ];
    const merged = mergeMessages(existing, incoming);
    expect(merged).toHaveLength(3);
    expect(merged[2].text).toBe("New message");
  });

  it("handles empty existing messages", () => {
    const existing: ConversationMessage[] = [];
    const incoming = [
      makeMsg("devin", "First message", "2026-02-08T10:00:00Z"),
    ];
    const merged = mergeMessages(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe("First message");
  });

  it("handles empty incoming messages", () => {
    const existing = [
      makeMsg("devin", "Existing", "2026-02-08T10:00:00Z"),
    ];
    const incoming: ConversationMessage[] = [];
    const merged = mergeMessages(existing, incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].text).toBe("Existing");
  });

  it("sorts merged messages by timestamp", () => {
    const existing = [
      makeMsg("devin", "Third", "2026-02-08T10:03:00Z"),
      makeMsg("user", "First", "2026-02-08T10:01:00Z"),
    ];
    const incoming = [
      makeMsg("devin", "Second", "2026-02-08T10:02:00Z"),
    ];
    const merged = mergeMessages(existing, incoming);
    expect(merged).toHaveLength(3);
    expect(merged[0].text).toBe("First");
    expect(merged[1].text).toBe("Second");
    expect(merged[2].text).toBe("Third");
  });

  it("treats same text at different timestamps as distinct messages", () => {
    const existing = [
      makeMsg("user", "retry", "2026-02-08T10:00:00Z"),
    ];
    const incoming = [
      makeMsg("user", "retry", "2026-02-08T10:05:00Z"),
    ];
    const merged = mergeMessages(existing, incoming);
    expect(merged).toHaveLength(2);
  });

  it("treats same text from different roles as distinct messages", () => {
    const existing = [
      makeMsg("devin", "same text", "2026-02-08T10:00:00Z"),
    ];
    const incoming = [
      makeMsg("user", "same text", "2026-02-08T10:00:00Z"),
    ];
    const merged = mergeMessages(existing, incoming);
    expect(merged).toHaveLength(2);
  });

  it("optimistic user message + polled messages merge correctly", () => {
    const optimistic = makeMsg("user", "My answer", "2026-02-08T10:05:00Z");
    const existing = [
      makeMsg("devin", "Question?", "2026-02-08T10:00:00Z"),
      optimistic,
    ];

    const polled = [
      makeMsg("devin", "Question?", "2026-02-08T10:00:00Z"),
      makeMsg("user", "My answer", "2026-02-08T10:05:00Z"),
      makeMsg("devin", "Thanks, updating analysis...", "2026-02-08T10:06:00Z"),
    ];

    const merged = mergeMessages(existing, polled);
    expect(merged).toHaveLength(3);
    expect(merged[0].text).toBe("Question?");
    expect(merged[1].text).toBe("My answer");
    expect(merged[2].text).toBe("Thanks, updating analysis...");
  });

  it("handles large message arrays without duplicates", () => {
    const existing: ConversationMessage[] = [];
    for (let i = 0; i < 50; i++) {
      existing.push(
        makeMsg(
          i % 2 === 0 ? "devin" : "user",
          `Message ${i}`,
          new Date(Date.UTC(2026, 1, 8, 10, i)).toISOString(),
        ),
      );
    }
    const incoming = [...existing.slice(40), makeMsg("devin", "New", "2026-02-08T11:00:00Z")];
    const merged = mergeMessages(existing, incoming);
    expect(merged).toHaveLength(51);
  });
});
