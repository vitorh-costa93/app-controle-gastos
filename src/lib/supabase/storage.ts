import "server-only";
import { createAdminClient } from "./admin";

const BUCKET = "meudinheiro-uploads";
const SIMULATION_IMAGES_BUCKET = "meudinheiro-simulation-images";

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

/**
 * Baixa uma imagem de uma URL temporária (ex.: link do DALL-E, que expira em ~1h)
 * e a persiste no Storage do Supabase, retornando uma URL pública estável.
 * Bucket público e separado do de uploads privados: são ilustrações geradas por IA,
 * sem dados financeiros do usuário, não há motivo para exigir URL assinada.
 * Retorna null em qualquer falha, sem lançar — nunca deve bloquear quem chamou.
 */
export async function persistExternalImage(sourceUrl: string): Promise<string | null> {
  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type") ?? "image/png";
    const ext = contentType.includes("jpeg") ? "jpg" : contentType.split("/")[1] || "png";
    const buffer = Buffer.from(await response.arrayBuffer());

    const supabase = createAdminClient();
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(SIMULATION_IMAGES_BUCKET)
      .upload(path, buffer, { contentType, upsert: false });
    if (error) return null;

    const { data } = supabase.storage.from(SIMULATION_IMAGES_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch {
    return null;
  }
}
