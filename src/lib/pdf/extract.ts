import "server-only";

/**
 * pdf.js espera APIs de navegador (DOMMatrix, ImageData, Path2D) que não existem no
 * Node da Vercel — sem o polyfill o envio de PDF falhava com "DOMMatrix is not defined".
 */
export async function extractPdfText(buffer: Buffer): Promise<{ text: string; pages: { num: number; text: string }[] }> {
  const canvas = await import("@napi-rs/canvas");
  const g = globalThis as Record<string, unknown>;
  g.DOMMatrix ??= canvas.DOMMatrix;
  g.ImageData ??= canvas.ImageData;
  g.Path2D ??= canvas.Path2D;

  const { CanvasFactory } = await import("pdf-parse/worker");
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer, CanvasFactory });
  try {
    const result = await parser.getText();
    return { text: result.text, pages: result.pages.map((p) => ({ num: p.num, text: p.text })) };
  } finally {
    await parser.destroy();
  }
}
