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
 * Salva uma imagem gerada por IA no Storage do Supabase e retorna uma URL pública estável.
 * Bucket público e separado do de uploads privados: são ilustrações geradas por IA,
 * sem dados financeiros do usuário, não há motivo para exigir URL assinada.
 * Retorna null em qualquer falha, sem lançar — nunca deve bloquear quem chamou.
 */
export async function persistGeneratedImage(image: { data: Buffer; contentType: string }): Promise<string | null> {
  try {
    const ext = image.contentType.includes("jpeg") ? "jpg" : image.contentType.split("/")[1] || "png";
    const supabase = createAdminClient();
    const path = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from(SIMULATION_IMAGES_BUCKET)
      .upload(path, image.data, { contentType: image.contentType, upsert: false });
    if (error) {
      console.error("persistGeneratedImage upload failed:", error);
      return null;
    }

    const { data } = supabase.storage.from(SIMULATION_IMAGES_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  } catch (error) {
    console.error("persistGeneratedImage failed:", error);
    return null;
  }
}
