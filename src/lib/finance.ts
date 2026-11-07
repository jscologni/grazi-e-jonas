import { addMonths, daysBetween, dueDate, monthOf, norm, parseISO } from './format'
import type { Bill, Card, Goal, GoalMove, Market, Price, Tx } from './types'

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

/** Preço mais recente que vocês viram de um produto em cada mercado */
export function latestByMarket(prices: Price[], name: string) {
  const key = norm(name)
  if (!key) return []
  const tokens = key.split(' ')
  const hits = prices.filter(p => {
    if (p.norm === key) return true
    const pt = p.norm.split(' ')
    return tokens.every(t => pt.includes(t)) || pt.every(t => tokens.includes(t))
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
export function basketByMarket(items: { name: string; qty: number }[], prices: Price[], markets: Market[]) {
  const rows = markets.map(m => ({ market: m, total: 0, known: 0 }))
  for (const it of items) {
    for (const p of latestByMarket(prices, it.name)) {
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
