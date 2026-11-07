-- Grazi e Jonas: estrutura do banco (Supabase / Postgres)
-- Tudo pertence a uma "casa" (household). Cada pessoa só enxerga a casa da qual é membro.

create extension if not exists unaccent with schema extensions;

-- ---------------------------------------------------------------- casa e membros
create table public.households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Nossa casa',
  invite_code text not null unique default upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6)),
  city        text not null default 'Criciúma',
  uf          text not null default 'SC',
  created_at  timestamptz not null default now()
);

create table public.members (
  household_id uuid not null references public.households on delete cascade,
  user_id      uuid not null unique references auth.users on delete cascade,
  name         text not null,
  fruit        text not null default 'tomate',
  created_at   timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- Casa de quem está logado (security definer evita recursão nas políticas de members)
create or replace function public.my_household() returns uuid
language sql stable security definer set search_path = public as $$
  select household_id from public.members where user_id = auth.uid() limit 1
$$;

-- ---------------------------------------------------------------- compras
create table public.markets (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  name         text not null,
  cnpj         text,
  address      text,
  created_at   timestamptz not null default now(),
  unique (household_id, name)
);

create table public.shopping_items (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  name         text not null,
  qty          numeric(10,3) not null default 1,
  unit         text not null default 'un',
  section      text not null default 'outros',
  note         text,
  checked      boolean not null default false,
  price        numeric(12,2),           -- preço unitário pago (modo mercado)
  added_by     uuid default auth.uid(),
  checked_by   uuid,
  checked_at   timestamptz,
  pantry_id    uuid,
  created_at   timestamptz not null default now()
);

create table public.trips (               -- uma ida ao mercado já fechada
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null default public.my_household() references public.households on delete cascade,
  market_id      uuid references public.markets on delete set null,
  total          numeric(12,2) not null default 0,
  items_count    int not null default 0,
  access_key     text,
  transaction_id uuid,
  created_by     uuid default auth.uid(),
  created_at     timestamptz not null default now()
);

create table public.prices (               -- histórico de preço por produto e mercado
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  market_id    uuid references public.markets on delete cascade,
  trip_id      uuid references public.trips on delete cascade,
  name         text not null,
  norm         text not null,
  unit         text not null default 'un',
  unit_price   numeric(12,2) not null check (unit_price >= 0),
  seen_at      timestamptz not null default now(),
  created_by   uuid default auth.uid()
);
create index prices_norm_idx on public.prices (household_id, norm);

-- ---------------------------------------------------------------- despensa e tarefas
create table public.pantry (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  name         text not null,
  section      text not null default 'outros',
  status       text not null default 'cheio' check (status in ('cheio','acabando','acabou')),
  updated_by   uuid default auth.uid(),
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

create table public.chores (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null default public.my_household() references public.households on delete cascade,
  name          text not null,
  emoji         text not null default '🧹',
  every_days    int not null default 7 check (every_days between 1 and 365),
  rotate        boolean not null default true,
  assignee      uuid,
  last_done_at  timestamptz,
  last_done_by  uuid,
  created_at    timestamptz not null default now()
);

create table public.chore_log (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  chore_id     uuid not null references public.chores on delete cascade,
  done_by      uuid not null default auth.uid(),
  done_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------- dinheiro
create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  name         text not null,
  emoji        text not null default '•',
  kind         text not null check (kind in ('in','out')),
  sort         int not null default 0,
  archived     boolean not null default false
);

create table public.cards (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  name         text not null,
  color        text not null default 'berinjela',
  closing_day  int not null check (closing_day between 1 and 31),
  due_day      int not null check (due_day between 1 and 31),
  limit_amount numeric(12,2),
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.bills (                 -- contas fixas do mês
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  name         text not null,
  emoji        text not null default '🧾',
  amount       numeric(12,2) not null default 0,
  due_day      int not null check (due_day between 1 and 31),
  variable     boolean not null default false,   -- luz/água: valor muda todo mês
  category_id  uuid references public.categories on delete set null,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.transactions (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  kind         text not null check (kind in ('in','out')),
  amount       numeric(12,2) not null check (amount > 0),
  description  text not null default '',
  category_id  uuid references public.categories on delete set null,
  member_id    uuid,                         -- quem ganhou / quem gastou
  occurred_on  date not null default current_date,   -- dia da compra / recebimento
  month        date not null,                -- mês em que pesa no caixa (1º dia)
  method       text not null default 'pix' check (method in ('pix','debito','credito','dinheiro','boleto','outro')),
  card_id      uuid references public.cards on delete set null,
  group_id     uuid,                         -- parcelas da mesma compra
  installment  int,
  installments int,
  bill_id      uuid references public.bills on delete set null,
  trip_id      uuid references public.trips on delete set null,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now()
);
create index transactions_month_idx on public.transactions (household_id, month);
create unique index transactions_bill_month_uq on public.transactions (bill_id, month) where bill_id is not null;

create table public.goals (                 -- caixinhas
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  name         text not null,
  emoji        text not null default '🫙',
  target       numeric(12,2) not null check (target > 0),
  deadline     date,
  color        text not null default 'abobora',
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.goal_moves (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  goal_id      uuid not null references public.goals on delete cascade,
  amount       numeric(12,2) not null check (amount <> 0),  -- negativo = retirada
  member_id    uuid default auth.uid(),
  month        date not null,
  note         text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------- segurança (RLS)
alter table public.households enable row level security;
alter table public.members    enable row level security;

create policy "ver minha casa"    on public.households for select using (id = public.my_household());
create policy "editar minha casa" on public.households for update using (id = public.my_household()) with check (id = public.my_household());
create policy "ver membros"       on public.members    for select using (household_id = public.my_household());
create policy "editar meu perfil" on public.members    for update using (user_id = auth.uid()) with check (user_id = auth.uid() and household_id = public.my_household());

do $$
declare t text;
begin
  foreach t in array array['markets','shopping_items','trips','prices','pantry','chores','chore_log',
                           'categories','cards','bills','transactions','goals','goal_moves']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "casa" on public.%I for all using (household_id = public.my_household()) with check (household_id = public.my_household())', t);
    execute format('alter table public.%I replica identity full', t);
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
end $$;
alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.households;

-- ---------------------------------------------------------------- criar casa / entrar com código
create or replace function public.seed_categories(h uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.categories (household_id, name, emoji, kind, sort) values
    (h,'Mercado','🛒','out',1),(h,'Casa','🏠','out',2),(h,'Contas','💡','out',3),
    (h,'Transporte','⛽','out',4),(h,'Saúde','💊','out',5),(h,'Comer fora','🍕','out',6),
    (h,'Lazer','🎬','out',7),(h,'Roupas','👕','out',8),(h,'Pets','🐾','out',9),
    (h,'Presentes','🎁','out',10),(h,'Outros','📦','out',99),
    (h,'Salário','💼','in',1),(h,'Extra','✨','in',2),(h,'Reembolso','↩️','in',3),(h,'Outros','📦','in',99);
$$;

create or replace function public.create_household(p_name text, p_member text, p_fruit text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'Você já faz parte de uma casa';
  end if;
  insert into public.households (name) values (coalesce(nullif(trim(p_name),''),'Nossa casa')) returning * into h;
  insert into public.members (household_id, user_id, name, fruit) values (h.id, auth.uid(), trim(p_member), p_fruit);
  perform public.seed_categories(h.id);
  return h;
end $$;

create or replace function public.join_household(p_code text, p_member text, p_fruit text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'Você já faz parte de uma casa';
  end if;
  select * into h from public.households where invite_code = upper(trim(p_code));
  if h.id is null then raise exception 'Código não encontrado. Confira as 6 letras e números.'; end if;
  if (select count(*) from public.members where household_id = h.id) >= 6 then
    raise exception 'Essa casa já está cheia';
  end if;
  insert into public.members (household_id, user_id, name, fruit) values (h.id, auth.uid(), trim(p_member), p_fruit);
  return h;
end $$;

revoke execute on function public.seed_categories(uuid) from public, anon, authenticated;
grant execute on function public.create_household(text,text,text), public.join_household(text,text,text) to authenticated;

-- ---------------------------------------------------------------- despensa → lista de compras
create or replace function public.pantry_to_list() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('acabando','acabou') and (tg_op = 'INSERT' or old.status = 'cheio') then
    if not exists (
      select 1 from public.shopping_items s
      where s.household_id = new.household_id and not s.checked
        and lower(extensions.unaccent(s.name)) = lower(extensions.unaccent(new.name))
    ) then
      insert into public.shopping_items (household_id, name, section, pantry_id, added_by)
      values (new.household_id, new.name, new.section, new.id, auth.uid());
    end if;
  end if;
  return new;
end $$;

create trigger pantry_to_list after insert or update of status on public.pantry
for each row execute function public.pantry_to_list();
