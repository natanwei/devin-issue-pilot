export function getTimeSince(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

export function buildIssueMetaText(
  fileCount: number,
  totalLines: number,
  createdAt: string | null | undefined,
): string {
  const parts: string[] = [];
  if (fileCount > 0) parts.push(`${fileCount} file${fileCount > 1 ? "s" : ""}`);
  if (totalLines > 0) parts.push(`~${totalLines} lines`);
  if (createdAt) parts.push(getTimeSince(createdAt));
  return parts.join(" · ");
}
