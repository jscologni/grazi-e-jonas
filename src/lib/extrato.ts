// Lê o extrato do banco: arquivo OFX, planilha CSV ou texto (copiado do app do banco ou tirado de um PDF).

export interface Mov { data: string; desc: string; valor: number; id: string; incerto: boolean }
export interface Extrato { movs: Mov[]; saldo: number | null; saldoData: string | null; erro: string | null }
type Bruto = Omit<Mov, 'id' | 'incerto'> & { id?: string | null; incerto?: boolean }

const semAcento = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const pad = (n: number) => String(n).padStart(2, '0')
const MESES: Record<string, number> = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 }

/** "1.234,56" · "-50,00" · "R$ 10,00 D" · "(5,00)" · "1234.56" → número com sinal (NaN se não for valor) */
export function valorBR(bruto: string): number {
  let s = bruto.replace(/ /g, ' ').replace(/R\$/gi, '').trim()
  if (!s) return NaN
  let neg = false
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1).trim() }
  const fim = s.match(/\s*([DCdc+\-−])$/)
  if (fim) { if (/[Dd\-−]/.test(fim[1])) neg = true; s = s.slice(0, -fim[0].length).trim() }
  const ini = s.match(/^([+\-−])\s*/)
  if (ini) { if (ini[1] !== '+') neg = true; s = s.slice(ini[0].length).trim() }
  if (!/^\d[\d.,]*$/.test(s)) return NaN
  const virgula = s.lastIndexOf(','), ponto = s.lastIndexOf('.')
  let n: number
  if (virgula >= 0 && virgula > ponto) n = Number(s.replace(/\./g, '').replace(',', '.'))
  else if (ponto >= 0 && virgula >= 0) n = Number(s.replace(/,/g, ''))
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = Number(s.replace(/\./g, ''))
  else n = Number(s)
  return neg ? -n : n
}

const valida = (a: number, m: number, d: number) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${a}-${pad(m)}-${pad(d)}` : null)
const anoDe = (m: number, ref: Date) => (m > ref.getMonth() + 1 ? ref.getFullYear() - 1 : ref.getFullYear())

/** Data no começo do texto. Devolve a data e o que sobrou da linha. */
export function extrairData(l: string, ref: Date): { data: string; resto: string } | null {
  let m = l.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ][\d:.Z+-]*)?/)
  if (m) { const d = valida(+m[1], +m[2], +m[3]); return d ? { data: d, resto: l.slice(m[0].length).trim() } : null }
  m = l.match(/^(\d{2})[/.-](\d{2})[/.-](\d{4}|\d{2})(?!\d)/)
  if (m) { const d = valida(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]); return d ? { data: d, resto: l.slice(m[0].length).trim() } : null }
  m = l.match(/^(\d{2})\/(\d{2})(?![\d/])/)
  if (m) { const d = valida(anoDe(+m[2], ref), +m[2], +m[1]); return d ? { data: d, resto: l.slice(m[0].length).trim() } : null }
  m = l.match(/^(\d{1,2})\s+(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?(?:\s+(?:de\s+)?(\d{4}))?(?![a-z])/i)
  if (m) {
    const mes = MESES[m[2].toLowerCase()]
    const d = valida(m[3] ? +m[3] : anoDe(mes, ref), mes, +m[1])
    return d ? { data: d, resto: l.slice(m[0].length).trim() } : null
  }
  return null
}

const limpaDesc = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s\-–•|]+|[\s\-–•|]+$/g, '').slice(0, 90)

function finalizar(brutos: Bruto[], saldos: { data: string | null; v: number }[]): Extrato {
  const vistos = new Map<string, number>()
  const movs = brutos.filter(b => b.valor !== 0 && Number.isFinite(b.valor)).map(b => {
    const base = `${b.data}|${b.valor.toFixed(2)}|${semAcento(b.desc).replace(/[^a-z0-9]/g, '').slice(0, 40)}`
    const n = (vistos.get(base) ?? 0) + 1
    vistos.set(base, n)
    return { data: b.data, desc: b.desc, valor: Math.round(b.valor * 100) / 100, id: b.id || `h:${base}:${n}`, incerto: !!b.incerto }
  })
  // extrato pode vir do mais novo para o mais velho
  const decrescente = movs.length > 1 && movs[0].data > movs[movs.length - 1].data
  const datados = saldos.filter(s => s.data) as { data: string; v: number }[]
  let saldo: number | null = null, saldoData: string | null = null
  if (datados.length) {
    const max = datados.reduce((a, s) => (s.data > a ? s.data : a), '')
    const doDia = datados.filter(s => s.data === max)
    saldo = (decrescente ? doDia[0] : doDia[doDia.length - 1]).v
    saldoData = max
  }
  return { movs, saldo, saldoData, erro: null }
}

function ofx(t: string): Extrato | null {
  if (!/<OFX>|OFXHEADER|<STMTTRN>/i.test(t)) return null
  if (/<CCSTMT/i.test(t)) return { movs: [], saldo: null, saldoData: null, erro: 'Esse arquivo é da fatura do cartão. Aqui vai o extrato da conta; a fatura fica em Cartões.' }
  const tag = (b: string, n: string) => b.match(new RegExp(`<${n}>([^<\\r\\n]*)`, 'i'))?.[1]?.trim() ?? ''
  const data8 = (s: string) => (/^\d{8}/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null)
  const brutos: Bruto[] = []
  for (const b of t.split(/<STMTTRN>/i).slice(1)) {
    const data = data8(tag(b, 'DTPOSTED'))
    const valor = Number(tag(b, 'TRNAMT').replace(',', '.'))
    if (!data || !Number.isFinite(valor)) continue
    const nome = tag(b, 'NAME'), memo = tag(b, 'MEMO')
    brutos.push({ data, valor, desc: limpaDesc(nome && memo && nome !== memo ? `${nome} ${memo}` : memo || nome || 'Movimento'), id: tag(b, 'FITID') || null })
  }
  const saldos: { data: string | null; v: number }[] = []
  const led = t.match(/<LEDGERBAL>([\s\S]*?)(?:<\/LEDGERBAL>|<AVAILBAL>|$)/i)?.[1]
  if (led) {
    const v = Number(tag(led, 'BALAMT').replace(',', '.'))
    if (tag(led, 'BALAMT') && Number.isFinite(v)) saldos.push({ data: data8(tag(led, 'DTASOF')) ?? brutos.map(b => b.data).sort().pop() ?? null, v })
  }
  return finalizar(brutos, saldos)
}

function dividir(linha: string, sep: string) {
  const out: string[] = []
  let cur = '', aspas = false
  for (let i = 0; i < linha.length; i++) {
    const c = linha[i]
    if (c === '"') { if (aspas && linha[i + 1] === '"') { cur += '"'; i++ } else aspas = !aspas }
    else if (c === sep && !aspas) { out.push(cur.trim()); cur = '' }
    else cur += c
  }
  out.push(cur.trim())
  return out
}

function csv(t: string, ref: Date): Extrato | null {
  const linhas = t.split(/\r?\n/).filter(l => l.trim())
  let cab = -1, sep = ';'
  for (let i = 0; i < Math.min(15, linhas.length); i++) {
    for (const s of [';', ',', '\t']) {
      const cols = dividir(linhas[i], s).map(semAcento)
      if (cols.length >= 3 && cols.some(c => /^(data|date|dt)\b/.test(c)) && cols.some(c => /valor|value|amount|credito|debito/.test(c))) { cab = i; sep = s; break }
    }
    if (cab >= 0) break
  }
  if (cab < 0) return null
  const cols = dividir(linhas[cab], sep).map(semAcento)
  const achar = (re: RegExp, nao?: RegExp) => cols.findIndex(c => re.test(c) && !(nao && nao.test(c)))
  const iData = achar(/^(data|date|dt)\b/)
  const iValor = achar(/^(valor|value|amount|quantia)/, /saldo/)
  const iCred = achar(/credito|entrada/), iDeb = achar(/debito|saida/)
  const iDesc = achar(/descri|histor|memo|lancamento|detalh|title/, /^data/)
  const iId = achar(/identificador|^id$|^documento|^doc/)
  const iSaldo = achar(/saldo/)
  const iTipo = achar(/^(tipo|d\/c|c\/d|natureza)$/)
  if (cols.includes('title') && !cols.some(c => /identificador/.test(c)) && cols.includes('amount'))
    return { movs: [], saldo: null, saldoData: null, erro: 'Esse arquivo é da fatura do cartão. Aqui vai o extrato da conta; a fatura fica em Cartões.' }
  const brutos: Bruto[] = []
  const saldos: { data: string | null; v: number }[] = []
  for (const l of linhas.slice(cab + 1)) {
    const c = dividir(l, sep)
    const d = extrairData(c[iData] ?? '', ref)
    if (!d) continue
    const desc = limpaDesc(iDesc >= 0 ? c[iDesc] ?? '' : '')
    let valor = iValor >= 0 ? valorBR(c[iValor] ?? '') : NaN
    if (!Number.isFinite(valor)) {
      const cr = iCred >= 0 ? valorBR(c[iCred] ?? '') : NaN, db = iDeb >= 0 ? valorBR(c[iDeb] ?? '') : NaN
      valor = Number.isFinite(cr) && cr !== 0 ? Math.abs(cr) : Number.isFinite(db) && db !== 0 ? -Math.abs(db) : NaN
    }
    if (iSaldo >= 0) { const s = valorBR(c[iSaldo] ?? ''); if (Number.isFinite(s)) saldos.push({ data: d.data, v: s }) }
    if (!Number.isFinite(valor)) continue
    if (/^saldo/i.test(semAcento(desc))) { saldos.push({ data: d.data, v: valor }); continue }
    if (iTipo >= 0 && /^d/i.test(c[iTipo] ?? '') && valor > 0) valor = -valor
    brutos.push({ data: d.data, valor, desc: desc || 'Movimento', id: iId >= 0 ? c[iId] || null : null })
  }
  return brutos.length ? finalizar(brutos, saldos) : null
}

const RE_VALOR = /(?:^|\s)((?:[+\-−]\s*)?(?:R\$\s*)?(?:[+\-−]\s*)?\d{1,3}(?:\.\d{3})*,\d{2}(?:\s?[DCdc]\b|-)?)(?=\s|$)/g

/** Valores no fim da linha: [movimento] ou [movimento, saldo] */
function valoresNoFim(l: string) {
  const achados = [...l.matchAll(RE_VALOR)]
  if (!achados.length) return null
  const ult = achados[achados.length - 1]
  if ((ult.index ?? 0) + ult[0].length !== l.length) return null
  const antes = achados.length > 1 ? achados[achados.length - 2] : null
  const colado = antes && l.slice((antes.index ?? 0) + antes[0].length, ult.index).trim() === ''
  const mov = colado ? antes : ult
  return { texto: l.slice(0, mov.index).trim(), tok: mov[1], saldo: colado ? valorBR(ult[1]) : null }
}

function texto(t: string, ref: Date): Extrato {
  const brutos: Bruto[] = []
  const saldos: { data: string | null; v: number }[] = []
  let cur: string | null = null, pend = '', secao = 0
  for (const bruta of t.split(/\r?\n/)) {
    const l = bruta.replace(/\s+/g, ' ').trim()
    if (!l) continue
    let resto = l
    const d = extrairData(l, ref)
    if (d) { if (d.data !== cur) secao = 0; cur = d.data; resto = d.resto; pend = '' }
    if (!resto) continue
    const v = valoresNoFim(resto)
    if (!v) { pend = `${pend} ${resto}`.trim().slice(-90); continue }
    const desc = limpaDesc(v.texto || pend)
    const chave = semAcento(desc)
    pend = ''
    if (/total de entradas/.test(chave)) { secao = 1; continue }
    if (/total de saidas/.test(chave)) { secao = -1; continue }
    if (/^saldo|saldo (do dia|final|anterior|inicial|em )/.test(chave)) {
      if (!/anterior|inicial/.test(chave) && cur) saldos.push({ data: cur, v: valorBR(v.tok) })
      continue
    }
    if (!cur || !desc || /^(total|subtotal)/.test(chave)) continue
    const n = valorBR(v.tok)
    if (!Number.isFinite(n)) continue
    const explicito = /[+\-−]|[DCdc]$/.test(v.tok.replace(/R\$/gi, '').trim().replace(/^\d[\d.,]*$/, ''))
    let valor = n, incerto = false
    if (!explicito) {
      if (secao) valor = secao * Math.abs(n)
      else { valor = /recebid|deposito|salario|estorno|rendimento|credito em|reembolso|resgate/.test(chave) ? Math.abs(n) : -Math.abs(n); incerto = true }
    }
    brutos.push({ data: cur, valor, desc, incerto })
    if (v.saldo != null && Number.isFinite(v.saldo)) saldos.push({ data: cur, v: v.saldo })
  }
  return finalizar(brutos, saldos)
}

export function lerExtrato(conteudo: string, ref = new Date()): Extrato {
  const t = conteudo.replace(/^﻿/, '').replace(/ /g, ' ')
  return ofx(t) ?? csv(t, ref) ?? texto(t, ref)
}

export type MetodoExtrato = 'pix' | 'debito' | 'dinheiro' | 'boleto' | 'outro'
export interface Classe { categoria: string | null; metodo: MetodoExtrato; naoConta: string | null }

const CATEGORIAS: [string, RegExp][] = [
  ['Mercado', /giassi|angeloni|bistek|fort atac|komprao|atacadao|supermerc|mercado|hortifruti|sacolao/],
  ['Comer fora', /restaurante|lanchonete|pizza|ifood|burger|churrasc|sorveteria|cafeteria/],
  ['Transporte', /posto |combustiv|gasolina|uber|estacionamento|pedagio/],
  ['Saúde', /farmacia|drogaria|panvel|hospital|clinica|laboratorio|unimed/],
  ['Lazer', /cinema|netflix|spotify|steam|disney|ingresso/],
  ['Roupas', /renner|riachuelo|c&a|zara|calcados|sapataria/],
  ['Pets', /petz|cobasi|veterinar|pet shop/],
  ['Casa', /leroy|tumelero|material de construcao|moveis/],
  ['Contas', /energia|celesc|casan|agua e esgoto|internet|telefon|vivo|claro|\btim\b/],
]

/** Palpite do que é cada movimento. naoConta: motivo para não virar lançamento (o saldo continua certo). */
export function classificar(desc: string, valor: number): Classe {
  const d = semAcento(desc)
  const metodo: MetodoExtrato = /\bpix\b/.test(d) ? 'pix' : /boleto|pagamento de conta/.test(d) ? 'boleto' : /saque/.test(d) ? 'dinheiro' : /debito|compra/.test(d) ? 'debito' : 'outro'
  let naoConta: string | null = null
  if (/fatura|pag(amento|to)\.? (de )?cart(ao|oes)/.test(d)) naoConta = 'pagamento de cartão'
  else if (/aplicacao|resgate|\brdb\b|\bcdb\b|poupanca|caixinha|guardad|mesma titularidade|entre contas/.test(d)) naoConta = 'guardar ou resgatar'
  let categoria: string | null = null
  if (valor > 0) categoria = /salario|folha|holerite|vencimento/.test(d) ? 'Salário' : /estorno|reembolso|devolucao/.test(d) ? 'Reembolso' : null
  else for (const [nome, re] of CATEGORIAS) if (re.test(d)) { categoria = nome; break }
  return { categoria, metodo, naoConta }
}
