import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { storeFile } from "@/lib/uploads";
import { MANUAL_MIME, MAX_MANUAL_BYTES, manualSchema } from "@/lib/manuals";

/**
 * Manual upload (admins only). A route handler rather than a server action so
 * large manuals aren't limited by the 10 MB server-action body limit.
 */
export async function POST(req: Request) {
  let tab: Record<string, string> = {};
  const back = (params: Record<string, string>) =>
    NextResponse.redirect(
      new URL(`/portal/manuals?${new URLSearchParams({ ...tab, ...params })}`, req.url),
      303,
    );

  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return back({ error: "Upload failed. Is the file under 50 MB?" });
  }

  // On an error, come back to the tab the upload was made from.
  tab = Object.fromEntries(
    (["brand", "model"] as const)
      .map((k) => [k, String(form.get(k) || "").trim()])
      .filter(([, v]) => v),
  );

  const parsed = manualSchema.safeParse({
    brand: form.get("brand"),
    model: form.get("model"),
    equipmentType: form.get("equipmentType"),
    title: form.get("title") || undefined,
  });
  if (!parsed.success) {
    return back({ error: parsed.error.issues[0]?.message || "Fill in brand, model and type." });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return back({ error: "Choose a file to upload." });
  if (file.size > MAX_MANUAL_BYTES) return back({ error: "File is too large (max 50 MB)." });
  if (!MANUAL_MIME.has(file.type)) return back({ error: "Manuals must be PDF or image files." });

  // Reuse the existing spelling of a brand / model (MySQL compares these
  // case-insensitively), so "carrier" lands in the existing "Carrier" tab.
  const sameBrand = await prisma.manual.findFirst({
    where: { brand: parsed.data.brand },
    select: { brand: true },
  });
  const brand = sameBrand?.brand ?? parsed.data.brand;
  const sameModel = await prisma.manual.findFirst({
    where: { brand, model: parsed.data.model },
    select: { model: true },
  });
  const model = sameModel?.model ?? parsed.data.model;

  const stored = await storeFile(file);
  await prisma.manual.create({
    data: {
      ...parsed.data,
      brand,
      model,
      title: parsed.data.title || null,
      originalName: file.name.slice(0, 400),
      storedName: stored.storedName,
      mimeType: stored.mimeType,
      size: stored.size,
      sha256: stored.sha256,
      uploadedById: user.id,
    },
  });

  revalidatePath("/portal/manuals");
  return back({
    brand,
    model,
    message: `Uploaded to ${brand} › ${model}. Vans get it on their next sync.`,
  });
}
