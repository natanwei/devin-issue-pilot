/** Translate raw API/lib error messages into user-friendly messages. */
export function translateError(rawMessage: string): {
  message: string;
  isAuth: boolean;
} {
  // Devin 401 — invalid API key
  if (/Devin API error 401/i.test(rawMessage)) {
    return {
      message: "Invalid Devin API key. Check your key in Settings.",
      isAuth: true,
    };
  }

  // Devin 403 — insufficient permissions
  if (/Devin API error 403/i.test(rawMessage)) {
    return {
      message:
        "Devin API access denied. Check your API key permissions in Settings.",
      isAuth: true,
    };
  }

  // Devin 429 — rate limit
  if (/Devin API error 429/i.test(rawMessage)) {
    return {
      message: "Devin rate limit reached. Wait a moment and try again.",
      isAuth: false,
    };
  }

  // GitHub 401 — bad credentials (Octokit throws "Bad credentials" or "Unauthorized")
  if (
    !/Devin/i.test(rawMessage) &&
    /401|Bad credentials|Unauthorized/i.test(rawMessage)
  ) {
    return {
      message: "Invalid GitHub token. Check your token in Settings.",
      isAuth: true,
    };
  }

  // GitHub 403 — insufficient scope or rate limit
  if (
    !/Devin/i.test(rawMessage) &&
    /403|Resource not accessible/i.test(rawMessage)
  ) {
    return {
      message:
        "GitHub access denied. Check your token has the public_repo scope in Settings.",
      isAuth: true,
    };
  }

  // GitHub 404 — repo not found (also returned for private repos without access)
  if (!/Devin/i.test(rawMessage) && /404|Not Found/i.test(rawMessage)) {
    return {
      message:
        "Repository not found. Check the repo URL \u2014 private repos need the full repo scope.",
      isAuth: false,
    };
  }

  // Fallback — truncate to prevent info leaks
  const safeMessage = rawMessage.length > 200
    ? rawMessage.slice(0, 200) + "..."
    : rawMessage;
  return { message: safeMessage, isAuth: false };
}
