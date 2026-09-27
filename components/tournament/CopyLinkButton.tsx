"use client";

import { useState } from "react";
import { Check, Link as LinkIcon } from "lucide-react";

/** Copy the current page's URL. */
export default function CopyLinkButton({ label, copiedLabel }: { label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() =>
        navigator.clipboard
          .writeText(window.location.href)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1600);
          })
          .catch(() => {})
      }
    >
      {copied ? <Check size={15} /> : <LinkIcon size={15} />} {copied ? copiedLabel : label}
    </button>
  );
}
