// Rodar: node tests/extrato.test.ts
import assert from 'node:assert/strict'
import { classificar, lerExtrato, valorBR } from '../src/lib/extrato.ts'

const REF = new Date(2026, 10, 8)

assert.equal(valorBR('1.234,56'), 1234.56)
assert.equal(valorBR('-50,00'), -50)
assert.equal(valorBR('R$ 10,00 D'), -10)
assert.equal(valorBR('- R$ 7,90'), -7.9)
assert.equal(valorBR('(5,00)'), -5)
assert.equal(valorBR('1234.56'), 1234.56)
assert.equal(valorBR('1,234.56'), 1234.56)
assert.ok(Number.isNaN(valorBR('abc')))

// OFX
const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261105120000[-3:BRT]<TRNAMT>4200.00<FITID>abc1<MEMO>Pagamento de salario
</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261106<TRNAMT>-386.52<FITID>abc2<NAME>GIASSI<MEMO>Compra no debito
</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>3813.48<DTASOF>20261107120000</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`
const a = lerExtrato(ofx, REF)
assert.equal(a.movs.length, 2)
assert.deepEqual([a.movs[0].data, a.movs[0].valor, a.movs[0].id], ['2026-11-05', 4200, 'abc1'])
assert.equal(a.movs[1].valor, -386.52)
assert.equal(a.movs[1].desc, 'GIASSI Compra no debito')
assert.equal(a.saldo, 3813.48)
assert.equal(a.saldoData, '2026-11-07')

// OFX de cartão é recusado com explicação
assert.match(lerExtrato('<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>', REF).erro ?? '', /fatura/)

// CSV da conta Nubank
const nu = `Data,Valor,Identificador,Descrição
01/11/2026,-50.00,id-1,"Transferência enviada pelo Pix - FULANO, DE TAL"
05/11/2026,4200.00,id-2,Transferência recebida
`
const b = lerExtrato(nu, REF)
assert.equal(b.movs.length, 2)
assert.deepEqual([b.movs[0].valor, b.movs[0].id], [-50, 'id-1'])
assert.equal(b.movs[0].desc, 'Transferência enviada pelo Pix - FULANO, DE TAL')

// CSV de fatura Nubank é recusado
assert.match(lerExtrato('date,title,amount\n2026-11-01,Padaria,10.00\n', REF).erro ?? '', /fatura/)

// CSV com colunas de crédito/débito e saldo, do mais novo para o mais velho
const bb = `Extrato conta corrente
Data;Histórico;Crédito;Débito;Saldo
07/11/2026;Pix enviado;;120,00;1.880,00
05/11/2026;Salário;2.000,00;;2.000,00
`
const c = lerExtrato(bb, REF)
assert.deepEqual(c.movs.map(m => m.valor), [-120, 2000])
assert.equal(c.saldo, 1880)
assert.equal(c.saldoData, '2026-11-07')

// Texto em linhas: data, descrição, valor e saldo
const tx = `Extrato de novembro
Data Histórico Valor Saldo
01/11/2026 Saldo anterior 1.000,00
03/11/2026 PIX ENVIADO FULANO 150,00 D 850,00 C
05/11/2026 CREDITO SALARIO 3.000,00 C 3.850,00 C
`
const d = lerExtrato(tx, REF)
assert.deepEqual(d.movs.map(m => [m.data, m.valor]), [['2026-11-03', -150], ['2026-11-05', 3000]])
assert.equal(d.movs.some(m => m.incerto), false)
assert.equal(d.saldo, 3850)

// Copiado do app: dia numa linha, descrição noutra, valor noutra
const app = `07 NOV 2026
Pix enviado
Mercado do Zé
- R$ 45,90
Pix recebido
Grazi
+ R$ 100,00
06/11
Compra no débito PADARIA
R$ 12,00
`
const e = lerExtrato(app, REF)
assert.deepEqual(e.movs.map(m => [m.data, m.valor, m.incerto]), [['2026-11-07', -45.9, false], ['2026-11-07', 100, false], ['2026-11-06', -12, true]])
assert.equal(e.movs[0].desc, 'Pix enviado Mercado do Zé')

// Extrato com seções (estilo PDF de banco digital)
const nubank = `01 NOV 2026 Total de entradas + 3.000,00
Transferência Recebida Fulano 3.000,00
Total de saídas - 80,00
Compra no débito Posto Shell 80,00
Saldo do dia 2.920,00
`
const f = lerExtrato(nubank, REF)
assert.deepEqual(f.movs.map(m => [m.valor, m.incerto]), [[3000, false], [-80, false]])
assert.equal(f.saldo, 2920)

// Dois movimentos idênticos no mesmo dia continuam sendo dois
const dup = lerExtrato('Data;Descrição;Valor\n01/11/2026;Pão;-5,00\n01/11/2026;Pão;-5,00\n', REF)
assert.equal(new Set(dup.movs.map(m => m.id)).size, 2)

// mês sem ano: dezembro visto em novembro é do ano passado
assert.equal(lerExtrato('20/12 COMPRA X 10,00', REF).movs[0].data, '2025-12-20')

assert.equal(lerExtrato('Olá, isto não é extrato.', REF).movs.length, 0)

assert.equal(classificar('Pagamento de fatura', -500).naoConta, 'pagamento de cartão')
assert.equal(classificar('Compra no débito GIASSI', -50).categoria, 'Mercado')
assert.equal(classificar('Compra no débito GIASSI', -50).metodo, 'debito')
assert.equal(classificar('Pagamento de salário', 3000).categoria, 'Salário')
assert.equal(classificar('Pix enviado Fulano', -10).metodo, 'pix')

console.log('ok: extratos OFX, CSV e texto lidos certo')
