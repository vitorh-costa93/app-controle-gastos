-- MeuDinheiro — permite apagar categoria/tipo de verdade (não só marcar active=false),
-- já que não existe tela pra reativar. Lançamentos e recorrências que usavam o item
-- apagado passam a ficar com category_id/type_id nulo ("Sem categoria"/"Sem tipo") em
-- vez de a operação falhar por causa da chave estrangeira.
set search_path = meudinheiro, public;

alter table transactions drop constraint if exists transactions_type_id_fkey;
alter table transactions add constraint transactions_type_id_fkey
  foreign key (type_id) references transaction_types(id) on delete set null;

alter table transactions drop constraint if exists transactions_category_id_fkey;
alter table transactions add constraint transactions_category_id_fkey
  foreign key (category_id) references categories(id) on delete set null;

alter table recurrence_rules drop constraint if exists recurrence_rules_type_id_fkey;
alter table recurrence_rules add constraint recurrence_rules_type_id_fkey
  foreign key (type_id) references transaction_types(id) on delete set null;

alter table recurrence_rules drop constraint if exists recurrence_rules_category_id_fkey;
alter table recurrence_rules add constraint recurrence_rules_category_id_fkey
  foreign key (category_id) references categories(id) on delete set null;
