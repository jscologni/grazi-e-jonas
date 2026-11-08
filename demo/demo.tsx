// Só para testar as telas no computador com dados de exemplo (não entra no build publicado).
import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../src/App'
import '../src/index.css'
import { addMonths, iso, monthOf } from '../src/lib/format'
import { StoreCtx, type Ctx, type Data } from '../src/lib/store'
import { supabase } from '../src/lib/supabase'

// Na demonstração nada vai para o banco de verdade: toda chamada "dá certo" sem gravar.
function falso(): unknown {
  let unico = false
  const p: unknown = new Proxy(() => {}, {
    get: (_t, k) => {
      if (k === 'then') return (ok: (v: unknown) => void) => ok({ data: unico ? { id: crypto.randomUUID() } : [], error: null })
      if (k === 'single' || k === 'maybeSingle') unico = true
      return () => p
    },
    apply: () => p,
  })
  return p
}
Object.assign(supabase, { from: () => falso(), rpc: () => falso() })
const CAT = [
  ['7896089011357', 'Café Torrado e Moído a Vácuo Tradicional Pilão 500g', [['bistek', 'Bistek', 21.6, 29.84], ['giassi', 'Giassi', 22.98], ['angeloni', 'Angeloni', 22.99], ['atacadao', 'Atacadão', 20.9]]],
  ['7896089013405', 'Café Pilão Extra Forte 500g', [['angeloni', 'Angeloni', 22.99, 25.99], ['bistek', 'Bistek', 21.6]]],
  ['7896051111016', 'Leite UHT Integral Tirol 1l', [['giassi', 'Giassi', 4.79], ['angeloni', 'Angeloni', 5.29], ['bistek', 'Bistek', 4.99], ['atacadao', 'Atacadão', 4.59]]],
  ['7891022100754', 'Detergente Ypê Neutro 500ml', [['giassi', 'Giassi', 2.39], ['atacadao', 'Atacadão', 1.99], ['bistek', 'Bistek', 2.49]]],
] as const
const ofertas = CAT.flatMap(([ean, nome, lojas]) => lojas.map(([loja, mercado, preco, de]) => ({ loja, mercado, nome, marca: null, ean, preco, de: de ?? null, porKg: false, imagem: null, link: '#' })))
window.__precosFalsos = p => 'eans' in p ? ofertas.filter(o => p.eans.includes(o.ean)) : ofertas.filter(o => o.nome.toLowerCase().includes(p.termo.toLowerCase().split(' ')[0]))


const J = 'u-jonas', G = 'u-grazi'
const mes = monthOf(new Date())
const hoje = iso(new Date())
const ontem = iso(new Date(Date.now() - 86400000))
const agora = new Date().toISOString()
const antes = (h: number) => new Date(Date.now() - h * 3600000).toISOString()
let n = 0
const id = () => `id-${++n}`

const cats = [
  ['Mercado', '🛒', 'out'], ['Casa', '🏠', 'out'], ['Contas', '💡', 'out'], ['Transporte', '⛽', 'out'],
  ['Comer fora', '🍕', 'out'], ['Lazer', '🎬', 'out'], ['Salário', '💼', 'in'], ['Extra', '✨', 'in'],
].map(([name, emoji, kind], i) => ({ id: `c-${name}`, name, emoji, kind: kind as 'in' | 'out', sort: i, archived: false }))

const data: Data = {
  household: { id: 'h', name: 'Grazi e Jonas', invite_code: 'K7Q2ZP', city: 'Criciúma', uf: 'SC' },
  members: [
    { household_id: 'h', user_id: J, name: 'Jonas', fruit: 'abacate', created_at: antes(500) },
    { household_id: 'h', user_id: G, name: 'Grazi', fruit: 'banana', created_at: antes(400) },
  ],
  markets: [
    { id: 'm1', name: 'Giassi', cnpj: null, address: null },
    { id: 'm2', name: 'Angeloni', cnpj: null, address: null },
    { id: 'm3', name: 'Fort Atacadista', cnpj: null, address: null },
  ],
  items: [
    ['Leite integral', 6, 'un', 'frios', G], ['Pão francês', 1, 'un', 'padaria', J], ['Café 500g', 1, 'un', 'mercearia', G],
    ['Banana', 1, 'dz', 'hortifruti', J], ['Tomate', 1, 'kg', 'hortifruti', G], ['Detergente', 2, 'un', 'limpeza', J],
    ['Peito de frango', 1, 'kg', 'acougue', G],
  ].map(([name, qty, unit, section, by], i) => ({
    id: id(), name: name as string, qty: qty as number, unit: unit as string, section: section as string, note: null,
    checked: i === 1, price: i === 1 ? 12.9 : null, added_by: by as string, checked_by: i === 1 ? G : null,
    checked_at: null, pantry_id: null, created_at: antes(10 - i),
    ean: name === 'Café 500g' ? '7896089011357' : name === 'Leite integral' ? '7896051111016' : null,
    product: name === 'Café 500g' ? 'Café Torrado e Moído a Vácuo Tradicional Pilão 500g' : name === 'Leite integral' ? 'Leite UHT Integral Tirol 1l' : null,
  })),
  trips: [],
  prices: [
    ['Leite integral', 'm1', 4.79], ['Leite integral', 'm2', 5.29], ['Leite integral', 'm3', 4.49],
    ['Café 500g', 'm1', 18.9], ['Café 500g', 'm3', 17.5], ['Banana', 'm2', 6.99], ['Detergente', 'm1', 2.39], ['Detergente', 'm3', 1.99],
  ].map(([name, market_id, unit_price], i) => ({
    id: id(), market_id: market_id as string, name: name as string, norm: (name as string).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ \d+g$/, ''),
    unit: 'un', unit_price: unit_price as number, seen_at: antes(24 * (i + 2)),
  })),
  pantry: [
    { id: id(), name: 'Arroz', section: 'mercearia', status: 'cheio', updated_by: J, updated_at: antes(50) },
    { id: id(), name: 'Azeite', section: 'mercearia', status: 'acabando', updated_by: G, updated_at: antes(3) },
    { id: id(), name: 'Sabão em pó', section: 'limpeza', status: 'acabou', updated_by: J, updated_at: antes(1) },
    { id: id(), name: 'Papel higiênico', section: 'higiene', status: 'cheio', updated_by: G, updated_at: antes(80) },
  ],
  chores: [
    { id: 'ch1', name: 'Levar o lixo', emoji: '🗑️', every_days: 2, rotate: true, assignee: J, last_done_at: antes(60), last_done_by: G, created_at: antes(300) },
    { id: 'ch2', name: 'Lavar roupa', emoji: '🧺', every_days: 4, rotate: true, assignee: G, last_done_at: antes(20), last_done_by: J, created_at: antes(300) },
    { id: 'ch3', name: 'Limpar o banheiro', emoji: '🚿', every_days: 7, rotate: false, assignee: J, last_done_at: null, last_done_by: null, created_at: antes(300) },
  ],
  choreLog: [
    { id: id(), chore_id: 'ch1', done_by: G, done_at: antes(60) }, { id: id(), chore_id: 'ch2', done_by: J, done_at: antes(20) },
    { id: id(), chore_id: 'ch1', done_by: J, done_at: antes(110) },
  ],
  categories: cats,
  cards: [{ id: 'k1', name: 'Nubank', color: 'uva', closing_day: 3, due_day: 10, limit_amount: 5000, archived: false }],
  bills: [
    { id: 'b1', name: 'Aluguel', emoji: '🏠', amount: 1450, due_day: 5, variable: false, category_id: 'c-Casa', active: true },
    { id: 'b2', name: 'Luz', emoji: '💡', amount: 182.4, due_day: new Date().getDate() + 2, variable: true, category_id: 'c-Contas', active: true },
    { id: 'b3', name: 'Internet', emoji: '📶', amount: 99.9, due_day: 15, variable: false, category_id: 'c-Contas', active: true },
  ],
  txs: [
    { kind: 'in', amount: 4200, description: 'Salário', category_id: 'c-Salário', member_id: J, occurred_on: iso(new Date(new Date().getFullYear(), new Date().getMonth(), 5)) },
    { kind: 'in', amount: 3100, description: 'Salário', category_id: 'c-Salário', member_id: G, occurred_on: iso(new Date(new Date().getFullYear(), new Date().getMonth(), 5)) },
    { kind: 'out', amount: 1450, description: 'Aluguel', category_id: 'c-Casa', member_id: J, occurred_on: iso(new Date(new Date().getFullYear(), new Date().getMonth(), 5)), bill_id: 'b1' },
    { kind: 'out', amount: 386.52, description: 'Mercado · Giassi', category_id: 'c-Mercado', member_id: G, occurred_on: ontem, method: 'debito' },
    { kind: 'out', amount: 89.9, description: 'Pizza de sexta', category_id: 'c-Comer fora', member_id: J, occurred_on: hoje },
    { kind: 'out', amount: 120, description: 'Gasolina', category_id: 'c-Transporte', member_id: G, occurred_on: hoje, method: 'credito', card_id: 'k1', installment: 1, installments: 1 },
    { kind: 'out', amount: 249.9, description: 'Tênis', category_id: 'c-Lazer', member_id: J, occurred_on: ontem, method: 'credito', card_id: 'k1', group_id: 'g1', installment: 3, installments: 3, month: addMonths(mes, 1) },
    { kind: 'out', amount: 100, description: 'Geladeira', category_id: 'c-Casa', member_id: J, occurred_on: ontem, method: 'credito', card_id: 'k1', group_id: 'g2', installment: 5, installments: 8, month: addMonths(mes, 1) },
    { kind: 'out', amount: 249.9, description: 'Tênis', category_id: 'c-Lazer', member_id: J, occurred_on: ontem, method: 'credito', card_id: 'k1', group_id: 'g1', installment: 2, installments: 3 },
  ].map(t => ({
    id: id(), method: 'pix', card_id: null, group_id: null, installment: null, installments: null, bill_id: null, trip_id: null,
    created_by: t.member_id, created_at: antes(Math.random() * 48), month: mes, account_id: t.method === 'credito' ? null : (t.member_id === J ? 'a1' : 'a2'), ...t,
  })) as Data['txs'],
  goals: [
    { id: 'g1', name: 'Viagem pra Gramado', emoji: '✈️', target: 6000, deadline: iso(new Date(new Date().getFullYear() + 1, 6, 1)), color: 'abobora', archived: false, created_at: antes(900) },
    { id: 'g2', name: 'Reserva de emergência', emoji: '🛟', target: 15000, deadline: null, color: 'folha', archived: false, created_at: antes(900) },
  ],
  accounts: [
    { id: 'a1', name: 'Nubank', owner: J, initial_balance: 2350, initial_date: iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), archived: false, created_at: antes(600) },
    { id: 'a3', name: 'Cartão alimentação', kind: 'alimentacao', owner: J, initial_balance: 33.58, initial_date: iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), archived: false, created_at: antes(600) },
    { id: 'a2', name: 'Caixa', owner: G, initial_balance: 1820.5, initial_date: iso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)), archived: false, created_at: antes(600) },
  ],
  picks: [],
  cardPays: [{ id: 'p1', card_id: 'k1', account_id: 'a1', amount: 150, month: mes, paid_on: hoje, member_id: J, created_at: antes(2) }],
  moves: [
    { id: id(), goal_id: 'g1', amount: 2300, member_id: J, month: addMonths(mes, -2), note: null, created_at: antes(800) },
    { id: id(), goal_id: 'g1', amount: 400, member_id: G, month: mes, note: null, created_at: antes(30) },
    { id: id(), goal_id: 'g2', amount: 4100, member_id: G, month: addMonths(mes, -1), note: null, created_at: antes(700) },
  ],
}

function Demo() {
  const [d, setD] = useState(data)
  const [toasts, setToasts] = useState<Ctx['toasts']>([])
  const member = (u: string | null | undefined) => d.members.find(m => m.user_id === u)
  const value: Ctx = {
    ...d, session: { user: { id: J, email: 'jonas@exemplo.com' } } as Ctx['session'], me: d.members[0],
    ready: true, loaded: true, online: true, reload: async () => {},
    patch: (k, fn) => setD(x => ({ ...x, [k]: fn(x[k]) })),
    member, memberName: u => member(u)?.name ?? 'Alguém',
    toast: (msg, tone = 'ok') => { const i = Date.now(); setToasts(t => [...t, { id: i, msg, tone }]); setTimeout(() => setToasts(t => t.filter(x => x.id !== i)), 2500) },
    toasts,
  }
  return <StoreCtx.Provider value={value}><App /></StoreCtx.Provider>
}

createRoot(document.getElementById('root')!).render(<StrictMode><Demo /></StrictMode>)
