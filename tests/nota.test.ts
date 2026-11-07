// Rodar: node tests/nota.test.ts
import assert from 'node:assert/strict'
import { ehEan, lerNota } from '../src/lib/nota.ts'

// 1) portal nacional, como sai ao copiar a página no celular
const portal = `SUPERMERCADO EXEMPLO LTDA
CNPJ: 12.345.678/0001-90 , RUA CENTRAL, 100, CENTRO, CRICIUMA, SC
Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica
CAFE PILAO TRAD VACUO 500G
(Código: 7896089011357 )
Qtde.:2	UN: UN	Vl. Unit.:   21,6	Vl. Total
43,20
BANANA CATURRA KG
(Código: 1234 )
Qtde.:1,356	UN: KG	Vl. Unit.:   3,49	Vl. Total
4,73
LEITE UHT INT TIROL 1L
(Código: 7896051111016 )
Qtde.:6	UN: UN	Vl. Unit.:   4,79	Vl. Total
28,74
Qtd. total de itens:	3
Valor total R$:	76,67
Descontos R$:	0,00
Valor a pagar R$:	76,67
Emissão: 07/11/2026 18:22:10 - Via Consumidor`
const a = lerNota(portal)
assert.equal(a.itens.length, 3)
assert.equal(a.itens[0].nome, 'Cafe Pilao Trad Vacuo 500G')
assert.equal(a.itens[0].ean, '7896089011357')
assert.equal(a.itens[0].qtd, 2)
assert.equal(a.itens[0].unit, 21.6)
assert.equal(a.itens[1].un, 'kg')
assert.equal(a.itens[1].ean, null)
assert.equal(a.total, 76.67)
assert.equal(a.cnpj, '12345678000190')
assert.equal(a.mercado, 'Supermercado Exemplo Ltda')
assert.equal(a.data, '2026-11-07')

// 2) tabela em uma linha por item (tabs)
const tabela = `Código	Descrição	Qtde	Un	Vl Unit	Vl Total
7896089011357	CAFE PILAO TRAD 500G	1,0000	UN	21,60	21,60
7891022100754	DETERGENTE YPE NEUTRO 500ML	3,0000	UN	2,39	7,17
000123	PAO FRANCES KG	0,512	KG	14,99	7,67
Valor a pagar R$ 36,44`
const b = lerNota(tabela)
assert.equal(b.itens.length, 3)
assert.equal(b.itens[1].nome, 'Detergente Ype Neutro 500ml')
assert.equal(b.itens[1].qtd, 3)
assert.equal(b.itens[2].qtd, 0.512)
assert.equal(b.total, 36.44)

// 3) cada célula da tabela numa linha
const celulas = `7896089011357
CAFE PILAO TRAD 500G
1
UN
21,60
21,60
7891022100754
DETERGENTE YPE
2
UN
2,39
4,78`
const c = lerNota(celulas)
assert.equal(c.itens.length, 2)
assert.equal(c.itens[0].ean, '7896089011357')
assert.equal(c.itens[1].total, 4.78)

// texto qualquer não vira produto
assert.equal(lerNota('Olá, isto não é uma nota fiscal.').itens.length, 0)

assert.ok(ehEan('7896089011357'))
assert.ok(!ehEan('7896089011358'))
console.log('ok: 3 formatos de nota lidos certo')
