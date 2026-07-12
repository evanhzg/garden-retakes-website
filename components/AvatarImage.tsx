import fs from "fs";
import path from "path";

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
  let finalSrc = src;
  
  if (!finalSrc) {
    const filePath = path.join(process.cwd(), "public", `${idStr}_pp.png`);
    // Directly verify on the server if the avatar exists
    const exists = fs.existsSync(filePath);
    finalSrc = exists ? `/${idStr}_pp.png` : "/default_pp.png";
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={finalSrc}
      alt={alt}
    />
  );
}
