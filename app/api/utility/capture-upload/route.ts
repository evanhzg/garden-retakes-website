import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { uploadBuffer, getPublicUrl } from "@/lib/r2";

export async function POST(req: NextRequest) {
  const session = getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const key = `captures/${Date.now()}.jpg`;
    
    const success = await uploadBuffer(buffer, key);

    if (!success) {
      return NextResponse.json({ error: "Failed to upload to R2" }, { status: 500 });
    }

    const url = getPublicUrl(key);

    return NextResponse.json({ url });
  } catch (error) {
    console.error("Capture upload error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
