import { useMemo, useState, type ChangeEvent } from 'react'
import { ClipboardPaste, FileUp } from 'lucide-react'
import { classificar, lerExtrato, type Extrato, type Mov } from '../lib/extrato'
import { accountBalance, contaPadrao } from '../lib/finance'
import { dayMonth, daysBetween, firstName, money, monthName, monthOf, norm, parseISO, parseMoney, today } from '../lib/format'
import { say, useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import type { Account, Bill } from '../lib/types'
import { Adesivo, Cartaz, Sheet } from '../ui'

async function lerArquivo(f: File) {
  if (/\.pdf$/i.test(f.name) || f.type === 'application/pdf') {
    const { textoDoPdf } = await import('../lib/pdf')
    return textoDoPdf(f)
  }
  const bytes = await f.arrayBuffer()
  const utf = new TextDecoder('utf-8').decode(bytes)
  return utf.includes('�') ? new TextDecoder('windows-1252').decode(bytes) : utf
}

interface Linha {
  mov: Mov; valor: number; tag: string | null; padrao: boolean; bloqueado: boolean
  vincular: string | null; bill: Bill | null; categoria: string | null; metodo: string
}

const NAO_ACHEI = 'Não achei movimentos nesse extrato. Tente exportar em OFX ou CSV, ou copie o texto da tela de extrato do banco.'
const fmt = (v: number) => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Lê o extrato do banco, lança o que já aconteceu no mês e acerta o saldo inicial da conta */
export function ImportarExtrato({ open, onClose, contaInicial = null }: { open: boolean; onClose: () => void; contaInicial?: string | null }) {
  const s = useStore()
  const [aberto, setAberto] = useState(false)
  const [contaId, setContaId] = useState<string | null>(null)
  const [novaConta, setNovaConta] = useState<string | null>(null)
  const [extrato, setExtrato] = useState<Extrato | null>(null)
  const [inicio, setInicio] = useState('')
  const [ate, setAte] = useState(today())
  const [saldoTxt, setSaldoTxt] = useState('')
  const [negativo, setNegativo] = useState(false)
  const [veioDoExtrato, setVeioDoExtrato] = useState(false)
  const [troca, setTroca] = useState<Record<string, boolean>>({})
  const [invertidos, setInvertidos] = useState<Set<string>>(new Set())
  const [texto, setTexto] = useState('')
  const [erro, setErro] = useState('')
  const [lendo, setLendo] = useState(false)
  const [busy, setBusy] = useState(false)

  if (open && !aberto) {
    setAberto(true)
    const contas = s.accounts.filter(a => !a.archived)
    setContaId(contaInicial ?? contaPadrao(s.accounts, s.me?.user_id))
    setNovaConta(contas.length ? null : '')
    setExtrato(null); setTexto(''); setErro(''); setTroca({}); setInvertidos(new Set())
  }
  if (!open && aberto) setAberto(false)

  const conta = s.accounts.find(a => a.id === contaId) ?? null

  const processar = async (conteudo: string) => {
    setErro('')
    const e = lerExtrato(conteudo)
    if (e.erro) return setErro(e.erro)
    if (!e.movs.length) return setErro(NAO_ACHEI)
    let id = contaId
    if (novaConta !== null) {
      if (!novaConta.trim()) return setErro('Dê um nome para a conta nova.')
      const { data, error } = await supabase.from('accounts').insert({ name: novaConta.trim(), owner: s.me?.user_id, initial_balance: 0, initial_date: today() }).select().single()
      if (error || !data) return setErro(say(error))
      s.patch('accounts', a => [...a, data as Account])
      id = data.id
      setContaId(id); setNovaConta(null)
    }
    if (!id) return setErro('Escolha de qual conta é esse extrato.')
    const meses = [...new Set(e.movs.map(m => monthOf(m.data)))].sort()
    const atual = monthOf(new Date())
    setInicio(meses.includes(atual) ? atual : meses[0])
    setAte(e.saldoData ?? today())
    setVeioDoExtrato(e.saldo != null)
    setSaldoTxt(e.saldo != null ? fmt(e.saldo) : '')
    setNegativo((e.saldo ?? 0) < 0)
    setTroca({}); setInvertidos(new Set())
    setExtrato(e)
  }

  const escolherArquivo = async (ev: ChangeEvent<HTMLInputElement>) => {
    const f = ev.target.files?.[0]
    ev.target.value = ''
    if (!f) return
    setLendo(true); setErro('')
    try { await processar(await lerArquivo(f)) } catch (e) {
      setErro((e as Error).name === 'PasswordException'
        ? 'Esse PDF tem senha e o app não consegue abrir. Exporte em OFX ou CSV, ou copie o texto da tela de extrato.'
        : NAO_ACHEI)
    } finally { setLendo(false) }
  }
  const colar = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (!t.trim()) return setErro('A área de transferência está vazia. Copie o extrato no app do banco primeiro.')
      setTexto(t); await processar(t)
    } catch { setErro('O celular não deixou colar pelo botão. Toque e segure no campo abaixo e escolha Colar.') }
  }

  const meses = useMemo(() => extrato ? [...new Set(extrato.movs.map(m => monthOf(m.data)))].sort() : [], [extrato])

  const linhas = useMemo<Linha[]>(() => {
    if (!extrato || !conta) return []
    const usados = new Set<string>(), contasUsadas = new Set<string>()
    const candidatos = s.txs.filter(t => t.method !== 'credito' && (t.account_id === conta.id || !t.account_id))
    const nomes = s.members.map(m => norm(firstName(m.name))).filter(n => n.length >= 3)
    return extrato.movs.filter(m => m.data >= inicio).map(m => {
      const valor = invertidos.has(m.id) ? -m.valor : m.valor
      const abs = Math.abs(valor)
      const cl = classificar(m.desc, valor)
      const perto = (d: string) => Math.abs(daysBetween(parseISO(d), parseISO(m.data))) <= 3
      const importado = s.txs.some(t => t.account_id === conta.id && t.import_id === m.id)
      const igual = importado ? undefined : candidatos.find(t => !usados.has(t.id) && t.kind === (valor > 0 ? 'in' : 'out') && Math.abs(+t.amount - abs) < 0.005 && perto(t.occurred_on))
      if (igual) usados.add(igual.id)
      const faturaPaga = valor < 0 && s.cardPays.some(p => p.account_id === conta.id && Math.abs(+p.amount - abs) < 0.005 && perto(p.paid_on))
      const desc = ` ${norm(m.desc)} `
      const entreVoces = !cl.naoConta && /pix|transfer/.test(desc) && nomes.some(n => desc.includes(` ${n}`))
      let bill: Bill | null = null
      if (valor < 0 && !importado && !igual && !cl.naoConta) {
        const mes = monthOf(m.data)
        bill = s.bills.find(b => {
          const palavras = norm(b.name).split(' ').filter(p => p.length >= 3)
          return b.active && palavras.length > 0 && !contasUsadas.has(`${b.id}|${mes}`) && palavras.every(p => desc.includes(p))
            && !s.txs.some(t => t.bill_id === b.id && t.month === mes)
        }) ?? null
        if (bill) contasUsadas.add(`${bill.id}|${mes}`)
      }
      const [tag, padrao] = importado ? ['já importado', false] as const
        : igual ? ['já lançado', false] as const
        : faturaPaga ? ['fatura já paga aqui', false] as const
        : cl.naoConta ? [cl.naoConta, false] as const
        : entreVoces ? ['entre vocês', false] as const
        : bill ? [`conta fixa: ${bill.name}`, true] as const
        : [null, true] as const
      return { mov: m, valor, tag, padrao, bloqueado: importado, vincular: igual && !igual.account_id ? igual.id : null, bill, categoria: cl.categoria, metodo: cl.metodo }
    })
  }, [extrato, conta, inicio, invertidos, s.txs, s.cardPays, s.bills, s.members])

  const marcado = (l: Linha) => !l.bloqueado && (troca[l.mov.id] ?? l.padrao)
  const escolhidas = linhas.filter(marcado)
  const numero = parseMoney(saldoTxt)
  const saldoOk = Number.isFinite(numero)
  const saldo = negativo ? -Math.abs(numero) : Math.abs(numero)

  // mesma conta que o banco faz em importar_extrato: saldo no fim = inicial + movimentos do período
  const inicial = useMemo(() => {
    if (!conta || !saldoOk || !inicio) return null
    const ja = accountBalance({ ...conta, initial_balance: 0, initial_date: inicio }, s.txs.filter(t => t.occurred_on <= ate), s.cardPays.filter(p => p.paid_on <= ate))
    const novos = linhas.filter(l => l.mov.data <= ate).reduce((t, l) => t + (marcado(l) || l.vincular ? l.valor : 0), 0)
    return Math.round((saldo - ja - novos) * 100) / 100
  }, [conta, saldoOk, saldo, inicio, ate, s.txs, s.cardPays, linhas, troca]) // eslint-disable-line react-hooks/exhaustive-deps

  const importar = async () => {
    if (!conta || !saldoOk || busy) return
    setBusy(true)
    const contasCat = s.categories.find(k => k.kind === 'out' && k.name === 'Contas')
    const { error } = await supabase.rpc('importar_extrato', {
      p_conta: conta.id, p_inicio: inicio, p_ate: ate, p_saldo: saldo,
      p_vincular: linhas.filter(l => !marcado(l) && l.vincular).map(l => l.vincular),
      p_linhas: escolhidas.map(l => {
        const kind = l.valor > 0 ? 'in' : 'out'
        const cat = l.bill ? l.bill.category_id ?? contasCat?.id ?? null : s.categories.find(k => k.kind === kind && !k.archived && k.name === l.categoria)?.id ?? null
        return {
          kind, amount: Math.abs(l.valor), description: l.mov.desc, category_id: cat, member_id: conta.owner ?? s.me?.user_id,
          occurred_on: l.mov.data, month: monthOf(l.mov.data), method: kind === 'in' ? 'pix' : conta.kind === 'alimentacao' ? 'vale' : l.metodo, import_id: l.mov.id, bill_id: l.bill?.id ?? null,
        }
      }),
    })
    setBusy(false)
    if (error) return s.toast(say(error), 'erro')
    s.toast(escolhidas.length ? `${escolhidas.length} ${escolhidas.length === 1 ? 'movimento importado' : 'movimentos importados'} e saldo atualizado` : 'Saldo atualizado')
    await s.reload().catch(() => {})
    onClose()
  }

  const contas = s.accounts.filter(a => !a.archived)

  return (
    <Sheet open={open} onClose={onClose} title="Importar extrato">
      {!extrato ? (
        <>
          <p className="leve pequeno" style={{ margin: 0 }}>
            O app lê o que já aconteceu no mês, lança nas datas certas e acerta o saldo inicial para a conta bater com o banco. Você confere tudo antes.
          </p>
          <div className="campo"><span>De qual conta é o extrato</span>
            <div className="chips">
              {contas.map(a => {
                const dono = s.member(a.owner)
                return <button key={a.id} className="chip" aria-pressed={novaConta === null && contaId === a.id} onClick={() => { setContaId(a.id); setNovaConta(null) }}>
                  {dono && <Adesivo fruit={dono.fruit} size={20} />} {a.name}</button>
              })}
              <button className="chip" aria-pressed={novaConta !== null} onClick={() => setNovaConta('')}>+ Conta nova</button>
            </div>
            {novaConta !== null && (
              <input className="entrada" style={{ marginTop: 10 }} value={novaConta} onChange={e => setNovaConta(e.target.value)} placeholder="Nome da conta: Nubank, Caixa…" aria-label="Nome da conta nova" />
            )}
          </div>

          <label className="btn banana cheio" style={{ marginTop: 18, cursor: 'pointer' }}>
            {lendo ? 'Lendo o extrato…' : <><FileUp size={18} /> Escolher arquivo do extrato</>}
            <input type="file" className="sr" onChange={escolherArquivo} disabled={lendo} aria-label="Arquivo do extrato" />
          </label>
          <p className="pequeno leve" style={{ margin: '8px 4px 0' }}>
            No app do banco, abra o extrato e procure Exportar ou Compartilhar. Serve OFX, CSV ou PDF; OFX e CSV costumam dar menos trabalho.
          </p>

          <div className="campo"><span>Ou cole o texto do extrato</span>
            <button className="btn cheio" onClick={colar}><ClipboardPaste size={18} /> Colar extrato</button>
            <textarea className="entrada" style={{ marginTop: 10, minHeight: 80 }} value={texto} onChange={e => setTexto(e.target.value)}
              placeholder="Ou toque e segure aqui e escolha Colar" aria-label="Texto do extrato" />
            {texto.trim().length > 20 && <button className="btn fantasma cheio" style={{ marginTop: 10 }} onClick={() => processar(texto)}>Ler este texto</button>}
          </div>
          {erro && <p className="aviso" role="alert">{erro}</p>}
        </>
      ) : (
        <>
          <div className="bloco folha" style={{ padding: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{linhas.length} {linhas.length === 1 ? 'movimento' : 'movimentos'} de {conta?.name}</div>
            <div className="pequeno" style={{ opacity: 0.9 }}>Desmarcado não vira lançamento, mas o saldo continua certo.</div>
          </div>

          {meses.length > 1 && (
            <div className="campo"><span>Importar a partir de</span>
              <div className="chips">{meses.map(m => <button key={m} className="chip" aria-pressed={inicio === m} onClick={() => setInicio(m)}>{monthName(m)}</button>)}</div>
            </div>
          )}

          <div className="lado">
            <label className="campo"><span>{veioDoExtrato ? 'Saldo no extrato' : 'Saldo no banco'}</span>
              <input className="entrada num" inputMode="decimal" value={saldoTxt} onChange={e => { setSaldoTxt(e.target.value); if (e.target.value.trim().startsWith('-')) setNegativo(true) }} placeholder="1.234,56" /></label>
            <label className="campo"><span>Nesse dia</span>
              <input className="entrada" type="date" value={ate} onChange={e => setAte(e.target.value || today())} /></label>
          </div>
          <label className="campo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={negativo} onChange={e => setNegativo(e.target.checked)} style={{ width: 22, height: 22 }} />
            <span style={{ margin: 0 }}>A conta está no vermelho</span>
          </label>

          <div className="bloco banana cabe" style={{ marginTop: 14, padding: 16 }}>
            <div className="pequeno" style={{ fontWeight: 700 }}>Saldo inicial em {dayMonth(inicio)}</div>
            {inicial != null ? <Cartaz value={inicial} size="m" /> : <div className="pequeno">Digite o saldo do banco para calcular.</div>}
          </div>

          <div className="folha-lista" style={{ marginTop: 14, boxShadow: 'none', border: '1px solid var(--linha)' }}>
            {linhas.map(l => (
              <label className="linha" key={l.mov.id} style={{ cursor: l.bloqueado ? 'default' : 'pointer', minHeight: 54 }}>
                <input type="checkbox" disabled={l.bloqueado} checked={marcado(l)} onChange={e => setTroca(t => ({ ...t, [l.mov.id]: e.target.checked }))} style={{ width: 22, height: 22, flex: 'none' }} />
                <div className="meio">
                  <div className="nome" style={{ whiteSpace: 'normal' }}>{l.mov.desc}</div>
                  <div className="info" style={{ whiteSpace: 'normal' }}>
                    {dayMonth(l.mov.data)}{l.tag ? ` · ${l.tag}` : ''}{l.categoria && !l.tag ? ` · ${l.categoria}` : ''}{l.mov.incerto ? ' · confira o sinal' : ''}
                  </div>
                </div>
                {l.mov.incerto && (
                  <button className="lupa" aria-label="Trocar entre entrada e gasto" onClick={e => {
                    e.preventDefault()
                    setInvertidos(v => { const n = new Set(v); if (n.has(l.mov.id)) n.delete(l.mov.id); else n.add(l.mov.id); return n })
                  }}>±</button>
                )}
                <span className={`valor ${l.valor > 0 ? 'entra' : 'sai'}`}>{l.valor > 0 ? '+' : '−'} {money(Math.abs(l.valor))}</span>
              </label>
            ))}
          </div>

          <button className="btn folha cheio" style={{ marginTop: 18 }} onClick={importar} disabled={busy || !saldoOk}>
            {busy ? 'Importando…' : escolhidas.length ? `Importar ${escolhidas.length} e atualizar o saldo` : 'Só atualizar o saldo'}
          </button>
          <button className="btn fantasma cheio" style={{ marginTop: 10 }} onClick={() => setExtrato(null)}>Escolher outro extrato</button>
        </>
      )}
    </Sheet>
  )
}
