export type Direction = "income" | "expense";
export type FixedVariable = "fixed" | "variable";
export type TransactionSource = "manual" | "audio" | "photo" | "text" | "pdf" | "csv";
export type UploadedFileStatus =
  | "received"
  | "processing"
  | "processed"
  | "review_needed"
  | "confirmed"
  | "error";
export type AiJobStatus = "queued" | "processing" | "completed" | "error";
export type FieldConfidence = "alta" | "media" | "baixa";

export interface Person {
  id: string;
  name: string;
  initials: string;
  color: string;
  active: boolean;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  active: boolean;
  created_at: string;
}

export interface TransactionType {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface RecurrenceRule {
  id: string;
  description: string;
  person_id: string;
  direction: Direction;
  type_id: string | null;
  category_id: string | null;
  amount: string; // numeric from postgres
  frequency: "monthly" | "bimonthly" | "quarterly" | "semiannual" | "annual";
  start_date: string;
  end_date: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TransactionRow {
  id: string;
  registration_date: string;
  reference_month: string; // "YYYY-MM"
  person_id: string;
  direction: Direction;
  fixed_variable: FixedVariable;
  type_id: string | null;
  category_id: string | null;
  installment_current: number;
  installment_total: number;
  amount: string; // numeric from postgres
  description: string | null;
  considered: boolean;
  source: TransactionSource;
  ai_confidence: Record<string, FieldConfidence> | null;
  recurrence_rule_id: string | null;
  installment_group_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UploadedFileRow {
  id: string;
  storage_path: string | null;
  source_type: "audio" | "photo" | "text" | "pdf" | "csv";
  status: UploadedFileStatus;
  raw_text: string | null;
  created_at: string;
}

export interface AiProcessingJobRow {
  id: string;
  uploaded_file_id: string | null;
  status: AiJobStatus;
  error: string | null;
  created_at: string;
  processed_at: string | null;
}

export interface AiExtractedTransactionRow {
  id: string;
  ai_processing_job_id: string;
  extracted_data: ExtractedTransactionData;
  confidence: Record<string, FieldConfidence> | null;
  included: boolean;
  reviewed: boolean;
  final_transaction_id: string | null;
  created_at: string;
}

export interface ExtractedTransactionData {
  registration_date: string | null;
  reference_month: string | null;
  person_id: string | null;
  person_name?: string | null;
  direction: Direction | null;
  fixed_variable: FixedVariable | null;
  type_id: string | null;
  type_name?: string | null;
  category_id: string | null;
  category_name?: string | null;
  installment_current: number;
  installment_total: number;
  amount: number | null; // reais, não centavos
  description: string | null;
}

export interface SimulationRow {
  id: string;
  description: string;
  total_amount: string;
  installments: number;
  start_date: string;
  active: boolean;
  ai_summary: string | null;
  ai_summary_generated_at: string | null;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettingsRow {
  id: number;
  currency: string;
  projection_horizon_months: number;
  updated_at: string;
}
