-- Cartão alimentação: um tipo de conta e uma forma de pagamento.

alter table public.accounts add column kind text not null default 'conta' check (kind in ('conta', 'alimentacao'));

alter table public.transactions drop constraint transactions_method_check;
alter table public.transactions add constraint transactions_method_check
  check (method in ('pix', 'debito', 'credito', 'dinheiro', 'boleto', 'outro', 'vale'));
