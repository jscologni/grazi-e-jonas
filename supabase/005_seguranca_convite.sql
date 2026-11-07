-- Convite mais seguro: casa de no máximo 2 pessoas, 10 tentativas de código por hora, código de 8 caracteres.

-- código sem letras/números que se confundem (0/O, 1/I/L)
create or replace function public.novo_codigo() returns text language sql volatile as $$
  select string_agg(substr('ABCDEFGHJKMNPQRSTUVWXYZ23456789', 1 + floor(random() * 31)::int, 1), '')
  from generate_series(1, 8)
$$;
alter table public.households alter column invite_code set default public.novo_codigo();
update public.households set invite_code = public.novo_codigo();

-- tentativas erradas de código (só as funções do banco enxergam)
create table public.join_attempts (
  user_id uuid not null,
  at      timestamptz not null default now()
);
create index join_attempts_idx on public.join_attempts (user_id, at);
alter table public.join_attempts enable row level security;

create or replace function public.join_household(p_code text, p_member text, p_fruit text)
returns public.households language plpgsql security definer set search_path = public as $$
declare h public.households;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta primeiro'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'Você já faz parte de uma casa';
  end if;
  if (select count(*) from public.join_attempts where user_id = auth.uid() and at > now() - interval '1 hour') >= 10 then
    raise exception 'Muitas tentativas. Espere uma hora e confira o código com quem te convidou.';
  end if;
  select * into h from public.households where invite_code = upper(regexp_replace(p_code, '\s', '', 'g'));
  if h.id is null then
    -- registra a tentativa e devolve vazio (sem erro, para a tentativa não ser desfeita)
    insert into public.join_attempts (user_id) values (auth.uid());
    return null;
  end if;
  if (select count(*) from public.members where household_id = h.id) >= 2 then
    raise exception 'Essa casa já tem as duas pessoas.';
  end if;
  insert into public.members (household_id, user_id, name, fruit) values (h.id, auth.uid(), trim(p_member), p_fruit);
  return h;
end $$;

revoke execute on function public.novo_codigo() from public, anon, authenticated;
