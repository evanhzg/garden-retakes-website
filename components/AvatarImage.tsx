"use client";

import { useState, useEffect } from "react";

export default function AvatarImage({ 
  steamId, 
  src,
  alt = "Avatar", 
  className 
}: { 
  steamId: string | bigint; 
  src?: string | null;
  alt?: string; 
  className?: string 
}) {
  const idStr = steamId.toString();
  const initialSrc = src || `/${idStr}_pp.png`;
  const [imgSrc, setImgSrc] = useState<string>(initialSrc);

  useEffect(() => {
    setImgSrc(src || `/${idStr}_pp.png`);
  }, [src, idStr]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={imgSrc}
      alt={alt}
      onError={() => {
        if (imgSrc !== "/default_pp.png") {
          setImgSrc("/default_pp.png");
        }
      }}
    />
  );
}
