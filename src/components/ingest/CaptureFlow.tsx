"use client";

import { useRef, useState } from "react";
import { Mic, Square, Upload, Camera } from "lucide-react";
import { Person, Category, TransactionType } from "@/types/db";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { InputMethod } from "@/components/cadastro/InputMethodCards";
import { submitIngest, IngestResultRow } from "@/lib/data/ingest";
import { AIReviewTable } from "./AIReviewTable";

const METHOD_TITLES: Record<InputMethod, string> = {
  audio: "Novo lançamento por áudio",
  photo: "Novo lançamento por foto",
  text: "Novo lançamento por texto",
  pdf: "Novo lançamento por PDF",
  csv: "Novo lançamento por CSV",
};

type Stage = "capture" | "processing" | "review" | "error";

export function CaptureFlow({
  method,
  people,
  categories,
  types,
  onClose,
}: {
  method: InputMethod;
  people: Person[];
  categories: Category[];
  types: TransactionType[];
  onClose: () => void;
}) {
  const [stage, setStage] = useState<Stage>("capture");
  const [error, setError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [rows, setRows] = useState<IngestResultRow[]>([]);

  async function handleSubmit(formData: FormData) {
    setStage("processing");
    setError(null);
    formData.set("method", method);

    const result = await submitIngest(formData);
    if (!result.ok) {
      setError(result.error);
      setStage("error");
      return;
    }
    if (result.rows.length === 0) {
      setError("Não conseguimos identificar nenhum lançamento neste envio. Tente novamente com mais detalhes.");
      setStage("error");
      return;
    }
    setJobId(result.jobId);
    setRows(result.rows);
    setStage("review");
  }

  return (
    <Modal open onClose={onClose} title={METHOD_TITLES[method]} size="lg">
      {stage === "capture" && (
        <CaptureInput method={method} onSubmit={handleSubmit} onCancel={onClose} />
      )}

      {stage === "processing" && (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-(--color-primary) border-t-transparent" />
          <p className="text-sm text-(--color-text-secondary)">
            A IA está lendo o conteúdo e estruturando os lançamentos...
          </p>
        </div>
      )}

      {stage === "error" && (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <p className="text-sm text-(--color-negative)">{error}</p>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Fechar
            </Button>
            <Button onClick={() => setStage("capture")}>Tentar novamente</Button>
          </div>
        </div>
      )}

      {stage === "review" && jobId && (
        <AIReviewTable
          jobId={jobId}
          initialRows={rows}
          people={people}
          categories={categories}
          types={types}
          source={method}
          onDone={onClose}
        />
      )}
    </Modal>
  );
}

function CaptureInput({
  method,
  onSubmit,
  onCancel,
}: {
  method: InputMethod;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  if (method === "text") return <TextCapture onSubmit={onSubmit} onCancel={onCancel} />;
  if (method === "audio") return <AudioCapture onSubmit={onSubmit} onCancel={onCancel} />;
  return <FileCapture method={method} onSubmit={onSubmit} onCancel={onCancel} />;
}

function TextCapture({
  onSubmit,
  onCancel,
}: {
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState("");
  return (
    <div className="flex flex-col gap-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Ex.: Ontem supermercado 324,50 no cartão do Vitor. Academia 89,90 todo mês."
        rows={6}
        className="w-full resize-none rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3 text-sm outline-none focus:ring-2 focus:ring-(--color-primary)/30"
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          disabled={!text.trim()}
          onClick={() => {
            const fd = new FormData();
            fd.set("text", text);
            onSubmit(fd);
          }}
        >
          Processar com IA
        </Button>
      </div>
    </div>
  );
}

function FileCapture({
  method,
  onSubmit,
  onCancel,
}: {
  method: InputMethod;
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const accept = method === "pdf" ? "application/pdf" : method === "csv" ? ".csv,text/csv" : "image/*";

  return (
    <div className="flex flex-col gap-4">
      <button
        onClick={() => inputRef.current?.click()}
        className="flex flex-col items-center gap-2 rounded-(--radius-lg) border border-dashed border-(--color-border) py-12 text-(--color-text-secondary) hover:border-(--color-primary)/40"
      >
        {method === "photo" ? <Camera size={24} /> : <Upload size={24} />}
        <span className="text-sm">{file ? file.name : "Toque para selecionar um arquivo"}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        capture={method === "photo" ? "environment" : undefined}
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          disabled={!file}
          onClick={() => {
            if (!file) return;
            const fd = new FormData();
            fd.set("file", file);
            onSubmit(fd);
          }}
        >
          Processar com IA
        </Button>
      </div>
    </div>
  );
}

function AudioCapture({
  onSubmit,
  onCancel,
}: {
  onSubmit: (formData: FormData) => void;
  onCancel: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  async function startRecording() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
    recorder.onstop = () => {
      setAudioBlob(new Blob(chunksRef.current, { type: "audio/webm" }));
      stream.getTracks().forEach((t) => t.stop());
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  const file = uploadedFile ?? (audioBlob ? new File([audioBlob], "gravacao.webm", { type: "audio/webm" }) : null);

  return (
    <div className="flex flex-col items-center gap-6 py-6">
      <button
        onClick={recording ? stopRecording : startRecording}
        className={
          "flex h-20 w-20 items-center justify-center rounded-full text-white transition-colors " +
          (recording ? "bg-(--color-negative)" : "bg-(--color-primary)")
        }
      >
        {recording ? <Square size={26} /> : <Mic size={26} />}
      </button>
      <p className="text-sm text-(--color-text-secondary)">
        {recording ? "Gravando... toque para parar" : file ? "Áudio pronto" : "Toque para gravar"}
      </p>

      <button
        onClick={() => inputRef.current?.click()}
        className="text-sm text-(--color-primary) underline underline-offset-2"
      >
        ou envie um arquivo de áudio
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={(e) => setUploadedFile(e.target.files?.[0] ?? null)}
      />

      <div className="flex gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          disabled={!file}
          onClick={() => {
            if (!file) return;
            const fd = new FormData();
            fd.set("file", file);
            onSubmit(fd);
          }}
        >
          Processar com IA
        </Button>
      </div>
    </div>
  );
}
