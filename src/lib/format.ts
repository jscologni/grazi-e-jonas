// Dinheiro, datas e textos no jeito brasileiro.

const brl = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const money = (v: number) => `R$ ${brl.format(v)}`
export const moneyParts = (v: number) => {
  const [int, cents] = brl.format(Math.abs(v)).split(',')
  return { sign: v < 0 ? '−' : '', int, cents }
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** 'YYYY-MM-DD' local, sem fuso */
export const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const parseISO = (s: string) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d || 1)
}
export const today = () => iso(new Date())
export const monthOf = (d: Date | string) => {
  const x = typeof d === 'string' ? parseISO(d) : d
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-01`
}
export const addMonths = (month: string, n: number) => {
  const d = parseISO(month)
  return monthOf(new Date(d.getFullYear(), d.getMonth() + n, 1))
}
export const monthName = (month: string, withYear = false) => {
  const d = parseISO(month)
  const y = d.getFullYear() !== new Date().getFullYear() || withYear ? ` de ${d.getFullYear()}` : ''
  return MESES[d.getMonth()] + y
}
export const monthShort = (month: string) => {
  const d = parseISO(month)
  return `${MESES_CURTOS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? `/${String(d.getFullYear()).slice(2)}` : ''}`
}
export const dayMonth = (s: string) => {
  const d = parseISO(s)
  return `${d.getDate()} ${MESES_CURTOS[d.getMonth()]}`
}
export const daysInMonth = (month: string) => {
  const d = parseISO(month)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
}
/** dia de vencimento ajustado a meses curtos (31 em fevereiro vira 28/29) */
export const dueDate = (month: string, day: number) => {
  const d = parseISO(month)
  return new Date(d.getFullYear(), d.getMonth(), Math.min(day, daysInMonth(month)))
}
export const daysBetween = (a: Date, b: Date) =>
  Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() -
    new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / 86400000)

export const ago = (s: string) => {
  const diff = (Date.now() - new Date(s).getTime()) / 1000
  if (diff < 60) return 'agora'
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`
  const d = Math.floor(diff / 86400)
  if (d === 1) return 'ontem'
  if (d < 30) return `há ${d} dias`
  return dayMonth(s)
}

/** "1.234,5" ou "1234.50" → número */
export const parseMoney = (s: string) => {
  const clean = s.replace(/[^\d,.-]/g, '')
  if (!clean) return NaN
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  return Number(normalized)
}

/** nome comparável: minúsculo, sem acento, sem palavras de embalagem */
export const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b\d+([.,]\d+)?\s*(kg|g|gr|ml|l|lt|un|und|pct|cx)\b/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

export const firstName = (s: string) => s.trim().split(/\s+/)[0] ?? s
