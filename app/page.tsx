"use client";

import { useState } from "react";
import RepoConnect from "./components/RepoConnect";
import Dashboard from "./components/Dashboard";

export default function Home() {
  const [connection, setConnection] = useState<{
    repo: { owner: string; name: string };
    mode: "demo" | "live";
  } | null>(null);

  if (!connection) {
    return (
      <RepoConnect
        onConnect={(repo, mode) => setConnection({ repo, mode })}
      />
    );
  }

  return (
    <Dashboard
      repo={connection.repo}
      initialMode={connection.mode}
      onDisconnect={() => setConnection(null)}
    />
  );
}
