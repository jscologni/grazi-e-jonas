// Lê o texto copiado da página da NFC-e (site da Sefaz) e tira os produtos com quantidade e preço.
// Cobre os formatos mais comuns: o do portal nacional ("Qtde.: ... Vl. Unit.: ...") e tabelas
// (código, descrição, quantidade, unidade, valor unitário, valor total) coladas linha a linha.

export interface ItemNota {
  nome: string; codigo: string | null; ean: string | null
  qtd: number; un: string; unit: number; total: number
}
export interface Nota {
  itens: ItemNota[]; total: number | null; cnpj: string | null; mercado: string | null; data: string | null
}

/** "1.234,56" / "27,9" / "0,756" / "27.90" → número */
export const numero = (s: string) => {
  const t = s.trim()
  if (!t) return NaN
  return t.includes(',') ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t)
}

/** código de barras válido (EAN-8/12/13/14) pelo dígito verificador */
export const ehEan = (c: string | null | undefined): c is string => {
  if (!c || !/^(\d{8}|\d{12,14})$/.test(c) || /^0+$/.test(c)) return false
  const d = c.split('').map(Number)
  const dv = d.pop()!
  const soma = d.reverse().reduce((a, n, i) => a + n * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - (soma % 10)) % 10 === dv
}

/** "LEITE UHT INT TIROL 1L" → "Leite Uht Int Tirol 1L" */
const nomeBonito = (s: string) =>
  s.replace(/\s+/g, ' ').trim().toLowerCase()
    .replace(/(^|\s|\/|-)(\p{L})/gu, (_, a, b) => a + b.toUpperCase())
    .replace(/\b(\d+(?:[.,]\d+)?)(kg|g|ml|l|un)\b/gi, (_, n, u) => n + u.toUpperCase().replace('ML', 'ml').replace('KG', 'kg'))

const UNIDADE = /^(UN|UND|UNID|KG|G|GR|L|LT|ML|PC|PCT|CX|DZ|FD|BD|SC|BJ|M|PT|FR|GF|LA|TB|KIT)$/i
const confere = (qtd: number, unit: number, total: number) =>
  qtd > 0 && unit > 0 && total > 0 && Math.abs(qtd * unit - total) <= Math.max(0.06, total * 0.02)

function montar(nome: string, codigo: string | null, qtd: number, un: string, unit: number, total: number): ItemNota | null {
  if (!(total > 0)) return null
  if (!(unit > 0) || !confere(qtd, unit, total)) unit = qtd > 0 ? Math.round((total / qtd) * 100) / 100 : total
  if (!(qtd > 0)) qtd = 1
  const n = nomeBonito(nome.replace(/^\d{1,3}\s+/, ''))
  if (n.length < 2 || /^(qtde|vl\.?|valor|total|c[oó]digo|descri)/i.test(n)) return null
  const u = un.toLowerCase().replace(/^(und|unid)$/, 'un').replace(/^lt$/, 'l').replace(/^gr$/, 'g')
  return { nome: n, codigo, ean: ehEan(codigo) ? codigo : null, qtd, un: u, unit: Math.round(unit * 100) / 100, total: Math.round(total * 100) / 100 }
}

/** Formato do portal nacional: NOME (Código: 123) Qtde.:1 UN: UN Vl. Unit.: 4,99 Vl. Total 4,99 */
function portal(texto: string) {
  const re = /([^\n()]{2,140}?)\s*\(\s*C[óo]d(?:igo)?\.?\s*:?\s*([\w.-]*)\s*\)[\s\S]{0,40}?Qtde\.?\s*:?\s*([\d.,]+)[\s\S]{0,30}?UN\s*:?\s*([A-Za-z]{1,6})[\s\S]{0,30}?Vl\.?\s*Unit\.?\s*:?\s*([\d.,]+)[\s\S]{0,40}?Vl\.?\s*Total\s*:?\s*([\d.,]+)/gi
  const out: ItemNota[] = []
  for (const m of texto.matchAll(re)) {
    const it = montar(m[1], m[2] || null, numero(m[3]), m[4], numero(m[5]), numero(m[6]))
    if (it) out.push(it)
  }
  return out
}

/** Tabela: [nº] [código] descrição qtd un [x] vl.unit vl.total — numa linha só, por tabs ou espaços */
function tabela(texto: string) {
  const re = /^\s*(?:\d{1,3}[\s\t]+)?(?:(\d{3,14})[\s\t]+)?(.{2,140}?)[\s\t]+(\d+(?:[.,]\d{1,4})?)[\s\t]*([A-Za-z]{1,5})[\s\t]+(?:[xX][\s\t]+)?(?:R\$\s*)?(\d+(?:[.,]\d{1,4}))[\s\t]+(?:R\$\s*)?(\d+(?:[.,]\d{2}))\s*$/
  const out: ItemNota[] = []
  for (const linha of texto.split(/\r?\n/)) {
    const m = linha.match(re)
    if (!m || !UNIDADE.test(m[4])) continue
    const qtd = numero(m[3]), unit = numero(m[5]), total = numero(m[6])
    if (!confere(qtd, unit, total)) continue
    const it = montar(m[2], m[1] ?? null, qtd, m[4], unit, total)
    if (it) out.push(it)
  }
  return out
}

/** Tabela colada com cada célula numa linha (comum ao copiar no celular) */
function celulas(texto: string) {
  const ls = texto.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const out: ItemNota[] = []
  for (let i = 0; i + 4 < ls.length; i++) {
    const [nome, q, u, vu, vt] = ls.slice(i, i + 5)
    if (!/^\d+(?:[.,]\d{1,4})?$/.test(q) || !UNIDADE.test(u) || !/^(R\$\s*)?\d+[.,]\d{1,4}$/.test(vu) || !/^(R\$\s*)?\d+[.,]\d{2}$/.test(vt)) continue
    const qtd = numero(q), unit = numero(vu.replace('R$', '')), total = numero(vt.replace('R$', ''))
    if (!confere(qtd, unit, total)) continue
    const anterior = i > 0 && /^\d{8,14}$/.test(ls[i - 1]) ? ls[i - 1] : null
    const it = montar(nome, anterior, qtd, u, unit, total)
    if (it) { out.push(it); i += 4 }
  }
  return out
}

export function lerNota(texto: string): Nota {
  const limpo = texto.replace(/ /g, ' ')
  const tentativas = [portal(limpo), tabela(limpo), celulas(limpo)]
  const itens = tentativas.sort((a, b) => b.length - a.length)[0]

  const pagar = limpo.match(/Valor\s+a\s+pagar\s*(?:R\$)?\s*:?\s*([\d.,]+)/i) ?? limpo.match(/Valor\s+total\s*(?:R\$)?\s*:?\s*([\d.,]+)/i)
  const total = pagar ? numero(pagar[1]) : itens.length ? Math.round(itens.reduce((a, i) => a + i.total, 0) * 100) / 100 : null

  const cnpjM = limpo.match(/(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})/)
  const cnpj = cnpjM ? cnpjM[1].replace(/\D/g, '') : null
  let mercado: string | null = null
  if (cnpjM) {
    const antes = limpo.slice(0, cnpjM.index).split(/\r?\n/).map(l => l.trim()).filter(l => l && !/CNPJ|DANFE|Documento|Consulta|NFC-?e/i.test(l))
    mercado = antes.length ? nomeBonito(antes[antes.length - 1].replace(/CNPJ.*$/i, '')).slice(0, 60) || null : null
  }

  const dataM = limpo.match(/Emiss[ãa]o\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i) ?? limpo.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  const data = dataM ? `${dataM[3]}-${dataM[2]}-${dataM[1]}` : null

  return { itens, total, cnpj, mercado, data }
}
