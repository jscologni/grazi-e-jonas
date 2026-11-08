import { addMonths, daysBetween, dueDate, monthOf, norm, parseISO } from './format'
import type { Account, Bill, Card, CardPayment, Goal, GoalMove, Market, Price, Tx } from './types'

/**
 * Em que mês uma compra no crédito pesa no caixa: o mês de vencimento da fatura.
 * Compra no dia do fechamento ou depois entra na fatura seguinte.
 */
export function invoiceMonth(purchase: string, card: Pick<Card, 'closing_day' | 'due_day'>) {
  const d = parseISO(purchase)
  let closing = monthOf(d)
  if (d.getDate() >= card.closing_day) closing = addMonths(closing, 1)
  return card.due_day <= card.closing_day ? addMonths(closing, 1) : closing
}

export function summary(month: string, txs: Tx[], moves: GoalMove[]) {
  let entrou = 0, saiu = 0, guardou = 0
  for (const t of txs) if (t.month === month) t.kind === 'in' ? (entrou += +t.amount) : (saiu += +t.amount)
  for (const m of moves) if (m.month === month) guardou += +m.amount
  return { entrou, saiu, guardou, sobra: entrou - saiu - guardou }
}

export type BillState = { bill: Bill; due: Date; paid?: Tx; days: number; status: 'paga' | 'vencida' | 'hoje' | 'logo' | 'aberta' }
export function billsFor(month: string, bills: Bill[], txs: Tx[]): BillState[] {
  const now = new Date()
  return bills.filter(b => b.active).map(bill => {
    const due = dueDate(month, bill.due_day)
    const paid = txs.find(t => t.bill_id === bill.id && t.month === month)
    const days = daysBetween(now, due)
    const status: BillState['status'] = paid ? 'paga' : days < 0 ? 'vencida' : days === 0 ? 'hoje' : days <= 5 ? 'logo' : 'aberta'
    return { bill, due, paid, days, status }
  }).sort((a, b) => (a.paid ? 1 : 0) - (b.paid ? 1 : 0) || a.due.getTime() - b.due.getTime())
}

export function goalProgress(goal: Goal, moves: GoalMove[]) {
  const saved = moves.filter(m => m.goal_id === goal.id).reduce((s, m) => s + +m.amount, 0)
  const left = Math.max(0, goal.target - saved)
  let perMonth: number | null = null
  if (goal.deadline && left > 0) {
    const d = parseISO(goal.deadline), n = new Date()
    const months = Math.max(1, (d.getFullYear() - n.getFullYear()) * 12 + d.getMonth() - n.getMonth())
    perMonth = left / months
  }
  return { saved, left, pct: Math.min(1, saved / goal.target), perMonth }
}

// palavras que transformam um produto em outro: "leite" não é "leite condensado", "pão" não é "pão de queijo"
const VIRA_OUTRO = new Set(['condensado', 'coco', 'soja', 'po', 'em', 'de', 'doce', 'soluvel', 'creme', 'molho', 'extrato', 'caldo', 'zero', 'diet', 'light'])

/** O item da lista ("café") é esse produto ("Cafe Pilao Trad")? */
export function mesmoProduto(item: string[], produto: string[]) {
  if (!item.length || item[0] !== produto[0]) return false
  if (!item.every(t => produto.includes(t))) return false
  return !produto.some(t => !item.includes(t) && VIRA_OUTRO.has(t))
}

/** Preço mais recente que vocês viram de um produto em cada mercado */
export function latestByMarket(prices: Price[], name: string, ean?: string | null) {
  const key = norm(name)
  if (!key) return []
  const tokens = key.split(' ')
  const hits = prices.filter(p => {
    if (ean && p.ean === ean) return true
    if (p.norm === key) return true
    return mesmoProduto(tokens, p.norm.split(' '))
  })
  const byMarket = new Map<string, Price>()
  for (const p of hits) {
    const k = p.market_id ?? '?'
    const cur = byMarket.get(k)
    if (!cur || cur.seen_at < p.seen_at) byMarket.set(k, p)
  }
  return [...byMarket.values()].sort((a, b) => a.unit_price - b.unit_price)
}

/** Para a lista atual: quanto ficaria em cada mercado, com quantos itens conhecidos */
export function basketByMarket(items: { name: string; qty: number; ean?: string | null }[], prices: Price[], markets: Market[]) {
  const rows = markets.map(m => ({ market: m, total: 0, known: 0 }))
  for (const it of items) {
    for (const p of latestByMarket(prices, it.name, it.ean)) {
      const r = rows.find(r => r.market.id === p.market_id)
      if (r) { r.total += p.unit_price * (it.qty || 1); r.known++ }
    }
  }
  return rows.filter(r => r.known > 0).sort((a, b) => b.known - a.known || a.total - b.total)
}

export const choreStatus = (lastDone: string | null, every: number) => {
  if (!lastDone) return { days: 0, label: 'nunca feita', late: true }
  const next = new Date(lastDone); next.setDate(next.getDate() + every)
  const days = daysBetween(new Date(), next)
  if (days < 0) return { days, label: `atrasada ${-days} ${-days === 1 ? 'dia' : 'dias'}`, late: true }
  if (days === 0) return { days, label: 'hoje', late: true }
  if (days === 1) return { days, label: 'amanhã', late: false }
  return { days, label: `em ${days} dias`, late: false }
}

/** Saldo de uma conta: saldo inicial + entradas − saídas (fora crédito) − faturas pagas, a partir do dia do saldo inicial */
export function accountBalance(acc: Account, txs: Tx[], pays: CardPayment[]) {
  let v = +acc.initial_balance
  for (const t of txs) {
    if (t.account_id !== acc.id || t.occurred_on < acc.initial_date) continue
    if (t.kind === 'in') v += +t.amount
    else if (t.method !== 'credito') v -= +t.amount
  }
  for (const p of pays) if (p.account_id === acc.id && p.paid_on >= acc.initial_date) v -= +p.amount
  return v
}

/** Soma do saldo de todas as contas ativas; null se ainda não há conta cadastrada */
export function saldoContas(accounts: Account[], txs: Tx[], pays: CardPayment[]) {
  const ativas = accounts.filter(a => !a.archived)
  return ativas.length ? ativas.reduce((t, a) => t + accountBalance(a, txs, pays), 0) : null
}

/** Fatura de um cartão num mês: total das compras, quanto já foi pago e quanto falta */
export function invoice(card: Card, month: string, txs: Tx[], pays: CardPayment[]) {
  const total = txs.filter(t => t.card_id === card.id && t.month === month && t.kind === 'out').reduce((a, t) => a + +t.amount, 0)
  const pagos = pays.filter(p => p.card_id === card.id && p.month === month)
  const pago = pagos.reduce((a, p) => a + +p.amount, 0)
  return { total, pago, falta: Math.max(0, Math.round((total - pago) * 100) / 100), pagos }
}

/** Faturas que ainda vão sair das contas: fechadas e a atual (parcelas futuras não entram) */
export function faturasAPagar(cards: Card[], txs: Tx[], pays: CardPayment[], hoje: string) {
  let soma = 0
  for (const c of cards.filter(k => !k.archived)) {
    const ate = invoiceMonth(hoje, c)
    const meses = new Set(txs.filter(t => t.card_id === c.id && t.month <= ate).map(t => t.month))
    for (const m of meses) soma += invoice(c, m, txs, pays).falta
  }
  return soma
}

/** Conta padrão de uma pessoa: a primeira dela, ou a primeira da casa */
export const contaPadrao = (accounts: Account[], member: string | null | undefined) =>
  (accounts.find(a => !a.archived && a.owner === member) ?? accounts.find(a => !a.archived))?.id ?? null
