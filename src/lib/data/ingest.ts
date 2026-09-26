"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadToStorage, fileToDataUrl } from "@/lib/supabase/storage";
import {
  isAiConfigured,
  extractTransactionsFromText,
  extractTransactionsFromImage,
  transcribeAudio,
} from "@/lib/ai/openai";
import { resolveExtractedTransaction } from "@/lib/ai/resolve";
import { applyStatementDueDate } from "@/lib/ai/statement";
import { RawExtractedTransaction } from "@/lib/ai/openai";
import { listPeople, listCategories, listTransactionTypes } from "@/lib/data/reference";
import { createTransactionsBatch, findPotentialDuplicates, TransactionInput } from "@/lib/data/transactions";
import { AiExtractedTransactionRow, ExtractedTransactionData, FieldConfidence } from "@/types/db";
import { toISODate, toReferenceMonth, formatDateBR } from "@/lib/utils/format";

export type IngestMethod = "audio" | "photo" | "text" | "pdf" | "csv";

const IMAGE_BATCH_SIZE = 3;

export interface IngestResultRow {
  id: string;
  data: ExtractedTransactionData;
  confidence: Record<string, FieldConfidence>;
  included: boolean;
  duplicateWarning: string | null;
}

export async function submitIngest(
  formData: FormData
): Promise<{ ok: true; jobId: string; rows: IngestResultRow[] } | { ok: false; error: string }> {
  if (!isAiConfigured()) {
    return {
      ok: false,
      error:
        "A extração por IA ainda não está configurada. Adicione uma chave de API para habilitar esse recurso.",
    };
  }

  const method = formData.get("method") as IngestMethod | null;
  if (!method) return { ok: false, error: "Método de entrada inválido." };

  const supabase = createAdminClient();
  const [people, categories, types] = await Promise.all([
    listPeople(),
    listCategories(),
    listTransactionTypes(),
  ]);
  const context = {
    today: toISODate(new Date()),
    people: people.map((p) => p.name),
    categories: categories.map((c) => c.name),
    types: types.map((t) => t.name),
  };

  let uploadedFileId: string | null = null;
  let uploadedFileIds: string[] = [];

  try {
    let rawItems: RawExtractedTransaction[] = [];
    let statementDueDate: string | null = null;

    if (method === "text") {
      const text = String(formData.get("text") ?? "");
      if (!text.trim()) return { ok: false, error: "Digite um texto para extrair os lançamentos." };

      const { data: uploadedFile } = await supabase
        .from("uploaded_files")
        .insert({ source_type: "text", raw_text: text, status: "processing" })
        .select("id")
        .single();
      uploadedFileId = uploadedFile?.id ?? null;

      ({ transactions: rawItems, statementDueDate } = await extractTransactionsFromText(text, context));
    } else if (method === "photo") {
      const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
      if (files.length === 0) return { ok: false, error: "Selecione ao menos uma imagem." };

      const uploadedFiles = await Promise.all(
        files.map(async (file) => {
          const storagePath = await uploadToStorage(file);
          const { data } = await supabase
            .from("uploaded_files")
            .insert({ source_type: "photo", storage_path: storagePath, status: "processing" })
            .select("id")
            .single();
          return data?.id as string | undefined;
        })
      );
      uploadedFileIds = uploadedFiles.filter((id): id is string => Boolean(id));
      uploadedFileId = uploadedFileIds[0] ?? null;

      const dataUrls = await Promise.all(files.map((file) => fileToDataUrl(file)));

      // Manda no máximo IMAGE_BATCH_SIZE imagens por chamada à IA, em paralelo — uma
      // única chamada com muitas imagens (ex.: 11 prints de uma vez) fica bem mais
      // lenta e arrisca truncar a resposta; em lotes paralelos o tempo total cai bastante.
      const batches: string[][] = [];
      for (let i = 0; i < dataUrls.length; i += IMAGE_BATCH_SIZE) {
        batches.push(dataUrls.slice(i, i + IMAGE_BATCH_SIZE));
      }
      const batchResults = await Promise.all(batches.map((batch) => extractTransactionsFromImage(batch, context)));
      rawItems = batchResults.flatMap((r) => r.transactions);
      // O vencimento aparece só na primeira página da fatura — vale para todos os lotes.
      statementDueDate = batchResults.map((r) => r.statementDueDate).find(Boolean) ?? null;
    } else {
      const file = formData.get("file") as File | null;
      if (!file || file.size === 0) return { ok: false, error: "Selecione um arquivo." };

      const storagePath = await uploadToStorage(file);
      const { data: uploadedFile } = await supabase
        .from("uploaded_files")
        .insert({ source_type: method, storage_path: storagePath, status: "processing" })
        .select("id")
        .single();
      uploadedFileId = uploadedFile?.id ?? null;

      if (method === "audio") {
        const transcript = await transcribeAudio(file);
        if (uploadedFileId) {
          await supabase.from("uploaded_files").update({ raw_text: transcript }).eq("id", uploadedFileId);
        }
        ({ transactions: rawItems, statementDueDate } = await extractTransactionsFromText(transcript, context));
      } else if (method === "pdf") {
        const parsed = await extractPdfText(Buffer.from(await file.arrayBuffer()));
        if (uploadedFileId) {
          await supabase.from("uploaded_files").update({ raw_text: parsed.text }).eq("id", uploadedFileId);
        }
        ({ transactions: rawItems, statementDueDate } = await extractTransactionsFromText(parsed.text, context));
      } else {
        // csv — texto puro, sem parsing: a IA lê as colunas e extrai um lançamento por linha.
        const csvText = await file.text();
        if (uploadedFileId) {
          await supabase.from("uploaded_files").update({ raw_text: csvText }).eq("id", uploadedFileId);
        }
        ({ transactions: rawItems, statementDueDate } = await extractTransactionsFromText(csvText, context));
      }
    }

    const { data: job, error: jobError } = await supabase
      .from("ai_processing_jobs")
      .insert({ uploaded_file_id: uploadedFileId, status: "completed", processed_at: new Date().toISOString() })
      .select("id")
      .single();
    if (jobError || !job) throw new Error(jobError?.message ?? "Falha ao criar job de processamento.");

    // Fatura de cartão: mês de referência = mês do vencimento; o ano das compras vem do vencimento.
    const statement = applyStatementDueDate(rawItems, statementDueDate);
    const resolved = statement.rows.map((raw) =>
      resolveExtractedTransaction(raw, { people, categories, types }, { referenceMonth: statement.referenceMonth })
    );

    // Compara com lançamentos já existentes (mesma pessoa, valor e data próxima) para
    // avisar sobre possível duplicata — ex.: print parcial da fatura + fatura fechada
    // depois, cobrindo as mesmas compras. Nunca bloqueia, só desmarca por segurança.
    const duplicates = await findPotentialDuplicates(
      resolved.map(({ data }) => ({
        personId: data.person_id,
        amountCents: data.amount !== null ? Math.round(data.amount * 100) : 0,
        registrationDate: data.registration_date,
        description: data.description,
      }))
    );

    const rowsToInsert = resolved.map(({ data, confidence }, i) => ({
      ai_processing_job_id: job.id,
      extracted_data: data,
      confidence,
      included: !duplicates[i],
      reviewed: false,
    }));

    let insertedRows: AiExtractedTransactionRow[] = [];
    if (rowsToInsert.length > 0) {
      const { data: inserted, error: insertError } = await supabase
        .from("ai_extracted_transactions")
        .insert(rowsToInsert)
        .select("*");
      if (insertError) throw new Error(insertError.message);
      insertedRows = inserted as AiExtractedTransactionRow[];
    }

    const finalStatus = insertedRows.length > 0 ? "review_needed" : "processed";
    const idsToUpdate = uploadedFileIds.length > 0 ? uploadedFileIds : uploadedFileId ? [uploadedFileId] : [];
    if (idsToUpdate.length > 0) {
      await supabase.from("uploaded_files").update({ status: finalStatus }).in("id", idsToUpdate);
    }

    return {
      ok: true,
      jobId: job.id,
      rows: insertedRows.map((r, i) => {
        const duplicate = duplicates[i];
        return {
          id: r.id,
          data: r.extracted_data,
          confidence: r.confidence ?? {},
          included: r.included,
          duplicateWarning: duplicate
            ? `Possível duplicata — já existe um lançamento parecido em ${formatDateBR(duplicate.registrationDate)}${duplicate.description ? ` (${duplicate.description})` : ""}.`
            : null,
        };
      }),
    };
  } catch (err) {
    const idsToMarkError = uploadedFileIds.length > 0 ? uploadedFileIds : uploadedFileId ? [uploadedFileId] : [];
    if (idsToMarkError.length > 0) {
      await supabase.from("uploaded_files").update({ status: "error" }).in("id", idsToMarkError);
    }
    const message = err instanceof Error ? err.message : "Erro desconhecido.";
    return { ok: false, error: `Não foi possível processar este envio. ${message}` };
  }
}

export interface ConfirmRowInput {
  id: string;
  included: boolean;
  data: ExtractedTransactionData;
}

export async function confirmExtractedRows(
  jobId: string,
  rows: ConfirmRowInput[],
  defaultPersonId: string,
  source: IngestMethod
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const supabase = createAdminClient();
  const included = rows.filter((r) => r.included);

  const inputs: TransactionInput[] = included
    .filter((r) => r.data.amount !== null && r.data.amount !== undefined)
    .flatMap((r) => {
      const registrationDate = r.data.registration_date ?? toISODate(new Date());
      const referenceMonth = r.data.reference_month ?? toReferenceMonth(new Date(registrationDate));
      const installmentCurrent = r.data.installment_current || 1;
      const installmentTotal = r.data.installment_total || 1;
      const base = {
        personId: r.data.person_id ?? defaultPersonId,
        direction: r.data.direction ?? "expense",
        fixedVariable: r.data.fixed_variable ?? "variable",
        typeId: r.data.type_id,
        categoryId: r.data.category_id,
        amountCents: Math.round((r.data.amount ?? 0) * 100),
        description: r.data.description,
        considered: true,
        source,
      } as const;

      // Só a parcela que aparece no documento (ex.: 3/10). As demais parcelas — as seguintes e, se
      // a fatura antiga chegar depois, as anteriores — são geradas/encaixadas por createTransactionsBatch
      // (compra parcelada agrupada), que também substitui uma parcela já gerada quando a fatura daquele
      // mês é importada, sem duplicar.
      return [
        {
          ...base,
          registrationDate,
          referenceMonth,
          installmentCurrent,
          installmentTotal,
        },
      ] satisfies TransactionInput[];
    });

  const result = await createTransactionsBatch(inputs);
  if (!result.ok) return result;

  await Promise.all(
    rows.map((r) =>
      supabase
        .from("ai_extracted_transactions")
        .update({ included: r.included, reviewed: true, extracted_data: r.data })
        .eq("id", r.id)
    )
  );

  const { data: job } = await supabase
    .from("ai_processing_jobs")
    .select("uploaded_file_id")
    .eq("id", jobId)
    .single();
  if (job?.uploaded_file_id) {
    await supabase.from("uploaded_files").update({ status: "confirmed" }).eq("id", job.uploaded_file_id);
  }

  revalidateTag("analysis");
  revalidatePath("/cadastro");
  revalidatePath("/analise");
  return { ok: true, count: result.count };
}

/**
 * pdf.js espera APIs de navegador (DOMMatrix, ImageData, Path2D) que não existem no
 * Node da Vercel — sem o polyfill o envio de PDF falhava com "DOMMatrix is not defined".
 */
async function extractPdfText(buffer: Buffer): Promise<{ text: string }> {
  const canvas = await import("@napi-rs/canvas");
  const g = globalThis as Record<string, unknown>;
  g.DOMMatrix ??= canvas.DOMMatrix;
  g.ImageData ??= canvas.ImageData;
  g.Path2D ??= canvas.Path2D;

  const { CanvasFactory } = await import("pdf-parse/worker");
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer, CanvasFactory });
  try {
    return await parser.getText();
  } finally {
    await parser.destroy();
  }
}
