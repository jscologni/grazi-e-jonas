-- Gravações "tudo ou nada" (compra e nota) e importação do extrato do banco.

alter table public.transactions add column import_id text;
create unique index transactions_import_uq on public.transactions (account_id, import_id) where import_id is not null;

-- Compra / nota: ou grava tudo, ou nada. Repetir com o mesmo p_trip não duplica.
create or replace function public.guardar_compra(
  p_trip uuid, p_market uuid, p_total numeric, p_itens int, p_chave text,
  p_precos jsonb, p_tx jsonb, p_apagar uuid[]
) returns uuid language plpgsql set search_path = public as $$
declare v_tx uuid;
begin
  if public.my_household() is null then raise exception 'Entre na sua conta primeiro'; end if;
  if exists (select 1 from public.trips where id = p_trip) then return p_trip; end if;

  insert into public.trips (id, market_id, total, items_count, access_key)
  values (p_trip, p_market, coalesce(p_total, 0), coalesce(p_itens, 0), nullif(p_chave, ''));

  insert into public.prices (market_id, trip_id, name, norm, unit, unit_price, ean, seen_at)
  select p_market, p_trip, x.name, x.norm, coalesce(x.unit, 'un'), x.unit_price, x.ean, coalesce(x.seen_at, now())
  from jsonb_to_recordset(coalesce(p_precos, '[]'::jsonb))
    as x(name text, norm text, unit text, unit_price numeric, ean text, seen_at timestamptz);

  if p_tx is not null and jsonb_typeof(p_tx) = 'object' then
    insert into public.transactions (kind, amount, description, category_id, member_id, occurred_on, month, method, card_id, installment, installments, account_id, trip_id)
    select 'out', x.amount, x.description, x.category_id, x.member_id, x.occurred_on, x.month, x.method, x.card_id, x.installment, x.installments, x.account_id, p_trip
    from jsonb_to_record(p_tx)
      as x(amount numeric, description text, category_id uuid, member_id uuid, occurred_on date, month date, method text, card_id uuid, installment int, installments int, account_id uuid)
    returning id into v_tx;
    update public.trips set transaction_id = v_tx where id = p_trip;
  end if;

  update public.pantry set status = 'cheio', updated_at = now()
  where id in (select pantry_id from public.shopping_items where id = any(coalesce(p_apagar, '{}')) and pantry_id is not null);
  delete from public.shopping_items where id = any(coalesce(p_apagar, '{}'));
  return p_trip;
end $$;

-- Extrato: grava os movimentos escolhidos e recalcula o saldo inicial para a conta bater com o banco.
create or replace function public.importar_extrato(
  p_conta uuid, p_inicio date, p_ate date, p_saldo numeric, p_linhas jsonb, p_vincular uuid[]
) returns numeric language plpgsql set search_path = public as $$
declare v_mov numeric; v_inicial numeric;
begin
  if public.my_household() is null then raise exception 'Entre na sua conta primeiro'; end if;
  if not exists (select 1 from public.accounts where id = p_conta) then raise exception 'Conta não encontrada'; end if;

  -- lançamentos que já existiam e são o mesmo movimento do extrato passam a pertencer à conta
  update public.transactions set account_id = p_conta
  where id = any(coalesce(p_vincular, '{}')) and account_id is null and method <> 'credito';

  insert into public.transactions (kind, amount, description, category_id, member_id, occurred_on, month, method, account_id, import_id, bill_id)
  select x.kind, x.amount, x.description, x.category_id, x.member_id, x.occurred_on, x.month, x.method, p_conta, x.import_id, x.bill_id
  from jsonb_to_recordset(coalesce(p_linhas, '[]'::jsonb))
    as x(kind text, amount numeric, description text, category_id uuid, member_id uuid, occurred_on date, month date, method text, import_id text, bill_id uuid)
  on conflict (account_id, import_id) where import_id is not null do nothing;

  -- saldo no fim do extrato = inicial + movimentos do período (mesma conta que o app faz)
  select coalesce(sum(case when kind = 'in' then amount when method <> 'credito' then -amount else 0 end), 0) into v_mov
  from public.transactions where account_id = p_conta and occurred_on between p_inicio and p_ate;
  v_mov := v_mov - coalesce((select sum(amount) from public.card_payments where account_id = p_conta and paid_on between p_inicio and p_ate), 0);

  v_inicial := p_saldo - v_mov;
  update public.accounts set initial_balance = v_inicial, initial_date = p_inicio where id = p_conta;
  return v_inicial;
end $$;

revoke execute on function public.guardar_compra(uuid, uuid, numeric, int, text, jsonb, jsonb, uuid[]) from public, anon;
revoke execute on function public.importar_extrato(uuid, date, date, numeric, jsonb, uuid[]) from public, anon;
grant execute on function public.guardar_compra(uuid, uuid, numeric, int, text, jsonb, jsonb, uuid[]) to authenticated;
grant execute on function public.importar_extrato(uuid, date, date, numeric, jsonb, uuid[]) to authenticated;
