-- MeuDinheiro — marcação manual de "fora do planejado" na Análise
set search_path = meudinheiro, public;

-- true = o usuário marcou este lançamento como planejado/essencial: não entra em "Fora do planejado".
alter table transactions add column if not exists unplanned_excluded boolean not null default false;
