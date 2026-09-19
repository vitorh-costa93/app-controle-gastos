-- Bucket privado para áudio/foto/PDF enviados pelo usuário.
-- Nome prefixado (não "uploads") para não colidir com buckets de outro uso
-- que já exista neste mesmo projeto Supabase.
-- Sem policies públicas: leitura/escrita só via service role (backend),
-- URLs assinadas temporárias quando o frontend precisar exibir/baixar um arquivo.
insert into storage.buckets (id, name, public)
values ('meudinheiro-uploads', 'meudinheiro-uploads', false)
on conflict (id) do nothing;
