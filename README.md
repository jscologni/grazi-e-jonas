# Grazi e Jonas

App da casa para o casal: lista de compras com preços dos mercados, despensa, tarefas e o dinheiro do mês.
Funciona no navegador e pode ser instalado na tela inicial do celular (PWA).

**Endereço:** https://jscologni.github.io/grazi-e-jonas/

## O que tem

- **Feira**: lista compartilhada em tempo real, separada por seção do mercado. Escreva vários itens de uma vez
  ("2 leite, pão, café 500g"). No modo mercado, cada item posto no carrinho pede o preço; ao fechar a compra,
  os preços viram histórico por mercado e o total pode ser lançado como gasto. O QR da nota fiscal identifica
  o mercado pelo CNPJ. "Onde sai mais barato" compara a lista atual entre os mercados.
- **Dinheiro**: caixa único do casal. Entradas e gastos de cada um, contas fixas com vencimento, cartões com
  fechamento/vencimento e compras parceladas caindo na fatura certa, caixinhas (metas) e gasto por categoria.
- **Casa**: despensa (marcar "acabando" manda o item para a lista) e tarefas com rodízio e placar do mês.

## Como funciona por dentro

- React + Vite + TypeScript, animações com Motion, PWA com vite-plugin-pwa.
- Banco, login e tempo real no Supabase (projeto `grazi-e-jonas`, região São Paulo).
  A estrutura do banco está em [`supabase/schema.sql`](supabase/schema.sql). Cada pessoa só enxerga os dados
  da casa de que é membro (Row Level Security).
- Publicado no GitHub Pages pelo ramo `gh-pages`: rode `npm run publicar`.

## Rodar no computador

```bash
npm install
npm run dev
```

Abre em http://localhost:5173/grazi-e-jonas/

## Preços dos mercados em SC

O portal da nota fiscal de Santa Catarina exige verificação anti-robô, então o app não lê os itens da nota
sozinho. Os preços vêm do modo mercado (vocês anotam ao pôr no carrinho). O app oficial
[Menor Preço Brasil](https://www.sef.sc.gov.br/servicos/instalar-o-aplicativo-menor-preco-brasil) da SEF/SC
compara preços de outros consumidores, mas não tem acesso aberto para outros apps.
