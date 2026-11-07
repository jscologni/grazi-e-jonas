-- Avisos no celular (Web Push): inscrições, controle de envio e chave da função.

create table public.push_subs (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.my_household() references public.households on delete cascade,
  user_id      uuid not null default auth.uid(),
  endpoint     text not null unique,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now()
);
alter table public.push_subs enable row level security;
create policy "minhas inscrições" on public.push_subs for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and household_id = public.my_household());

-- um aviso por casa por dia (a função consulta antes de mandar)
create table public.avisos_enviados (
  household_id uuid not null references public.households on delete cascade,
  chave        text not null,
  dia          date not null,
  primary key (household_id, chave, dia)
);
alter table public.avisos_enviados enable row level security;   -- sem políticas: só a função (service role) mexe

-- chave VAPID gerada pela própria função na primeira vez (ninguém precisa copiar)
create table public.config_privada (
  nome  text primary key,
  valor jsonb not null
);
alter table public.config_privada enable row level security;    -- sem políticas: só a função lê
