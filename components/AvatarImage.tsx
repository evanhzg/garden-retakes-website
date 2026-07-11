import fs from "fs";
import path from "path";

export default function AvatarImage({ 
  steamId, 
  alt = "Avatar", 
  className 
}: { 
  steamId: string | bigint; 
  alt?: string; 
  className?: string 
}) {
  const idStr = steamId.toString();
  const filePath = path.join(process.cwd(), "public", `${idStr}_pp.png`);
  
  // Directly verify on the server if the avatar exists
  const exists = fs.existsSync(filePath);
  const src = exists ? `/${idStr}_pp.png` : "/default_pp.png";

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={src}
      alt={alt}
    />
  );
}
