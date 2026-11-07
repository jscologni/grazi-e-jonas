-- Código de barras junto do preço (vem da nota escaneada)

alter table public.prices add column ean text;
create index prices_ean_idx on public.prices (household_id, ean);
