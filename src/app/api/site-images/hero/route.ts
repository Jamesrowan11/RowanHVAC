import { NextResponse } from "next/server";
import { getHeroImage } from "@/lib/siteContent";
import { readUpload } from "@/lib/storage";

/** Public hero background photo for the homepage (set in Admin → Website). */
export async function GET() {
  const hero = await getHeroImage();
  if (!hero) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const buffer = await readUpload(hero.path);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": hero.mime,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  }
}
