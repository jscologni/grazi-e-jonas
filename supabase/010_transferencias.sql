-- Transferência entre contas da casa: sai de uma, entra na outra. Não é gasto nem entrada (não mexe na sobra do mês).

create table public.transfers (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  from_account uuid not null references public.accounts on delete cascade,
  to_account   uuid not null references public.accounts on delete cascade,
  amount       numeric(12,2) not null check (amount > 0),
  occurred_on  date not null default current_date,
  member_id    uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  check (from_account <> to_account)
);

alter table public.transfers enable row level security;
create policy "casa" on public.transfers for all using (household_id = public.my_household()) with check (household_id = public.my_household());
alter table public.transfers replica identity full;
alter publication supabase_realtime add table public.transfers;

-- Extrato: o saldo recalculado passa a contar as transferências (mesma conta que o app faz)
create or replace function public.importar_extrato(
  p_conta uuid, p_inicio date, p_ate date, p_saldo numeric, p_linhas jsonb, p_vincular uuid[]
) returns numeric language plpgsql set search_path = public as $$
declare v_mov numeric; v_inicial numeric;
begin
  if public.my_household() is null then raise exception 'Entre na sua conta primeiro'; end if;
  if not exists (select 1 from public.accounts where id = p_conta) then raise exception 'Conta não encontrada'; end if;

  update public.transactions set account_id = p_conta
  where id = any(coalesce(p_vincular, '{}')) and account_id is null and method <> 'credito';

  insert into public.transactions (kind, amount, description, category_id, member_id, occurred_on, month, method, account_id, import_id, bill_id)
  select x.kind, x.amount, x.description, x.category_id, x.member_id, x.occurred_on, x.month, x.method, p_conta, x.import_id, x.bill_id
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb))
    as x(kind text, amount numeric, description text, category_id uuid, member_id uuid, occurred_on date, month date, method text, import_id text, bill_id uuid)
  on conflict (account_id, import_id) where import_id is not null do nothing;

  select coalesce(sum(case when kind = 'in' then amount when method <> 'credito' then -amount else 0 end), 0) into v_mov
  from public.transactions where account_id = p_conta and occurred_on between p_inicio and p_ate;
  v_mov := v_mov - coalesce((select sum(amount) from public.card_payments where account_id = p_conta and paid_on between p_inicio and p_ate), 0);
  v_mov := v_mov
    + coalesce((select sum(amount) from public.transfers where to_account = p_conta and occurred_on between p_inicio and p_ate), 0)
    - coalesce((select sum(amount) from public.transfers where from_account = p_conta and occurred_on between p_inicio and p_ate), 0);

  v_inicial := p_saldo - v_mov;
  update public.accounts set initial_balance = v_inicial, initial_date = p_inicio where id = p_conta;
  return v_inicial;
end $$;
