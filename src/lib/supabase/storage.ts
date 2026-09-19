import "server-only";
import { createAdminClient } from "./admin";

const BUCKET = "uploads";

export async function uploadToStorage(file: File): Promise<string> {
  const supabase = createAdminClient();
  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || undefined,
    upsert: false,
  });

  if (error) throw new Error(`Falha ao enviar arquivo: ${error.message}`);
  return path;
}

export async function fileToDataUrl(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
}
