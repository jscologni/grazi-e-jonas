import { motion } from 'motion/react'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Sparkles } from 'lucide-react'
import { CARD_COLORS, GOAL_COLORS, METHODS } from '../lib/catalog'
import { billsFor, contaPadrao, goalProgress, invoice, invoiceMonth, saldoContas, saldoVale, summary, type BillState } from '../lib/finance'
import { addMonths, dayMonth, dueDate, iso, monthName, monthOf, monthShort, money, parseISO, today } from '../lib/format'
import { say, useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import type { Bill, Card, Goal, Method, Tx } from '../lib/types'
import { Adesivo, Cartaz, MesNav, Sheet, Teclado, useCents } from '../ui'
import { Lancar } from './Lancar'
import { EscolherConta, Saldos } from './Saldos'

type Aba = 'mes' | 'saldos' | 'contas' | 'cartoes' | 'caixinhas'

export function Dinheiro({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const s = useStore()
  const [aba, setAba] = useState<Aba>('mes')
  const res = summary(month, s.txs, s.moves, s.accounts)
  return (
    <div className="page">
      <div className="topo" style={{ alignItems: 'center' }}>
        <h1 className="titulo">Dinheiro</h1>
        <MesNav month={month} onChange={setMonth} />
      </div>

      <Etiqueta month={month} {...res} saldo={month === monthOf(new Date()) ? saldoContas(s.accounts, s.txs, s.cardPays) : null} vale={saldoVale(s.accounts, s.txs, s.cardPays)} />

      <div className="abas" role="tablist">
        {([['mes', 'Lançamentos'], ['saldos', 'Saldos'], ['contas', 'Contas fixas'], ['cartoes', 'Cartões'], ['caixinhas', 'Caixinhas']] as [Aba, string][]).map(([id, n]) => (
          <button key={id} role="tab" aria-selected={aba === id} onClick={() => setAba(id)}>{n}</button>
        ))}
      </div>

      {aba === 'mes' && <Lancamentos month={month} />}
      {aba === 'saldos' && <Saldos />}
      {aba === 'contas' && <Contas month={month} />}
      {aba === 'cartoes' && <Cartoes month={month} />}
      {aba === 'caixinhas' && <Caixinhas month={month} />}
    </div>
  )
}

/** No mês atual mostra o dinheiro que está nas contas; em outros meses, a sobra daquele mês */
export function Etiqueta({
  month,
  inicial = 0,
  entrou = 0,
  saiu = 0,
  guardou = 0,
  sobra = 0,
  saldo = null,
  vale = null,
  somenteSaldo = false,
  titulo,
}: {
  month?: string
  inicial?: number
  entrou?: number
  saiu?: number
  guardou?: number
  sobra?: number
  saldo?: number | null
  vale?: number | null
  somenteSaldo?: boolean
  titulo?: string
}) {
  const valor = saldo ?? sobra
  const rotulo = titulo ?? (somenteSaldo
    ? 'Saldo total nas contas'
    : saldo != null
      ? 'Saldo nas contas'
      : month && sobra < 0
        ? `Faltou em ${monthName(month)}`
        : `Sobra de ${month ? monthName(month) : ''}`)

  return (
    <div className={`card-financeiro card-dinheiro-resumo ${valor < 0 ? 'negativo' : ''}`}>
      <div className="card-financeiro-topo">
        <div className="card-financeiro-rotulo">
          <span>{rotulo}</span>
          <Sparkles size={16} className="card-financeiro-brilho" />
        </div>
        <div className="card-financeiro-valor cabe">
          <Cartaz value={valor} size="xg" />
        </div>
      </div>
      {!somenteSaldo && (
        <div className="card-dinheiro-linhas">
          {inicial !== 0 && (
            <div className="card-dinheiro-item">
              <span className="card-dinheiro-rotulo">Saldo inicial</span>
              <b className="card-dinheiro-val">{money(inicial)}</b>
            </div>
          )}
          <div className="card-dinheiro-item">
            <span className="card-dinheiro-rotulo">Entrou no mês</span>
            <b className="card-dinheiro-val entra">+ {money(entrou)}</b>
          </div>
          <div className="card-dinheiro-item">
            <span className="card-dinheiro-rotulo">Saiu no mês</span>
            <b className="card-dinheiro-val sai">− {money(saiu)}</b>
          </div>
          {guardou !== 0 && (
            <div className="card-dinheiro-item">
              <span className="card-dinheiro-rotulo">Guardou</span>
              <b className="card-dinheiro-val uva">{money(guardou)}</b>
            </div>
          )}
          {saldo != null && (
            <div className="card-dinheiro-item">
              <span className="card-dinheiro-rotulo">Sobra do mês</span>
              <b className={`card-dinheiro-val ${sobra < 0 ? 'sai' : 'sobra'}`}>{money(sobra)}</b>
            </div>
          )}
          {saldo != null && vale != null && (
            <div className="card-dinheiro-item">
              <span className="card-dinheiro-rotulo">Alimentação</span>
              <b className="card-dinheiro-val folha">{money(vale)}</b>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ lançamentos */
function Lancamentos({ month }: { month: string }) {
  const s = useStore()
  const [filtro, setFiltro] = useState<'todos' | 'in' | 'out' | string>('todos')
  const [categoriaFiltro, setCategoriaFiltro] = useState<string | null>(null)
  const [aberto, setAberto] = useState<Tx | null>(null)
  const lancamentosRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setCategoriaFiltro(null)
  }, [month])

  const doMes = s.txs.filter(t => t.month === month)

  const lista = useMemo(() => {
    return doMes.filter(t => {
      if (categoriaFiltro) {
        const cId = t.category_id ?? '-'
        if (cId !== categoriaFiltro) return false
      }
      if (filtro === 'in') return t.kind === 'in'
      if (filtro === 'out') return t.kind === 'out'
      if (filtro !== 'todos') return t.member_id === filtro
      return true
    })
  }, [doMes, categoriaFiltro, filtro])

  const porDia = useMemo(() => {
    const m = new Map<string, Tx[]>()
    for (const t of lista) m.set(t.occurred_on, [...(m.get(t.occurred_on) ?? []), t])
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [lista])

  const porCategoria = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of doMes) if (t.kind === 'out') m.set(t.category_id ?? '-', (m.get(t.category_id ?? '-') ?? 0) + +t.amount)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [doMes])
  const maior = porCategoria[0]?.[1] ?? 0
  const totalSaiu = porCategoria.reduce((a, [, v]) => a + v, 0)
  const cat = (id: string | null) => s.categories.find(k => k.id === id)

  const alternarCategoria = (id: string) => {
    if (categoriaFiltro === id) {
      setCategoriaFiltro(null)
    } else {
      setCategoriaFiltro(id)
      if (filtro === 'in') setFiltro('todos')
      setTimeout(() => {
        lancamentosRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 50)
    }
  }

  return (
    <>
      {porCategoria.length > 0 && (
        <>
          <div className="secao">
            <h2 className="subtitulo">Para onde foi</h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {categoriaFiltro && (
                <button
                  type="button"
                  className="link pequeno"
                  style={{ color: 'var(--tomate)', fontWeight: 700 }}
                  onClick={() => setCategoriaFiltro(null)}
                >
                  Ver todas
                </button>
              )}
              <span className="pequeno leve num">{money(totalSaiu)}</span>
            </div>
          </div>
          <div className="bloco papel" role="region" aria-label="Gastos por categoria" style={{ padding: 8 }}>
            {porCategoria.slice(0, 7).map(([id, v]) => {
              const ativa = categoriaFiltro === id
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => alternarCategoria(id)}
                  className={`linha-categoria-filtro ${ativa ? 'ativa' : ''}`}
                  aria-pressed={ativa}
                  title={ativa ? 'Remover filtro' : `Filtrar por ${cat(id)?.name ?? 'Sem categoria'}`}
                >
                  <div className="linha-cat-topo">
                    <span className="linha-cat-nome">
                      <span style={{ fontSize: 18 }} aria-hidden>{cat(id)?.emoji ?? '📦'}</span>
                      <span>{cat(id)?.name ?? 'Sem categoria'}</span>
                      {ativa && <span className="linha-cat-badge">FILTRADO</span>}
                    </span>
                    <span className="num linha-cat-valor">
                      {money(v)} <span className="leve pequeno">{Math.round((v / totalSaiu) * 100)}%</span>
                    </span>
                  </div>
                  <div className="linha-cat-barra" aria-hidden>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(v / maior) * 100}%` }}
                      transition={{ duration: 0.5 }}
                      style={{
                        height: '100%',
                        borderRadius: 0,
                        background: ativa
                          ? 'linear-gradient(90deg, #EC4899 0%, #FF6B4A 100%)'
                          : 'linear-gradient(90deg, #7C3AED 0%, #EC4899 52%, #FF6B4A 100%)'
                      }}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        </>
      )}

      <div className="secao" ref={lancamentosRef}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <h2 className="subtitulo">Lançamentos</h2>
          {categoriaFiltro && (
            <span className="pequeno leve num">
              ({lista.length} {lista.length === 1 ? 'item' : 'itens'} • {money(lista.reduce((a, t) => a + +t.amount, 0))})
            </span>
          )}
        </div>
        {categoriaFiltro && (
          <button
            type="button"
            className="chip tomate"
            style={{ minHeight: 30, padding: '0 10px', fontSize: 12.5 }}
            onClick={() => setCategoriaFiltro(null)}
            title="Limpar filtro de categoria"
          >
            {cat(categoriaFiltro)?.emoji ?? '📦'} {cat(categoriaFiltro)?.name ?? 'Sem categoria'} ✕
          </button>
        )}
      </div>

      <div className="chips rola" style={{ marginBottom: 10 }}>
        <button className="chip" aria-pressed={filtro === 'todos'} onClick={() => setFiltro('todos')}>Todos</button>
        <button className="chip folha" aria-pressed={filtro === 'in'} onClick={() => setFiltro('in')}>Entradas</button>
        <button className="chip tomate" aria-pressed={filtro === 'out'} onClick={() => setFiltro('out')}>Saídas</button>
        {s.members.map(m => (
          <button key={m.user_id} className="chip" aria-pressed={filtro === m.user_id} onClick={() => setFiltro(m.user_id)}>
            <Adesivo fruit={m.fruit} size={20} /> {m.name}
          </button>
        ))}
      </div>

      {porDia.length === 0 && (
        <div className="vazio">
          <span className="emoji">{categoriaFiltro ? '🔍' : '🪙'}</span>
          {categoriaFiltro ? (
            <>
              Nenhum lançamento em <b>{cat(categoriaFiltro)?.name ?? 'Sem categoria'}</b> para os filtros selecionados.
              <br />
              <button
                type="button"
                className="btn pequeno fantasma"
                style={{ marginTop: 12 }}
                onClick={() => { setCategoriaFiltro(null); setFiltro('todos') }}
              >
                Ver todos os lançamentos
              </button>
            </>
          ) : (
            <>Nada lançado em {monthName(month)}. Toque em <b>Lançar</b> para anotar o primeiro ganho ou gasto.</>
          )}
        </div>
      )}
      {porDia.map(([dia, txs]) => (
        <div key={dia} style={{ marginBottom: 14 }}>
          <div className="pequeno" style={{ fontWeight: 750, margin: '0 4px 6px' }}>{dia === today() ? 'Hoje' : dayMonth(dia)}</div>
          <div className="folha-lista">
            {txs.map(t => <LinhaTx key={t.id} t={t} onClick={() => setAberto(t)} />)}
          </div>
        </div>
      ))}
      <Lancar open={!!aberto} tx={aberto} onClose={() => setAberto(null)} />
    </>
  )
}

export function LinhaTx({ t, onClick }: { t: Tx; onClick: () => void }) {
  const s = useStore()
  const cat = s.categories.find(k => k.id === t.category_id)
  const card = s.cards.find(k => k.id === t.card_id)
  const quem = s.member(t.member_id)
  const meio = [
    METHODS.find(m => m.id === t.method)?.label,
    card?.name,
    (t.installments ?? 1) > 1 ? `${t.installment}/${t.installments}` : null,
    t.method === 'credito' && t.occurred_on.slice(0, 7) !== t.month.slice(0, 7) ? `compra de ${dayMonth(t.occurred_on)}` : null,
  ].filter(Boolean).join(' · ')
  return (
    <button className="linha" onClick={onClick}>
      <span style={{ fontSize: 24, width: 30, textAlign: 'center' }} aria-hidden>{cat?.emoji ?? (t.kind === 'in' ? '✨' : '📦')}</span>
      <div className="meio">
        <div className="nome">{t.description || cat?.name}</div>
        <div className="info">{t.kind === 'in' ? 'entrada' : meio}</div>
      </div>
      {quem && <Adesivo fruit={quem.fruit} size={22} title={quem.name} />}
      <span className={`valor ${t.kind === 'in' ? 'entra' : 'sai'}`}>{t.kind === 'in' ? '+' : '−'} {money(+t.amount)}</span>
    </button>
  )
}

/* ------------------------------------------------------------------ contas fixas */
function Contas({ month }: { month: string }) {
  const s = useStore()
  const estados = billsFor(month, s.bills, s.txs)
  const [pagar, setPagar] = useState<BillState | null>(null)
  const [editar, setEditar] = useState<Bill | 'nova' | null>(null)
  const total = estados.reduce((a, e) => a + (e.paid ? +e.paid.amount : +e.bill.amount), 0)
  const falta = estados.filter(e => !e.paid).reduce((a, e) => a + +e.bill.amount, 0)
  return (
    <>
      <div className="grade2" style={{ marginTop: 18 }}>
        <div className="bloco tomate"><div className="pequeno" style={{ fontWeight: 700 }}>Falta pagar</div><div className="cabe"><Cartaz value={falta} size="m" /></div></div>
        <div className="bloco papel"><div className="pequeno" style={{ fontWeight: 700 }}>Total do mês</div><div className="cabe"><Cartaz value={total} size="m" /></div></div>
      </div>
      <div className="secao"><h2 className="subtitulo">Vencimentos</h2>
        <button className="btn pequeno banana" onClick={() => setEditar('nova')}>+ Conta fixa</button></div>
      {estados.length === 0
        ? <div className="vazio"><span className="emoji">🧾</span>Cadastre aluguel, luz, internet… Elas aparecem sozinhas todo mês, com aviso de vencimento.</div>
        : <div className="folha-lista">
          {estados.map(e => (
            <div className="linha" key={e.bill.id}>
              <button onClick={() => setEditar(e.bill)} style={{ fontSize: 24, width: 30 }} aria-label={`Editar ${e.bill.name}`}>{e.bill.emoji}</button>
              <button className="meio" onClick={() => setPagar(e)} style={{ textAlign: 'left' }}>
                <div className="nome">{e.bill.name}</div>
                <div className="info">
                  {e.paid ? `paga em ${dayMonth(e.paid.occurred_on)} por ${s.memberName(e.paid.member_id)}` : `vence ${dayMonth(iso(e.due))}`}
                  {e.bill.variable && !e.paid ? ' · valor muda' : ''}
                </div>
              </button>
              <div style={{ textAlign: 'right' }}>
                <div className="valor">{money(e.paid ? +e.paid.amount : +e.bill.amount)}</div>
                <span className={`status ${e.status}`}>
                  {e.status === 'paga' ? '✓ paga' : e.status === 'vencida' ? `venceu há ${-e.days}d` : e.status === 'hoje' ? 'vence hoje' : e.status === 'logo' ? `em ${e.days}d` : 'em aberto'}
                </span>
              </div>
            </div>
          ))}
        </div>}
      <PagarConta estado={pagar} month={month} onClose={() => setPagar(null)} />
      <EditarConta conta={editar} onClose={() => setEditar(null)} />
    </>
  )
}

function PagarConta({ estado, month, onClose }: { estado: BillState | null; month: string; onClose: () => void }) {
  const s = useStore()
  const c = useCents(0)
  const [id, setId] = useState<string | null>(null)
  const [metodo, setMetodo] = useState<Method>('pix')
  const [quem, setQuem] = useState<string | null>(null)
  const [conta, setConta] = useState<string | null>(null)
  if (estado && id !== estado.bill.id) { setId(estado.bill.id); c.set(+estado.bill.amount); setQuem(s.me?.user_id ?? null); setConta(contaPadrao(s.accounts, s.me?.user_id)) }
  if (!estado && id) setId(null)
  const pagar = async () => {
    if (!estado || c.value <= 0) return
    const contasCat = s.categories.find(k => k.kind === 'out' && k.name === 'Contas')
    const { error } = await supabase.from('transactions').insert({
      kind: 'out', amount: c.value, description: estado.bill.name, category_id: estado.bill.category_id ?? contasCat?.id ?? null,
      member_id: quem, occurred_on: today(), month, method: metodo, bill_id: estado.bill.id, account_id: conta,
    })
    if (error) return s.toast(say(error), 'erro')
    if (estado.bill.variable) await supabase.from('bills').update({ amount: c.value }).eq('id', estado.bill.id)
    s.toast(`${estado.bill.name} paga`)
    await s.reload(); onClose()
  }
  const desfazer = async () => {
    if (!estado?.paid) return
    const { error } = await supabase.from('transactions').delete().eq('id', estado.paid.id)
    if (error) return s.toast(say(error), 'erro')
    s.toast('Pagamento desfeito'); await s.reload(); onClose()
  }
  return (
    <Sheet open={!!estado} onClose={onClose} title={estado ? `${estado.bill.emoji} ${estado.bill.name}` : ''}>
      {estado?.paid ? (
        <>
          <p>Paga em {dayMonth(estado.paid.occurred_on)} por {s.memberName(estado.paid.member_id)}: <b>{money(+estado.paid.amount)}</b>.</p>
          <button className="btn fantasma cheio" onClick={desfazer}>Desfazer pagamento</button>
        </>
      ) : (
        <>
          <p className="leve pequeno" style={{ margin: 0 }}>{estado?.bill.variable ? 'Confira o valor da conta deste mês.' : 'Valor de sempre. Ajuste se veio diferente.'}</p>
          <div className="visor sai cabe"><Cartaz value={c.value} size="g" /></div>
          <Teclado onKey={c.press} />
          <div className="campo"><span>Pago com</span>
            <div className="chips">{METHODS.filter(m => m.id !== 'credito' && m.id !== 'vale').map(m => <button key={m.id} className="chip" aria-pressed={metodo === m.id} onClick={() => setMetodo(m.id as Method)}>{m.label}</button>)}</div>
          </div>
          <div className="campo"><span>Quem pagou</span>
            <div className="chips">{s.members.map(m => <button key={m.user_id} className="chip" aria-pressed={quem === m.user_id} onClick={() => { setQuem(m.user_id); setConta(contaPadrao(s.accounts, m.user_id)) }}><Adesivo fruit={m.fruit} size={20} /> {m.name}</button>)}</div>
          </div>
          <EscolherConta value={conta} onChange={setConta} titulo="Saiu de qual conta" />
          <button className="btn folha cheio" style={{ marginTop: 20 }} onClick={pagar} disabled={c.value <= 0}>Marcar como paga</button>
        </>
      )}
    </Sheet>
  )
}

const EMOJIS_CONTA = ['🏠', '💡', '💧', '📶', '📱', '🔥', '🚗', '🏥', '🎓', '📺', '🏋️', '🐾', '🧾']
function EditarConta({ conta, onClose }: { conta: Bill | 'nova' | null; onClose: () => void }) {
  const s = useStore()
  const c = useCents(0)
  const [chave, setChave] = useState<string | null>(null)
  const [f, setF] = useState({ name: '', emoji: '🧾', due_day: 10, variable: false, category_id: null as string | null })
  const k = conta === 'nova' ? 'nova' : conta?.id ?? null
  if (k && chave !== k) {
    setChave(k)
    if (conta === 'nova' || !conta) { setF({ name: '', emoji: '🧾', due_day: 10, variable: false, category_id: null }); c.set(0) }
    else { setF({ name: conta.name, emoji: conta.emoji, due_day: conta.due_day, variable: conta.variable, category_id: conta.category_id }); c.set(+conta.amount) }
  }
  if (!k && chave) setChave(null)
  const salvar = async () => {
    if (!f.name.trim()) return s.toast('Dê um nome para a conta', 'erro')
    const row = { ...f, name: f.name.trim(), amount: c.value, due_day: Math.min(31, Math.max(1, f.due_day || 1)) }
    const { error } = conta === 'nova' ? await supabase.from('bills').insert(row) : await supabase.from('bills').update(row).eq('id', (conta as Bill).id)
    if (error) return s.toast(say(error), 'erro')
    await s.reload(); onClose()
  }
  const arquivar = async () => {
    if (!conta || conta === 'nova') return
    const { error } = await supabase.from('bills').update({ active: false }).eq('id', conta.id)
    if (error) return s.toast(say(error), 'erro')
    s.toast(`${conta.name} não aparece mais nos próximos meses`); await s.reload(); onClose()
  }
  return (
    <Sheet open={!!conta} onClose={onClose} title={conta === 'nova' ? 'Nova conta fixa' : 'Editar conta'}>
      <label className="campo"><span>Nome</span><input className="entrada" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Aluguel, luz, internet…" /></label>
      <div className="chips" style={{ marginTop: 10 }}>{EMOJIS_CONTA.map(e => <button key={e} className="chip" aria-pressed={f.emoji === e} onClick={() => setF({ ...f, emoji: e })} style={{ fontSize: 20 }}>{e}</button>)}</div>
      <div className="visor sai" style={{ minHeight: 80 }}><Cartaz value={c.value} size="g" /></div>
      <Teclado onKey={c.press} />
      <div className="lado">
        <label className="campo"><span>Vence todo dia</span>
          <input className="entrada num" type="number" min={1} max={31} inputMode="numeric" value={f.due_day} onChange={e => setF({ ...f, due_day: Number(e.target.value) })} /></label>
        <label className="campo" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 40 }}>
          <input type="checkbox" checked={f.variable} onChange={e => setF({ ...f, variable: e.target.checked })} style={{ width: 22, height: 22 }} />
          <span style={{ margin: 0 }}>Valor muda</span></label>
      </div>
      <div className="campo"><span>Categoria</span>
        <div className="chips">{s.categories.filter(x => x.kind === 'out' && !x.archived).map(x => <button key={x.id} className="chip" aria-pressed={f.category_id === x.id} onClick={() => setF({ ...f, category_id: x.id })}>{x.emoji} {x.name}</button>)}</div>
      </div>
      <div className="acoes">
        {conta !== 'nova' && <button className="btn fantasma" onClick={arquivar}>Encerrar conta</button>}
        <button className="btn" onClick={salvar}>Salvar</button>
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ cartões */
function Cartoes({ month }: { month: string }) {
  const s = useStore()
  const [editar, setEditar] = useState<Card | 'novo' | null>(null)
  const [fatura, setFatura] = useState<Card | null>(null)
  const [aberto, setAberto] = useState<Tx | null>(null)
  const [pagar, setPagar] = useState<Card | null>(null)
  const [anterior, setAnterior] = useState<Card | null>(null)
  const cards = s.cards.filter(k => !k.archived)
  const desfazer = async (id: string) => {
    const { error } = await supabase.from('card_payments').delete().eq('id', id)
    if (error) return s.toast(say(error), 'erro')
    s.toast('Pagamento desfeito'); await s.reload()
  }
  return (
    <>
      <div className="secao"><h2 className="subtitulo">Faturas de {monthName(month)}</h2>
        <button className="btn pequeno banana" onClick={() => setEditar('novo')}>+ Cartão</button></div>
      {cards.length === 0 && <div className="vazio"><span className="emoji">💳</span>Cadastre os cartões com dia de fechamento e vencimento. As compras parceladas caem sozinhas nas faturas certas.</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        {cards.map(k => {
          const f = invoice(k, month, s.txs, s.cardPays)
          const n = s.txs.filter(t => t.card_id === k.id && t.month === month).length
          const atual = invoiceMonth(today(), k)
          const meses = [...new Set(s.txs.filter(t => t.card_id === k.id && t.month >= atual).map(t => t.month))]
          const usado = meses.reduce((a, m) => a + invoice(k, m, s.txs, s.cardPays).falta, 0)
          return (
            <motion.button key={k.id} className={`cartao cor-${k.color}`} onClick={() => setFatura(k)} whileTap={{ scale: 0.98 }} style={{ textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                <b style={{ fontSize: 18 }}>{k.name}</b>
                <span className="pequeno" style={{ opacity: 0.85 }}>fecha {k.closing_day} · vence {k.due_day}</span>
              </div>
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div className="pequeno" style={{ opacity: 0.85 }}>
                  fatura de {monthShort(month)} · {n} {n === 1 ? 'compra' : 'compras'}
                  {f.total > 0 && (f.falta === 0 ? ' · paga ✓' : f.pago > 0 ? ` · faltam ${money(f.falta)}` : '')}
                </div>
                <div className="cabe"><Cartaz value={f.total} size="g" /></div>
                {k.limit_amount ? (
                  <div style={{ marginTop: 8 }}>
                    <div className="barrinha"><i style={{ width: `${Math.min(100, (usado / +k.limit_amount) * 100)}%` }} /></div>
                    <div className="pequeno" style={{ opacity: 0.85, marginTop: 4 }}>{money(usado)} usados de {money(+k.limit_amount)} · livre {money(Math.max(0, +k.limit_amount - usado))}</div>
                  </div>
                ) : null}
              </div>
            </motion.button>
          )
        })}
      </div>

      <Sheet open={!!fatura} onClose={() => setFatura(null)} title={fatura ? `${fatura.name} · ${monthShort(month)}` : ''}>
        {fatura && (() => {
          const f = invoice(fatura, month, s.txs, s.cardPays)
          const doMes = s.txs.filter(t => t.card_id === fatura.id && t.month === month)
          return (
            <>
              <div className="grade2">
                <div className="bloco papel" style={{ boxShadow: 'none', border: '1px solid var(--linha)' }}>
                  <div className="pequeno" style={{ fontWeight: 700 }}>Fatura</div><div className="cabe"><Cartaz value={f.total} size="m" /></div>
                  {f.pago > 0 && <div className="pequeno leve">pago {money(f.pago)}</div>}
                </div>
                <div className={`bloco ${f.falta > 0 ? 'tomate' : 'folha'}`}>
                  <div className="pequeno" style={{ fontWeight: 700 }}>{f.falta > 0 ? 'Falta pagar' : 'Paga'}</div>
                  <div className="cabe"><Cartaz value={f.falta} size="m" /></div>
                </div>
              </div>
              <div className="acoes" style={{ marginTop: 14 }}>
                <button className="btn fantasma" onClick={() => setAnterior(fatura)}>+ Valor de antes</button>
                <button className="btn folha" disabled={f.falta <= 0} onClick={() => setPagar(fatura)}>Pagar fatura</button>
              </div>
              {f.pagos.length > 0 && (
                <div className="campo"><span>Pagamentos</span>
                  <div className="folha-lista" style={{ boxShadow: 'none', border: '1px solid var(--linha)' }}>
                    {f.pagos.map(p => (
                      <div className="linha" key={p.id} style={{ minHeight: 50 }}>
                        <span aria-hidden>✅</span>
                        <div className="meio"><div className="nome">{money(+p.amount)}</div>
                          <div className="info">{dayMonth(p.paid_on)} · {s.memberName(p.member_id)}{p.account_id ? ` · ${s.accounts.find(a => a.id === p.account_id)?.name ?? ''}` : ''}</div></div>
                        <button className="chip" onClick={() => desfazer(p.id)} style={{ minHeight: 34 }}>Desfazer</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="campo"><span>Compras desta fatura · vence {venceEm(fatura, month)}</span>
                {doMes.length ? <div className="folha-lista" style={{ boxShadow: 'none', border: '1px solid var(--linha)' }}>{doMes.map(t => <LinhaTx key={t.id} t={t} onClick={() => setAberto(t)} />)}</div>
                  : <p className="leve" style={{ margin: 0 }}>Nenhuma compra nesta fatura.</p>}
              </div>
              <ProximosVencimentos card={fatura} onAbrir={setAberto} />
              <button className="btn fantasma cheio" style={{ marginTop: 16 }} onClick={() => { setEditar(fatura); setFatura(null) }}>Editar cartão</button>
            </>
          )
        })()}
      </Sheet>
      <PagarFatura cartao={pagar} month={month} onClose={() => setPagar(null)} />
      <ValorAnterior cartao={anterior} month={month} onClose={() => setAnterior(null)} />
      <Lancar open={!!aberto} tx={aberto} onClose={() => setAberto(null)} />
      <EditarCartao cartao={editar} onClose={() => setEditar(null)} />
    </>
  )
}

const venceEm = (card: Card, mes: string) => `${dueDate(mes, card.due_day).getDate()} ${monthShort(mes)}`

/** Todas as faturas que ainda vão vencer, com as compras e parcelas de cada uma */
function ProximosVencimentos({ card, onAbrir }: { card: Card; onAbrir: (t: Tx) => void }) {
  const s = useStore()
  const hoje = today()
  const doCartao = s.txs.filter(t => t.card_id === card.id && t.kind === 'out')
  const meses = [...new Set(doCartao.map(t => t.month))].filter(m => iso(dueDate(m, card.due_day)) >= hoje).sort()
  if (!meses.length) return null
  const total = meses.reduce((a, m) => a + invoice(card, m, s.txs, s.cardPays).falta, 0)
  return (
    <div className="campo">
      <span>Próximos vencimentos · {money(total)}</span>
      <div className="folha-lista" style={{ boxShadow: 'none', border: '1px solid var(--linha)' }}>
        {meses.map((m, i) => {
          const f = invoice(card, m, s.txs, s.cardPays)
          const compras = doCartao.filter(t => t.month === m).sort((a, b) => +b.amount - +a.amount)
          return (
            <details className="venc" key={m} open={i === 0}>
              <summary>
                <div className="meio">
                  <div className="nome">Vence {venceEm(card, m)}</div>
                  <div className="info">{compras.length} {compras.length === 1 ? 'compra' : 'compras'}{f.pago > 0 && f.falta > 0 ? ` · já pago ${money(f.pago)}` : ''}</div>
                </div>
                {f.falta === 0 ? <span className="status paga">✓ paga</span> : <span className="valor">{money(f.falta)}</span>}
              </summary>
              {compras.map(t => {
                const n = t.installments ?? 1
                return (
                  <button className="linha" key={t.id} onClick={() => onAbrir(t)}>
                    <div className="meio">
                      <div className="nome" style={{ whiteSpace: 'normal' }}>{t.description}</div>
                      <div className="info">
                        {n > 1 ? `parcela ${t.installment}/${n}${t.installment !== n ? ` · última em ${monthShort(addMonths(m, n - (t.installment ?? 1)))}` : ' · última'}` : 'à vista'}
                      </div>
                    </div>
                    <span className="valor">{money(+t.amount)}</span>
                  </button>
                )
              })}
            </details>
          )
        })}
      </div>
    </div>
  )
}

/** Pagar fatura: o valor sai da conta escolhida e abate do que falta na fatura */
function PagarFatura({ cartao, month, onClose }: { cartao: Card | null; month: string; onClose: () => void }) {
  const s = useStore()
  const c = useCents(0)
  const [id, setId] = useState<string | null>(null)
  const [quem, setQuem] = useState<string | null>(null)
  const [conta, setConta] = useState<string | null>(null)
  const [dia, setDia] = useState(today())
  if (cartao && id !== cartao.id) {
    setId(cartao.id); c.set(invoice(cartao, month, s.txs, s.cardPays).falta)
    setQuem(s.me?.user_id ?? null); setConta(contaPadrao(s.accounts, s.me?.user_id)); setDia(today())
  }
  if (!cartao && id) setId(null)
  const falta = cartao ? invoice(cartao, month, s.txs, s.cardPays).falta : 0
  const pagar = async () => {
    if (!cartao || c.value <= 0) return
    const { error } = await supabase.from('card_payments').insert({ card_id: cartao.id, account_id: conta, amount: c.value, month, paid_on: dia, member_id: quem })
    if (error) return s.toast(say(error), 'erro')
    const resto = Math.max(0, falta - c.value)
    s.toast(resto > 0 ? `Pago ${money(c.value)} · faltam ${money(resto)}` : `Fatura do ${cartao.name} paga`)
    await s.reload(); onClose()
  }
  return (
    <Sheet open={!!cartao} onClose={onClose} title={cartao ? `Pagar ${cartao.name}` : ''}>
      <p className="leve pequeno" style={{ margin: 0 }}>Falta {money(falta)} na fatura de {monthName(month)}. Pagou só uma parte? Digite o valor pago.</p>
      <div className="visor entra cabe"><Cartaz value={c.value} size="g" /></div>
      <Teclado onKey={c.press} />
      <div className="campo"><span>Quem pagou</span>
        <div className="chips">{s.members.map(m => <button key={m.user_id} className="chip" aria-pressed={quem === m.user_id} onClick={() => { setQuem(m.user_id); setConta(contaPadrao(s.accounts, m.user_id)) }}><Adesivo fruit={m.fruit} size={20} /> {m.name}</button>)}</div>
      </div>
      <EscolherConta value={conta} onChange={setConta} titulo="Saiu de qual conta" />
      <label className="campo"><span>Dia</span><input className="entrada" type="date" value={dia} onChange={e => setDia(e.target.value || today())} /></label>
      <button className="btn folha cheio" style={{ marginTop: 20 }} onClick={pagar} disabled={c.value <= 0}>Pagar {money(c.value)}</button>
    </Sheet>
  )
}

/** Valor que já estava na fatura antes de usar o app (entra como uma compra só) */
function ValorAnterior({ cartao, month, onClose }: { cartao: Card | null; month: string; onClose: () => void }) {
  const s = useStore()
  const c = useCents(0)
  const [id, setId] = useState<string | null>(null)
  if (cartao && id !== cartao.id) { setId(cartao.id); c.set(0) }
  if (!cartao && id) setId(null)
  const salvar = async () => {
    if (!cartao || c.value <= 0) return
    const { error } = await supabase.from('transactions').insert({
      kind: 'out', amount: c.value, description: 'Valor de antes do app', method: 'credito', card_id: cartao.id,
      month, occurred_on: today(), installment: 1, installments: 1, member_id: null,
    })
    if (error) return s.toast(say(error), 'erro')
    s.toast(`${money(c.value)} somado à fatura de ${monthShort(month)}`); await s.reload(); onClose()
  }
  return (
    <Sheet open={!!cartao} onClose={onClose} title="Valor de antes do app">
      <p className="leve pequeno" style={{ margin: 0 }}>
        Quanto já estava na fatura de {monthName(month)} do {cartao?.name} antes de vocês começarem a lançar aqui.
        Tem parcelas para os próximos meses? Troque o mês no topo e lance a de cada fatura.
      </p>
      <div className="visor sai cabe"><Cartaz value={c.value} size="g" /></div>
      <Teclado onKey={c.press} />
      <button className="btn cheio" style={{ marginTop: 20 }} onClick={salvar} disabled={c.value <= 0}>Somar à fatura</button>
    </Sheet>
  )
}

function EditarCartao({ cartao, onClose }: { cartao: Card | 'novo' | null; onClose: () => void }) {
  const s = useStore()
  const [chave, setChave] = useState<string | null>(null)
  const [f, setF] = useState({ name: '', color: 'berinjela', closing_day: 3, due_day: 10, limit: '' })
  const k = cartao === 'novo' ? 'novo' : cartao?.id ?? null
  if (k && chave !== k) {
    setChave(k)
    setF(cartao && cartao !== 'novo'
      ? { name: cartao.name, color: cartao.color, closing_day: cartao.closing_day, due_day: cartao.due_day, limit: cartao.limit_amount ? String(cartao.limit_amount) : '' }
      : { name: '', color: 'berinjela', closing_day: 3, due_day: 10, limit: '' })
  }
  if (!k && chave) setChave(null)
  const salvar = async () => {
    if (!f.name.trim()) return s.toast('Dê um nome para o cartão', 'erro')
    const row = { name: f.name.trim(), color: f.color, closing_day: f.closing_day, due_day: f.due_day, limit_amount: f.limit ? Number(f.limit.replace(/\./g, '').replace(',', '.')) : null }
    const { error } = cartao === 'novo' ? await supabase.from('cards').insert(row) : await supabase.from('cards').update(row).eq('id', (cartao as Card).id)
    if (error) return s.toast(say(error), 'erro')
    await s.reload(); onClose()
  }
  const arquivar = async () => {
    if (!cartao || cartao === 'novo') return
    await supabase.from('cards').update({ archived: true }).eq('id', cartao.id)
    await s.reload(); onClose()
  }
  return (
    <Sheet open={!!cartao} onClose={onClose} title={cartao === 'novo' ? 'Novo cartão' : 'Editar cartão'}>
      <label className="campo"><span>Nome</span><input className="entrada" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Nubank, Inter, Caixa…" /></label>
      <div className="campo"><span>Cor</span>
        <div className="chips">{CARD_COLORS.map(c => <button key={c} aria-label={c} aria-pressed={f.color === c} onClick={() => setF({ ...f, color: c })}
          className={`cor-${c}`} style={{ width: 40, height: 40, borderRadius: 0, outline: f.color === c ? '3px solid var(--tinta)' : 'none', outlineOffset: 2 }} />)}</div>
      </div>
      <div className="lado">
        <label className="campo"><span>Fecha dia</span><input className="entrada num" type="number" min={1} max={31} inputMode="numeric" value={f.closing_day} onChange={e => setF({ ...f, closing_day: Number(e.target.value) })} /></label>
        <label className="campo"><span>Vence dia</span><input className="entrada num" type="number" min={1} max={31} inputMode="numeric" value={f.due_day} onChange={e => setF({ ...f, due_day: Number(e.target.value) })} /></label>
      </div>
      <label className="campo"><span>Limite (opcional)</span><input className="entrada num" inputMode="decimal" value={f.limit} onChange={e => setF({ ...f, limit: e.target.value })} placeholder="5.000,00" /></label>
      <p className="pequeno leve">Compras no dia do fechamento ou depois entram na fatura seguinte.</p>
      <div className="acoes">
        {cartao !== 'novo' && <button className="btn fantasma" onClick={arquivar}>Tirar cartão</button>}
        <button className="btn" onClick={salvar}>Salvar</button>
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ caixinhas */
const COR_POTE: Record<string, string> = { abobora: 'var(--abobora)', folha: 'var(--folha)', tomate: 'var(--tomate)', uva: 'var(--uva)', banana: 'var(--banana)', melancia: 'var(--melancia)' }
function Pote({ pct, color }: { pct: number; color: string }) {
  const clip = useId()
  return (
    <svg className="pote" viewBox="0 0 74 88" aria-hidden>
      <rect x="16" y="2" width="42" height="10" rx="4" fill="var(--tinta)" />
      <path d="M12 16h50a6 6 0 0 1 6 6v54a10 10 0 0 1-10 10H16A10 10 0 0 1 6 76V22a6 6 0 0 1 6-6z" fill="var(--chao)" stroke="var(--tinta)" strokeWidth="3" />
      <clipPath id={clip}><path d="M12 18h50a4 4 0 0 1 4 4v54a8 8 0 0 1-8 8H16a8 8 0 0 1-8-8V22a4 4 0 0 1 4-4z" /></clipPath>
      <g clipPath={`url(#${clip})`}>
        <motion.rect x="6" y="18" width="62" height="66" fill={COR_POTE[color] ?? 'var(--abobora)'}
          style={{ originY: 1 }}
          initial={{ scaleY: 0 }} animate={{ scaleY: Math.max(pct, pct > 0 ? 0.04 : 0) }} transition={{ type: 'spring', damping: 16, stiffness: 90 }} />
      </g>
    </svg>
  )
}

function Caixinhas({ month }: { month: string }) {
  const s = useStore()
  const [mexer, setMexer] = useState<Goal | null>(null)
  const [nova, setNova] = useState(false)
  const goals = s.goals.filter(g => !g.archived)
  return (
    <>
      <div className="secao"><h2 className="subtitulo">Caixinhas</h2>
        <button className="btn pequeno banana" onClick={() => setNova(true)}>+ Caixinha</button></div>
      {goals.length === 0 && <div className="vazio"><span className="emoji">🫙</span>Separe dinheiro para a viagem, a reserva de emergência, o carro… O que vocês guardam no mês sai da sobra.</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        {goals.map(g => {
          const p = goalProgress(g, s.moves)
          return (
            <button key={g.id} className="bloco papel" onClick={() => setMexer(g)} style={{ display: 'flex', gap: 14, alignItems: 'center', textAlign: 'left' }}>
              <Pote pct={p.pct} color={g.color} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 750 }}>{g.emoji} {g.name}</div>
                <Cartaz value={p.saved} size="m" />
                <div className="pequeno leve">
                  {p.left <= 0 ? 'Chegaram lá! 🎉' : `faltam ${money(p.left)} de ${money(+g.target)}`}
                  {p.perMonth && p.left > 0 ? ` · ${money(p.perMonth)}/mês até ${monthShort(monthOf(parseISO(g.deadline!)))}` : ''}
                </div>
              </div>
            </button>
          )
        })}
      </div>
      <MexerCaixinha goal={mexer} month={month} onClose={() => setMexer(null)} />
      <NovaCaixinha open={nova} onClose={() => setNova(false)} />
    </>
  )
}

function MexerCaixinha({ goal, month, onClose }: { goal: Goal | null; month: string; onClose: () => void }) {
  const s = useStore()
  const c = useCents(0)
  const [id, setId] = useState<string | null>(null)
  const [tirar, setTirar] = useState(false)
  if (goal && id !== goal.id) { setId(goal.id); c.set(0); setTirar(false) }
  if (!goal && id) setId(null)
  const historico = goal ? s.moves.filter(m => m.goal_id === goal.id).slice(0, 8) : []
  const salvar = async () => {
    if (!goal || c.value <= 0) return
    const { error } = await supabase.from('goal_moves').insert({ goal_id: goal.id, amount: tirar ? -c.value : c.value, month })
    if (error) return s.toast(say(error), 'erro')
    s.toast(tirar ? `Tirou ${money(c.value)} de ${goal.name}` : `Guardou ${money(c.value)} em ${goal.name}`)
    await s.reload(); onClose()
  }
  const encerrar = async () => {
    if (!goal) return
    await supabase.from('goals').update({ archived: true }).eq('id', goal.id)
    await s.reload(); onClose()
  }
  return (
    <Sheet open={!!goal} onClose={onClose} title={goal ? `${goal.emoji} ${goal.name}` : ''}>
      <div className="segmento">
        <button aria-pressed={!tirar} onClick={() => setTirar(false)}>Guardar</button>
        <button aria-pressed={tirar} onClick={() => setTirar(true)}>Tirar</button>
      </div>
      <div className={`visor ${tirar ? 'sai' : 'entra'} cabe`}><Cartaz value={c.value} size="g" /></div>
      <Teclado onKey={c.press} />
      <p className="pequeno leve">Conta no mês de {monthName(month)}{tirar ? ' e volta para a sobra.' : ' e sai da sobra.'}</p>
      <button className={`btn cheio ${tirar ? 'tomate' : 'folha'}`} onClick={salvar} disabled={c.value <= 0}>{tirar ? 'Tirar da caixinha' : 'Guardar na caixinha'}</button>
      {historico.length > 0 && (
        <div className="folha-lista" style={{ marginTop: 18, boxShadow: 'none', border: '1px solid var(--linha)' }}>
          {historico.map(m => (
            <div className="linha" key={m.id} style={{ minHeight: 48 }}>
              <div className="meio"><div className="nome">{+m.amount > 0 ? 'Guardou' : 'Tirou'} · {s.memberName(m.member_id)}</div><div className="info">{monthName(m.month)}</div></div>
              <span className={`valor ${+m.amount > 0 ? 'entra' : 'sai'}`}>{money(Math.abs(+m.amount))}</span>
            </div>
          ))}
        </div>
      )}
      <button className="btn fantasma cheio" style={{ marginTop: 14 }} onClick={encerrar}>Encerrar caixinha</button>
    </Sheet>
  )
}

function NovaCaixinha({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore()
  const c = useCents(0)
  const [f, setF] = useState({ name: '', emoji: '✈️', deadline: '', color: 'abobora' })
  const salvar = async () => {
    if (!f.name.trim() || c.value <= 0) return s.toast('Dê um nome e um valor de meta', 'erro')
    const { error } = await supabase.from('goals').insert({ name: f.name.trim(), emoji: f.emoji, target: c.value, deadline: f.deadline || null, color: f.color })
    if (error) return s.toast(say(error), 'erro')
    setF({ name: '', emoji: '✈️', deadline: '', color: 'abobora' }); c.set(0)
    await s.reload(); onClose()
  }
  return (
    <Sheet open={open} onClose={onClose} title="Nova caixinha">
      <label className="campo"><span>Para quê</span><input className="entrada" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Viagem, reserva, carro…" /></label>
      <div className="chips" style={{ marginTop: 10 }}>{['✈️', '🛟', '🚗', '🏠', '💍', '👶', '🎓', '🎄', '🫙'].map(e => <button key={e} className="chip" aria-pressed={f.emoji === e} onClick={() => setF({ ...f, emoji: e })} style={{ fontSize: 20 }}>{e}</button>)}</div>
      <div className="campo"><span>Meta</span></div>
      <div className="visor entra" style={{ minHeight: 70, paddingTop: 0 }}><Cartaz value={c.value} size="g" /></div>
      <Teclado onKey={c.press} />
      <label className="campo"><span>Até quando (opcional)</span><input className="entrada" type="date" value={f.deadline} onChange={e => setF({ ...f, deadline: e.target.value })} /></label>
      <div className="campo"><span>Cor do pote</span>
        <div className="chips">{GOAL_COLORS.map(cor => <button key={cor} aria-label={cor} aria-pressed={f.color === cor} onClick={() => setF({ ...f, color: cor })}
          style={{ width: 40, height: 40, borderRadius: 0, background: COR_POTE[cor], outline: f.color === cor ? '3px solid var(--tinta)' : 'none', outlineOffset: 2 }} />)}</div>
      </div>
      <button className="btn folha cheio" style={{ marginTop: 20 }} onClick={salvar}>Criar caixinha</button>
    </Sheet>
  )
}
