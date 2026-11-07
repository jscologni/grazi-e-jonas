import type { Session } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { enviarFila, tamanhoFila } from './fila'
import { supabase } from './supabase'
import type { Account, Bill, Card, CardPayment, ProductPick, Category, Chore, ChoreLog, Goal, GoalMove, Household, Item, Market, Member, Pantry, Price, Trip, Tx } from './types'

export interface Data {
  household: Household | null
  members: Member[]
  items: Item[]
  markets: Market[]
  trips: Trip[]
  prices: Price[]
  pantry: Pantry[]
  chores: Chore[]
  choreLog: ChoreLog[]
  categories: Category[]
  cards: Card[]
  bills: Bill[]
  txs: Tx[]
  goals: Goal[]
  moves: GoalMove[]
  accounts: Account[]
  cardPays: CardPayment[]
  picks: ProductPick[]
}
type Table = keyof Omit<Data, 'household'>

const TABLES: Record<Table, { table: string; order?: [string, boolean] }> = {
  members: { table: 'members', order: ['created_at', true] },
  items: { table: 'shopping_items', order: ['created_at', true] },
  markets: { table: 'markets', order: ['name', true] },
  trips: { table: 'trips', order: ['created_at', false] },
  prices: { table: 'prices', order: ['seen_at', false] },
  pantry: { table: 'pantry', order: ['name', true] },
  chores: { table: 'chores', order: ['created_at', true] },
  choreLog: { table: 'chore_log', order: ['done_at', false] },
  categories: { table: 'categories', order: ['sort', true] },
  cards: { table: 'cards', order: ['created_at', true] },
  bills: { table: 'bills', order: ['due_day', true] },
  txs: { table: 'transactions', order: ['occurred_on', false] },
  goals: { table: 'goals', order: ['created_at', true] },
  moves: { table: 'goal_moves', order: ['created_at', false] },
  accounts: { table: 'accounts', order: ['created_at', true] },
  cardPays: { table: 'card_payments', order: ['paid_on', false] },
  picks: { table: 'product_picks', order: ['created_at', true] },
}
const EMPTY: Data = {
  household: null, members: [], items: [], markets: [], trips: [], prices: [], pantry: [], chores: [],
  choreLog: [], categories: [], cards: [], bills: [], txs: [], goals: [], moves: [], accounts: [], cardPays: [], picks: [],
}

export interface Ctx extends Data {
  session: Session | null
  me: Member | null
  ready: boolean          // sessão verificada
  loaded: boolean         // dados da casa carregados
  online: boolean
  pendentes: number   // mudanças da lista esperando internet
  reload: () => Promise<void>
  patch: <K extends Table>(key: K, fn: (rows: Data[K]) => Data[K]) => void
  memberName: (id: string | null | undefined) => string
  member: (id: string | null | undefined) => Member | undefined
  toast: (msg: string, tone?: 'ok' | 'erro') => void
  toasts: { id: number; msg: string; tone: 'ok' | 'erro' }[]
}
export const StoreCtx = createContext<Ctx | null>(null)
export const useStore = () => {
  const c = useContext(StoreCtx)
  if (!c) throw new Error('useStore fora do provider')
  return c
}

/** Erro do Supabase em português simples */
export const say = (e: unknown) => {
  const msg = (e as { message?: string })?.message ?? String(e)
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Sem internet agora. Tente de novo quando a conexão voltar.'
  if (/JWT|session|not authenticated/i.test(msg)) return 'Sua entrada expirou. Feche e abra o app de novo.'
  if (/row-level security|permission denied/i.test(msg)) return 'Sem permissão para isso nesta casa.'
  if (/duplicate key|unique/i.test(msg)) return 'Isso já está cadastrado.'
  if (/invalid input syntax|violates|check constraint|null value/i.test(msg)) return 'Não deu para salvar: algum dado veio errado. Tente de novo.'
  // mensagens nossas (do banco, em português) passam direto; o resto vira um aviso genérico
  return /[ãçéêíóõú]|Entre |Código|casa/i.test(msg) ? msg : 'Não deu para salvar agora. Tente de novo.'
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [data, setData] = useState<Data>(EMPTY)
  const [online, setOnline] = useState(navigator.onLine)
  const [pendentes, setPendentes] = useState(tamanhoFila())
  const [toasts, setToasts] = useState<Ctx['toasts']>([])
  const timers = useRef<Record<string, number>>({})

  const toast = useCallback((msg: string, tone: 'ok' | 'erro' = 'ok') => {
    const id = Date.now() + Math.random()
    // o mesmo aviso não empilha: se já está na tela, não repete
    setToasts(t => t.some(x => x.msg === msg) ? t : [...t.slice(-2), { id, msg, tone }])
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), tone === 'erro' ? 5000 : 2600)
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { sub.subscription.unsubscribe(); window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const fetchTable = useCallback(async (key: Table) => {
    const { table, order } = TABLES[key]
    let q = supabase.from(table).select('*')
    if (order) q = q.order(order[0], { ascending: order[1] })
    const { data: rows, error } = await q.limit(5000)
    if (error) throw error
    setData(d => ({ ...d, [key]: rows ?? [] }))
  }, [])

  const reload = useCallback(async () => {
    if (!navigator.onLine) { setLoaded(true); return }
    const { data: h, error } = await supabase.from('households').select('*').maybeSingle()
    if (error) throw error
    if (!h) { setData(EMPTY); setLoaded(true); return }
    setData(d => ({ ...d, household: h }))
    await Promise.all((Object.keys(TABLES) as Table[]).map(fetchTable))
    setLoaded(true)
  }, [fetchTable])

  // carrega quando a sessão muda (primeiro a cópia guardada no celular, depois o banco)
  useEffect(() => {
    if (!session) { setData(EMPTY); setLoaded(false); return }
    try {
      const c = JSON.parse(localStorage.getItem(`copia:${session.user.id}`) ?? 'null')
      if (c?.household) { setData({ ...EMPTY, ...c }); setLoaded(true) }
    } catch { /* sem cópia */ }
    reload().catch(e => { toast(say(e), 'erro'); setLoaded(true) })
  }, [session?.user.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // guarda uma cópia dos dados no celular (para abrir sem internet)
  useEffect(() => {
    if (!session || !data.household) return
    const t = window.setTimeout(() => {
      try { localStorage.setItem(`copia:${session.user.id}`, JSON.stringify(data)) } catch { /* sem espaço */ }
    }, 800)
    return () => window.clearTimeout(t)
  }, [data, session])

  // fila da lista: conta o que espera e envia quando a internet volta
  useEffect(() => {
    const mudou = (e: Event) => setPendentes((e as CustomEvent<number>).detail)
    const voltou = async () => {
      setOnline(true)
      const n = await enviarFila()
      if (n) toast(n === 1 ? '1 mudança da lista enviada' : `${n} mudanças da lista enviadas`)
      reload().catch(() => {})
    }
    window.addEventListener('fila-mudou', mudou)
    window.addEventListener('online', voltou)
    if (navigator.onLine && tamanhoFila()) void voltou()
    return () => { window.removeEventListener('fila-mudou', mudou); window.removeEventListener('online', voltou) }
  }, [reload, toast])

  // tempo real: quando o outro mexe, recarrega só a tabela que mudou
  useEffect(() => {
    if (!session || !data.household) return
    const byTable = Object.fromEntries((Object.keys(TABLES) as Table[]).map(k => [TABLES[k].table, k])) as Record<string, Table>
    const ch = supabase.channel(`casa-${data.household.id}`)
      .on('postgres_changes', { event: '*', schema: 'public' }, payload => {
        const key = byTable[payload.table]
        if (payload.table === 'households') { reload().catch(() => {}); return }
        if (!key) return
        window.clearTimeout(timers.current[key])
        timers.current[key] = window.setTimeout(() => { void enviarFila().finally(() => fetchTable(key).catch(() => {})) }, 250)
      })
      .subscribe()
    // ao voltar para o app, garante que está tudo em dia
    const vis = () => { if (document.visibilityState === 'visible') void enviarFila().finally(() => reload().catch(() => {})) }
    document.addEventListener('visibilitychange', vis)
    return () => { supabase.removeChannel(ch); document.removeEventListener('visibilitychange', vis) }
  }, [session?.user.id, data.household?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const patch = useCallback(<K extends Table>(key: K, fn: (rows: Data[K]) => Data[K]) => {
    setData(d => ({ ...d, [key]: fn(d[key]) }))
  }, [])

  const value = useMemo<Ctx>(() => {
    const me = data.members.find(m => m.user_id === session?.user.id) ?? null
    const member = (id: string | null | undefined) => data.members.find(m => m.user_id === id)
    return {
      ...data, session, me, ready, loaded, online, pendentes, reload, patch, toast, toasts,
      member, memberName: id => member(id)?.name ?? 'Alguém',
    }
  }, [data, session, ready, loaded, online, pendentes, reload, patch, toast, toasts])

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}
