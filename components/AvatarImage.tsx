"use client";

export default function AvatarImage({ 
  steamId, 
  alt = "Avatar", 
  className 
}: { 
  steamId: string; 
  alt?: string; 
  className?: string 
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={`/${steamId}_pp.png`}
      alt={alt}
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).src = "/default_pp.png";
      }}
    />
  );
}
