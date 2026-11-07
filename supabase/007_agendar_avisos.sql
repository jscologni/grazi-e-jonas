-- Roda a função de avisos todo dia às 8h de Brasília (11h UTC).
-- A chave usada é a pública do app (a mesma que fica no código do site); a função não devolve dados.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('avisos-diarios', '0 11 * * *', $$
  select net.http_post(
    url     := 'https://hwlhdgioxlmiucmtgtom.supabase.co/functions/v1/avisos',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_328WWUUGZs_ywwb7zL_WzQ_gkjjE5yy"}'::jsonb,
    body    := '{"modo": "diario"}'::jsonb
  );
$$);
