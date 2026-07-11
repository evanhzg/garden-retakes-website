"use client";

import { useState, useEffect } from "react";

export default function AvatarImage({ 
  steamId, 
  alt = "Avatar", 
  className 
}: { 
  steamId: string; 
  alt?: string; 
  className?: string 
}) {
  const [error, setError] = useState(false);

  // If the steamId prop changes (e.g. client-side navigation), reset the error state
  useEffect(() => {
    setError(false);
  }, [steamId]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={error ? "/default_pp.png" : `/${steamId}_pp.png`}
      alt={alt}
      onError={() => setError(true)}
    />
  );
}
