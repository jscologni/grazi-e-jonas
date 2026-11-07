-- Contas bancárias de cada um (com saldo inicial) e pagamentos de fatura de cartão.

create table public.accounts (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null default public.my_household() references public.households on delete cascade,
  name            text not null,
  owner           uuid,                                   -- de quem é a conta (user_id do membro)
  initial_balance numeric(12,2) not null default 0,
  initial_date    date not null default current_date,     -- lançamentos a partir deste dia mexem no saldo
  archived        boolean not null default false,
  created_at      timestamptz not null default now()
);

alter table public.transactions add column account_id uuid references public.accounts on delete set null;

create table public.card_payments (                       -- pagar fatura: sai da conta, abate da fatura
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  card_id      uuid not null references public.cards on delete cascade,
  account_id   uuid references public.accounts on delete set null,
  amount       numeric(12,2) not null check (amount > 0),
  month        date not null,                              -- fatura (mês de vencimento) que foi paga
  paid_on      date not null default current_date,
  member_id    uuid default auth.uid(),
  created_at   timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['accounts','card_payments'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "casa" on public.%I for all using (household_id = public.my_household()) with check (household_id = public.my_household())', t);
    execute format('alter table public.%I replica identity full', t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;
