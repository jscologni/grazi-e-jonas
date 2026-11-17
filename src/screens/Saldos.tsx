import { useState } from 'react'
import { ArrowLeftRight, FileSpreadsheet, Landmark, UtensilsCrossed, X } from 'lucide-react'
import { accountBalance, contaPadrao, faturasAPagar, saldoVale } from '../lib/finance'
import { dayMonth, money, today } from '../lib/format'
import { say, useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import type { Account } from '../lib/types'
import { Adesivo, Cartaz, Sheet, Teclado, useCents } from '../ui'
import { ImportarExtrato } from './Extrato'

/** Chips para escolher de qual conta o dinheiro sai (ou em qual entra) */
export function EscolherConta({ value, onChange, titulo = 'De qual conta', nenhuma = true }: { value: string | null; onChange: (id: string | null) => void; titulo?: string; nenhuma?: boolean }) {
  const s = useStore()
  const contas = s.accounts.filter(a => !a.archived)
  if (!contas.length) return null
  return (
    <div className="campo"><span>{titulo}</span>
      <div className="chips">
        {contas.map(a => {
          const dono = s.member(a.owner)
          return (
            <button key={a.id} type="button" className="chip" aria-pressed={value === a.id} onClick={() => onChange(a.id)}>
              {dono && <Adesivo fruit={dono.fruit} size={20} />} {a.name}
            </button>
          )
        })}
        {nenhuma && <button type="button" className="chip" aria-pressed={value === null} onClick={() => onChange(null)}>Nenhuma</button>}
      </div>
    </div>
  )
}

export function Saldos() {
  const s = useStore()
  const [editar, setEditar] = useState<Account | 'nova' | null>(null)
  const [extrato, setExtrato] = useState<{ conta: string | null } | null>(null)
  const [transferir, setTransferir] = useState(false)
  const contas = s.accounts.filter(a => !a.archived)
  const saldos = contas.map(a => ({ a, v: accountBalance(a, s.txs, s.cardPays, s.transfers) }))
  const total = saldos.reduce((t, x) => t + x.v, 0)
  const faturas = faturasAPagar(s.cards, s.txs, s.cardPays, today())
  const livre = total - (saldoVale(s.accounts, s.txs, s.cardPays, s.transfers) ?? 0) - faturas // cartão alimentação não paga fatura
  const donos = [...s.members.map(m => m.user_id), null]

  return (
    <>
      {contas.length > 0 && (
        <div className="grade2" style={{ marginTop: 18 }}>
          <div className="bloco papel"><div className="pequeno" style={{ fontWeight: 700 }}>Nas contas</div><div className="cabe"><Cartaz value={total} size="m" /></div></div>
          <div className={`bloco ${livre < 0 ? 'tomate' : 'folha'}`}>
            <div className="pequeno" style={{ fontWeight: 700 }}>Livre depois das faturas</div>
            <div className="cabe"><Cartaz value={livre} size="m" /></div>
            {faturas > 0 && <div className="pequeno" style={{ opacity: 0.9 }}>faturas a pagar: {money(faturas)}</div>}
          </div>
        </div>
      )}

      <div className="secao"><h2 className="subtitulo">Contas</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn pequeno fantasma" onClick={() => setExtrato({ conta: null })}><FileSpreadsheet size={16} /> Extrato</button>
          <button className="btn pequeno banana" onClick={() => setEditar('nova')}>+ Conta</button>
        </div></div>

      {contas.length === 0 && (
        <div className="vazio"><span className="emoji">🏦</span>
          Cadastre a conta de cada um (Nubank, Caixa, carteira…) com o saldo de hoje.
          Daí em diante, o que vocês lançarem entra e sai do saldo sozinho.
          <button className="btn banana" style={{ marginTop: 12 }} onClick={() => setExtrato({ conta: null })}><FileSpreadsheet size={18} /> Começar pelo extrato do mês</button></div>
      )}

      {donos.map(dono => {
        const lista = saldos.filter(x => (x.a.owner ?? null) === dono)
        if (!lista.length) return null
        const m = s.member(dono)
        return (
          <section className="banca" key={dono ?? 'casa'}>
            <h3 className="banca-titulo">{m ? <><Adesivo fruit={m.fruit} size={22} /> {m.name}</> : '🏠 Da casa'}
              <span className="conta num">{money(lista.reduce((t, x) => t + x.v, 0))}</span></h3>
            <div className="folha-lista">
              {lista.map(({ a, v }) => (
                <button className="linha" key={a.id} onClick={() => setEditar(a)}>
                  <span style={{ fontSize: 24 }} aria-hidden>{a.kind === 'alimentacao' ? '🍽️' : '🏦'}</span>
                  <div className="meio"><div className="nome">{a.name}</div>
                    <div className="info">início {dayMonth(a.initial_date)}: {money(+a.initial_balance)}</div></div>
                  <span className={`valor ${v < 0 ? '' : 'entra'}`} style={v < 0 ? { color: 'var(--tomate)' } : undefined}>{money(v)}</span>
                </button>
              ))}
            </div>
          </section>
        )
      })}
      {contas.length > 1 && <button className="btn fantasma cheio" style={{ marginTop: 14 }} onClick={() => setTransferir(true)}><ArrowLeftRight size={18} /> Transferir entre contas</button>}
      <Transferencias />
      {contas.length > 0 && (
        <p className="pequeno leve" style={{ margin: '12px 4px 0' }}>
          O saldo muda com o que vocês lançam escolhendo a conta: entradas somam, gastos no Pix/débito/dinheiro/boleto
          e faturas pagas descontam. Compras no crédito só saem da conta quando a fatura é paga.
        </p>
      )}
      <EditarContaBanco conta={editar} onClose={() => setEditar(null)} onExtrato={id => { setEditar(null); setExtrato({ conta: id }) }} />
      <ImportarExtrato open={!!extrato} contaInicial={extrato?.conta ?? null} onClose={() => setExtrato(null)} />
      <Transferir open={transferir} onClose={() => setTransferir(false)} />
    </>
  )
}

/** Últimas transferências, com desfazer (não é gasto nem entrada: só troca o dinheiro de conta) */
function Transferencias() {
  const s = useStore()
  const [apagando, setApagando] = useState<string | null>(null)
  const ultimas = s.transfers.slice(0, 5)
  if (!ultimas.length) return null
  const nome = (id: string) => s.accounts.find(a => a.id === id)?.name ?? 'conta apagada'
  const desfazer = async (id: string) => {
    if (apagando || !confirm('Desfazer esta transferência? Os saldos voltam ao que eram.')) return
    setApagando(id)
    const { error } = await supabase.from('transfers').delete().eq('id', id)
    if (error) s.toast(say(error), 'erro')
    else { s.toast('Transferência desfeita'); await s.reload() }
    setApagando(null)
  }
  return (
    <>
      <div className="secao"><h2 className="subtitulo">Transferências</h2></div>
      <div className="folha-lista">
        {ultimas.map(t => (
          <div className="linha" key={t.id}>
            <span aria-hidden style={{ width: 30, display: 'grid', placeItems: 'center' }}><ArrowLeftRight size={20} /></span>
            <div className="meio"><div className="nome" style={{ whiteSpace: 'normal' }}>{nome(t.from_account)} → {nome(t.to_account)}</div>
              <div className="info">{dayMonth(t.occurred_on)} · {s.memberName(t.member_id)}</div></div>
            <span className="valor">{money(+t.amount)}</span>
            <button className="fechar" onClick={() => desfazer(t.id)} disabled={apagando === t.id} aria-label="Desfazer transferência"><X size={18} /></button>
          </div>
        ))}
      </div>
    </>
  )
}

function Transferir({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore()
  const c = useCents(0)
  const [aberto, setAberto] = useState(false)
  const [de, setDe] = useState<string | null>(null)
  const [para, setPara] = useState<string | null>(null)
  const [data, setData] = useState(today())
  const [salvando, setSalvando] = useState(false)
  if (open && !aberto) {
    const origem = contaPadrao(s.accounts, s.me?.user_id)
    setAberto(true); c.set(0); setDe(origem); setData(today()); setSalvando(false)
    const outras = s.accounts.filter(a => !a.archived && a.id !== origem)
    setPara((outras.find(a => a.kind !== 'alimentacao') ?? outras[0])?.id ?? null)
  }
  if (!open && aberto) setAberto(false)

  const salvar = async () => {
    if (salvando || c.value <= 0 || !de || !para || de === para) return
    setSalvando(true)
    const { error } = await supabase.from('transfers').insert({ from_account: de, to_account: para, amount: c.value, occurred_on: data, member_id: s.me?.user_id ?? null })
    if (error) { setSalvando(false); return s.toast(say(error), 'erro') }
    s.toast(`${money(c.value)} transferido`)
    await s.reload(); onClose()
  }
  return (
    <Sheet open={open} onClose={salvando ? () => {} : onClose} title="Transferir entre contas">
      <p className="leve pequeno" style={{ margin: 0 }}>Não conta como gasto nem como entrada: só passa o dinheiro de uma conta para a outra.</p>
      <div className="visor sai cabe"><Cartaz value={c.value} size="g" /></div>
      <Teclado onKey={salvando ? () => {} : c.press} />
      <EscolherConta value={de} onChange={id => !salvando && setDe(id)} titulo="Sai de" nenhuma={false} />
      <EscolherConta value={para} onChange={id => !salvando && setPara(id)} titulo="Entra em" nenhuma={false} />
      <label className="campo"><span>Data</span>
        <input className="entrada" type="date" value={data} onChange={e => !salvando && setData(e.target.value || today())} /></label>
      {de && de === para && <p className="aviso">Escolha contas diferentes.</p>}
      <button className="btn folha cheio" style={{ marginTop: 20 }} onClick={salvar} disabled={salvando || c.value <= 0 || !de || !para || de === para}>
        {salvando ? 'Salvando…' : 'Transferir'}
      </button>
    </Sheet>
  )
}

function EditarContaBanco({ conta, onClose, onExtrato }: { conta: Account | 'nova' | null; onClose: () => void; onExtrato: (id: string) => void }) {
  const s = useStore()
  const c = useCents(0)
  const [salvando, setSalvando] = useState(false)
  const [chave, setChave] = useState<string | null>(null)
  const [f, setF] = useState({ name: '', kind: 'conta' as 'conta' | 'alimentacao', owner: null as string | null, initial_date: today(), negativo: false })
  const k = conta === 'nova' ? 'nova' : conta?.id ?? null
  if (k && chave !== k) {
    setChave(k)
    if (conta && conta !== 'nova') {
      setF({ name: conta.name, kind: conta.kind ?? 'conta', owner: conta.owner, initial_date: conta.initial_date, negativo: +conta.initial_balance < 0 })
      c.set(Math.abs(+conta.initial_balance))
    } else { setF({ name: '', kind: 'conta', owner: s.me?.user_id ?? null, initial_date: today(), negativo: false }); c.set(0) }
    setSalvando(false)
  }
  if (!k && chave) setChave(null)

  const salvar = async () => {
    if (salvando) return
    if (!f.name.trim()) return s.toast('Dê um nome para a conta', 'erro')
    setSalvando(true)
    try {
      const row = { name: f.name.trim(), kind: f.kind, owner: f.owner, initial_date: f.initial_date, initial_balance: f.negativo ? -c.value : c.value }
      const { error } = conta === 'nova' ? await supabase.from('accounts').insert(row) : await supabase.from('accounts').update(row).eq('id', (conta as Account).id)
      if (error) { setSalvando(false); return s.toast(say(error), 'erro') }
      s.toast(conta === 'nova' ? 'Conta criada' : 'Conta atualizada')
      await s.reload(); onClose()
    } catch {
      setSalvando(false)
      s.toast('Erro ao salvar conta', 'erro')
    }
  }
  const arquivar = async () => {
    if (!conta || conta === 'nova' || salvando) return
    setSalvando(true)
    try {
      const { error } = await supabase.from('accounts').update({ archived: true }).eq('id', conta.id)
      if (error) { setSalvando(false); return s.toast(say(error), 'erro') }
      await s.reload(); onClose()
    } catch {
      setSalvando(false)
    }
  }

  return (
    <Sheet open={!!conta} onClose={salvando ? () => {} : onClose} title={conta === 'nova' ? 'Nova conta' : 'Editar conta'}>
      <div className="segmento" style={{ marginTop: 8 }}>
        <button aria-pressed={f.kind === 'conta'} onClick={() => !salvando && setF({ ...f, kind: 'conta' })}><Landmark size={17} /> Conta</button>
        <button aria-pressed={f.kind === 'alimentacao'} onClick={() => !salvando && setF({ ...f, kind: 'alimentacao' })}><UtensilsCrossed size={17} /> Cartão alimentação</button>
      </div>
      <label className="campo"><span>Nome</span>
        <input className="entrada" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder={f.kind === 'alimentacao' ? 'Cartão alimentação' : 'Nubank, Caixa, Sicoob, carteira…'} disabled={salvando} /></label>
      <div className="campo"><span>De quem é</span>
        <div className="chips">
          {s.members.map(m => <button key={m.user_id} className="chip" aria-pressed={f.owner === m.user_id} onClick={() => !salvando && setF({ ...f, owner: m.user_id })}><Adesivo fruit={m.fruit} size={20} /> {m.name}</button>)}
          <button className="chip" aria-pressed={f.owner === null} onClick={() => !salvando && setF({ ...f, owner: null })}>🏠 Dos dois</button>
        </div>
      </div>
      <div className="campo"><span>Saldo nesse dia</span></div>
      <div className="segmento">
        <button aria-pressed={!f.negativo} onClick={() => !salvando && setF({ ...f, negativo: false })}>Positivo</button>
        <button aria-pressed={f.negativo} onClick={() => !salvando && setF({ ...f, negativo: true })}>No vermelho</button>
      </div>
      <div className={`visor ${f.negativo ? 'sai' : 'entra'} cabe`}><Cartaz value={f.negativo ? -c.value : c.value} size="g" /></div>
      <Teclado onKey={salvando ? () => {} : c.press} />
      <label className="campo"><span>Dia do saldo</span>
        <input className="entrada" type="date" value={f.initial_date} onChange={e => setF({ ...f, initial_date: e.target.value || today() })} disabled={salvando} /></label>
      <p className="pequeno leve">Lançamentos a partir desse dia mexem no saldo; os anteriores já estão dentro dele.</p>
      {conta && conta !== 'nova' && <button className="btn banana cheio" onClick={() => onExtrato(conta.id)} disabled={salvando}><FileSpreadsheet size={18} /> Atualizar com o extrato</button>}
      <div className="acoes">
        {conta !== 'nova' && <button className="btn fantasma" onClick={arquivar} disabled={salvando}>Encerrar conta</button>}
        <button className="btn" onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
      </div>
    </Sheet>
  )
}
