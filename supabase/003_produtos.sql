-- Produto exato (código de barras) escolhido para um item da lista, para comparar nos sites dos mercados.

alter table public.shopping_items add column ean text;
alter table public.shopping_items add column product text;

-- "café" → sempre o Café Pilão Tradicional 500g: a escolha fica lembrada para as próximas vezes
create table public.product_picks (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  norm         text not null,
  ean          text not null,
  product      text not null,
  created_at   timestamptz not null default now(),
  unique (household_id, norm)
);
alter table public.product_picks enable row level security;
create policy "casa" on public.product_picks for all using (household_id = public.my_household()) with check (household_id = public.my_household());
alter table public.product_picks replica identity full;
alter publication supabase_realtime add table public.product_picks;
