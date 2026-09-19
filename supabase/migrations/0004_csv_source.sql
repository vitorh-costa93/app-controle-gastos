-- MeuDinheiro — permite "csv" como origem de lançamento/upload (importação de extrato/fatura em CSV)
set search_path = meudinheiro, public;

alter table transactions drop constraint if exists transactions_source_check;
alter table transactions add constraint transactions_source_check
  check (source in ('manual', 'audio', 'photo', 'text', 'pdf', 'csv'));

alter table uploaded_files drop constraint if exists uploaded_files_source_type_check;
alter table uploaded_files add constraint uploaded_files_source_type_check
  check (source_type in ('audio', 'photo', 'text', 'pdf', 'csv'));
