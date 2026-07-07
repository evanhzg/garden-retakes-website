"use client";

import { useState } from "react";

export default function ConnectButton({ serverAddress }: { serverAddress: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(`connect ${serverAddress}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="connect-row">
      <a className="btn" href={`steam://connect/${serverAddress}`}>
        ▶ Connect
      </a>
      <button className="btn secondary" onClick={copy}>
        {copied ? "Copied!" : `Copy IP (${serverAddress})`}
      </button>
    </div>
  );
}
