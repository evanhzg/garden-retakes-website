"use client";

import { useState } from "react";
import { useI18n } from '@/components/I18nProvider';

export default function ConnectButton({ serverAddress }: { serverAddress: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(`connect ${serverAddress}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="connect-row">
      <a className="btn" href={`steam://connect/${serverAddress}`}>
        {t('connect.button')}
      </a>
      <button className="btn secondary" onClick={copy}>
        {copied ? t('connect.copied') : t('connect.copyIp', { serverAddress })}
      </button>
    </div>
  );
}
