import { useEffect, useMemo, useState } from 'react'
import { avisoTeste, desligarAvisos, estadoAvisos, ligarAvisos, type Estado } from '../lib/avisos'
import { accountBalance, billsFor, choreStatus, faturasAPagar, saldoVale, summary } from '../lib/finance'
import { addMonths, ago, dayMonth, firstName, iso, money, monthOf, today } from '../lib/format'
import { say, useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Adesivo, Sheet } from '../ui'
import { Escolher, NovaSenha } from './Entrar'
import { Etiqueta } from './Dinheiro'
import { ImportarExtrato } from './Extrato'

type Ir = (aba: 'lista' | 'dinheiro' | 'casa') => void

const saudacao = () => {
  const h = new Date().getHours()
  return h < 5 ? 'Boa madrugada' : h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

export function Inicio({ ir }: { ir: Ir }) {
  const s = useStore()
  const [ajustes, setAjustes] = useState(false)
  const [extrato, setExtrato] = useState(false)
  const mes = monthOf(new Date())
  const res = summary(mes, s.txs, s.moves, s.accounts)
  // inclui as que vencem no começo do mês seguinte
  const contas = [...billsFor(mes, s.bills, s.txs), ...billsFor(addMonths(mes, 1), s.bills, s.txs)].filter(b => !b.paid && b.days <= 7)
  const faltam = s.items.filter(i => !i.checked)
  const tarefas = s.chores.filter(c => choreStatus(c.last_done_at, c.every_days).late)
  const outro = s.members.find(m => m.user_id !== s.me?.user_id)
  const bancos = s.accounts.filter(a => !a.archived)
  const nasContas = bancos.reduce((t, a) => t + accountBalance(a, s.txs, s.cardPays), 0)
  const faturas = faturasAPagar(s.cards, s.txs, s.cardPays, today())
  const vale = saldoVale(s.accounts, s.txs, s.cardPays)

  // o que o outro fez por último
  const atividade = useMemo(() => {
    const ev: { quando: string; quem: string | null; texto: string; emoji: string }[] = []
    for (const i of s.items) ev.push({ quando: i.created_at, quem: i.added_by, texto: `pôs ${i.name} na lista`, emoji: '🛒' })
    for (const t of s.txs.slice(0, 40)) if (!t.installment || t.installment === 1) ev.push({ quando: t.created_at, quem: t.created_by, texto: `${t.kind === 'in' ? 'anotou entrada de' : 'anotou gasto de'} ${money(+t.amount)}${t.description ? ` (${t.description})` : ''}`, emoji: t.kind === 'in' ? '💰' : '💸' })
    for (const l of s.choreLog.slice(0, 20)) ev.push({ quando: l.done_at, quem: l.done_by, texto: `fez: ${s.chores.find(c => c.id === l.chore_id)?.name ?? 'tarefa'}`, emoji: '✅' })
    for (const p of s.pantry) if (p.status !== 'cheio' && p.updated_by) ev.push({ quando: p.updated_at, quem: p.updated_by, texto: `avisou que ${p.status === 'acabou' ? 'acabou' : 'está acabando'} ${p.name}`, emoji: '🥫' })
    return ev.sort((a, b) => b.quando.localeCompare(a.quando)).slice(0, 6)
  }, [s.items, s.txs, s.choreLog, s.chores, s.pantry])

  return (
    <div className="page">
      <div className="topo" style={{ alignItems: 'center' }}>
        <div>
          <p className="leve" style={{ margin: 0, fontWeight: 600 }}>{saudacao()},</p>
          <h1 className="titulo">{firstName(s.me?.name ?? '')}</h1>
        </div>
        <button onClick={() => setAjustes(true)} aria-label="Ajustes da casa" style={{ display: 'flex', gap: 2, minHeight: 48, alignItems: 'center' }}>
          <Adesivo fruit={s.me?.fruit} size={42} />
          {outro && <span style={{ marginLeft: -10 }}><Adesivo fruit={outro.fruit} size={42} /></span>}
        </button>
      </div>

      <button style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => ir('dinheiro')} aria-label="Ver o dinheiro do mês">
        <Etiqueta month={mes} {...res} saldo={bancos.length ? nasContas : null} vale={vale} />
      </button>
      {bancos.length > 0 && faturas > 0 && (
        <button className="bloco papel" onClick={() => ir('dinheiro')} style={{ display: 'flex', gap: 14, width: '100%', marginTop: 16, textAlign: 'left', padding: '14px 18px' }}>
          <div style={{ flex: 1 }}><div className="pequeno leve" style={{ fontWeight: 700 }}>Faturas a pagar</div><div className="num" style={{ fontWeight: 800, fontSize: 18, color: 'var(--tomate)' }}>{money(faturas)}</div></div>
          <div style={{ flex: 1 }}><div className="pequeno leve" style={{ fontWeight: 700 }}>Livre depois delas</div><div className="num" style={{ fontWeight: 800, fontSize: 18 }}>{money(nasContas - (vale ?? 0) - faturas)}</div></div>
        </button>
      )}

      {!s.txs.some(t => t.import_id && t.month === mes) && (
        <button className="btn fantasma cheio" style={{ marginTop: 12 }} onClick={() => setExtrato(true)}>📄 Colocar o extrato do mês</button>
      )}

      <div className="grade2" style={{ marginTop: 20 }}>
        <button className="bloco tomate" style={{ textAlign: 'left', minHeight: 128 }} onClick={() => ir('lista')}>
          <div style={{ fontWeight: 700 }}>Feira</div>
          <div className="grande">{faltam.length}</div>
          <div className="pequeno" style={{ opacity: 0.9 }}>{faltam.length === 1 ? 'item falta' : 'itens faltam'}</div>
          <span className="emoji-fundo" aria-hidden>🧺</span>
        </button>
        <button className="bloco folha" style={{ textAlign: 'left', minHeight: 128 }} onClick={() => ir('casa')}>
          <div style={{ fontWeight: 700 }}>Tarefas</div>
          <div className="grande">{tarefas.length}</div>
          <div className="pequeno" style={{ opacity: 0.9 }}>{tarefas.length === 1 ? 'para hoje' : 'para hoje ou atrasadas'}</div>
          <span className="emoji-fundo" aria-hidden>🧹</span>
        </button>
      </div>

      {contas.length > 0 && (
        <>
          <div className="secao"><h2 className="subtitulo">Vence nesta semana</h2></div>
          <div className="folha-lista">
            {contas.map(c => (
              <button className="linha" key={`${c.bill.id}-${iso(c.due)}`} onClick={() => ir('dinheiro')}>
                <span style={{ fontSize: 24 }} aria-hidden>{c.bill.emoji}</span>
                <div className="meio"><div className="nome">{c.bill.name}</div><div className="info">dia {dayMonth(iso(c.due))}</div></div>
                <div style={{ textAlign: 'right' }}>
                  <div className="valor">{money(+c.bill.amount)}</div>
                  <span className={`status ${c.status}`}>{c.status === 'vencida' ? `venceu há ${-c.days}d` : c.status === 'hoje' ? 'hoje' : `em ${c.days}d`}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      {faltam.length > 0 && (
        <>
          <div className="secao"><h2 className="subtitulo">Na lista</h2><button className="link pequeno" onClick={() => ir('lista')}>abrir</button></div>
          <div className="chips">{faltam.slice(0, 10).map(i => <span key={i.id} className="chip">{i.name}</span>)}{faltam.length > 10 && <span className="chip">+{faltam.length - 10}</span>}</div>
        </>
      )}

      {atividade.length > 0 && (
        <>
          <div className="secao"><h2 className="subtitulo">Por aqui</h2></div>
          <div className="folha-lista">
            {atividade.map((a, i) => {
              const m = s.member(a.quem)
              return (
                <div className="linha" key={i} style={{ minHeight: 52 }}>
                  {m ? <Adesivo fruit={m.fruit} size={28} /> : <span style={{ fontSize: 22 }}>{a.emoji}</span>}
                  <div className="meio">
                    <div style={{ fontSize: 14.5 }}><b>{a.quem === s.me?.user_id ? 'Você' : m?.name ?? 'Alguém'}</b> {a.texto}</div>
                    <div className="info">{ago(a.quando)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      <Ajustes open={ajustes} onClose={() => setAjustes(false)} />
      <ImportarExtrato open={extrato} onClose={() => setExtrato(false)} />
    </div>
  )
}

function Ajustes({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore()
  const [nome, setNome] = useState('')
  const [fruta, setFruta] = useState('tomate')
  const [aberto, setAberto] = useState(false)
  const [trocarSenha, setTrocarSenha] = useState(false)
  const [novaCat, setNovaCat] = useState({ name: '', emoji: '🏷️', kind: 'out' as 'in' | 'out' })
  if (open && !aberto) { setAberto(true); setNome(s.me?.name ?? ''); setFruta(s.me?.fruit ?? 'tomate') }
  if (!open && aberto) setAberto(false)

  const salvarPerfil = async () => {
    const { error } = await supabase.from('members').update({ name: nome.trim() || s.me?.name, fruit: fruta }).eq('user_id', s.me?.user_id ?? '')
    if (error) return s.toast(say(error), 'erro')
    await s.reload(); s.toast('Perfil salvo')
  }
  const convite = `Entra no nosso app da casa: ${location.origin}${import.meta.env.BASE_URL}\nCódigo da casa: ${s.household?.invite_code}`
  const compartilhar = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Grazi e Jonas', text: convite })
      else { await navigator.clipboard.writeText(convite); s.toast('Convite copiado') }
    } catch { /* cancelado */ }
  }
  const addCat = async () => {
    if (!novaCat.name.trim()) return
    const { error } = await supabase.from('categories').insert({ ...novaCat, name: novaCat.name.trim(), sort: 50 })
    if (error) return s.toast(say(error), 'erro')
    setNovaCat({ ...novaCat, name: '' }); await s.reload()
  }
  const arquivarCat = async (id: string) => {
    await supabase.from('categories').update({ archived: true }).eq('id', id); await s.reload()
  }
  const sair = async () => {
    try { await desligarAvisos() } catch { /* sem internet: a inscrição expira sozinha */ }
    try { Object.keys(localStorage).filter(k => k.startsWith('copia:') || k.startsWith('sites:') || ['fila-offline', 'nota-pendente', 'mercado-atual'].includes(k)).forEach(k => localStorage.removeItem(k)) } catch { /* nada */ }
    await supabase.auth.signOut(); onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Ajustes">
      <h3 style={{ margin: '8px 0 0' }}>Você</h3>
      <label className="campo"><span>Nome</span><input className="entrada" value={nome} onChange={e => setNome(e.target.value)} maxLength={24} /></label>
      <div className="campo"><span>Adesivo</span><Escolher value={fruta} onChange={setFruta} /></div>
      <button className="btn cheio" style={{ marginTop: 14 }} onClick={salvarPerfil}>Salvar perfil</button>

      <h3 style={{ margin: '28px 0 6px' }}>Avisos no celular</h3>
      <AvisosCelular aberto={open} />

      <h3 style={{ margin: '28px 0 6px' }}>A casa</h3>
      <div className="folha-lista" style={{ boxShadow: 'none', border: '1px solid var(--linha)' }}>
        {s.members.map(m => (
          <div className="linha" key={m.user_id}><Adesivo fruit={m.fruit} size={30} /><div className="meio"><div className="nome">{m.name}</div><div className="info">desde {dayMonth(m.created_at)}</div></div></div>
        ))}
      </div>
      {s.members.length < 2 && <p className="pequeno leve">Mande o código para a outra pessoa entrar na casa.</p>}
      <div className="bloco banana" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1 }}><div className="pequeno" style={{ fontWeight: 700 }}>Código da casa</div>
          <div className="grande" style={{ letterSpacing: '0.12em' }}>{s.household?.invite_code}</div></div>
        <button className="btn pequeno" onClick={compartilhar}>Enviar convite</button>
      </div>
      <p className="pequeno leve">Mercados de {s.household?.city}/{s.household?.uf}.</p>

      <h3 style={{ margin: '28px 0 6px' }}>Categorias</h3>
      <div className="chips">
        {s.categories.filter(c => !c.archived).map(c => (
          <span key={c.id} className="chip" style={{ paddingRight: 6 }}>
            {c.emoji} {c.name} <span className="leve pequeno">{c.kind === 'in' ? 'entrada' : ''}</span>
            <button onClick={() => arquivarCat(c.id)} aria-label={`Tirar categoria ${c.name}`} style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--chao)' }}>✕</button>
          </span>
        ))}
      </div>
      <div className="lado" style={{ marginTop: 10 }}>
        <input className="entrada" style={{ flex: '0 0 64px', textAlign: 'center' }} value={novaCat.emoji} onChange={e => setNovaCat({ ...novaCat, emoji: e.target.value })} aria-label="Emoji" />
        <input className="entrada" value={novaCat.name} onChange={e => setNovaCat({ ...novaCat, name: e.target.value })} placeholder="Nova categoria" />
      </div>
      <div className="lado" style={{ marginTop: 8 }}>
        <div className="segmento"><button aria-pressed={novaCat.kind === 'out'} onClick={() => setNovaCat({ ...novaCat, kind: 'out' })}>Gasto</button><button aria-pressed={novaCat.kind === 'in'} onClick={() => setNovaCat({ ...novaCat, kind: 'in' })}>Entrada</button></div>
        <button className="btn" style={{ flex: 'none' }} onClick={addCat}>Adicionar</button>
      </div>

      <h3 style={{ margin: '28px 0 6px' }}>Senha</h3>
      {trocarSenha
        ? <NovaSenha titulo="Criar ou trocar senha" onPronto={() => setTrocarSenha(false)} />
        : <>
            <p className="pequeno leve" style={{ margin: '0 0 8px' }}>Com senha dá para entrar no app instalado no iPhone, onde o link do e-mail não funciona.</p>
            <button className="btn fantasma cheio" onClick={() => setTrocarSenha(true)}>Criar ou trocar senha</button>
          </>}

      <button className="btn fantasma cheio" style={{ marginTop: 30 }} onClick={sair}>Sair da conta neste aparelho</button>
      <p className="pequeno leve" style={{ textAlign: 'center' }}>{s.session?.user.email}</p>
    </Sheet>
  )
}

function AvisosCelular({ aberto }: { aberto: boolean }) {
  const s = useStore()
  const [estado, setEstado] = useState<Estado | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (aberto) estadoAvisos().then(setEstado).catch(() => setEstado('sem-suporte')) }, [aberto])
  const fazer = async (acao: () => Promise<unknown>, ok: string) => {
    setBusy(true)
    try { await acao(); s.toast(ok); setEstado(await estadoAvisos()) } catch (e) { s.toast(say(e), 'erro') } finally { setBusy(false) }
  }
  if (!estado) return null
  return (
    <div className="bloco papel" style={{ boxShadow: 'none', border: '1px solid var(--linha)' }}>
      <p style={{ margin: '0 0 12px' }}>
        Todo dia às 8h, se alguma conta fixa ou fatura vencer em até 3 dias, chega um aviso neste celular.
      </p>
      {estado === 'instalar-iphone' && <p className="aviso" style={{ marginTop: 0 }}>No iPhone, os avisos só funcionam com o app na tela de início: no Safari, toque em Compartilhar › Adicionar à Tela de Início e abra o app por lá.</p>}
      {estado === 'sem-suporte' && <p className="aviso" style={{ marginTop: 0 }}>Este navegador não recebe avisos. Use o app instalado no celular.</p>}
      {estado === 'bloqueado' && <p className="aviso" style={{ marginTop: 0 }}>As notificações do app estão bloqueadas. Libere nas configurações do celular (Notificações › Grazi e Jonas) e volte aqui.</p>}
      {estado === 'desligado' && <button className="btn folha cheio" disabled={busy} onClick={() => fazer(ligarAvisos, 'Avisos ligados neste celular')}>🔔 Ligar avisos</button>}
      {estado === 'ligado' && (
        <div className="acoes" style={{ marginTop: 0 }}>
          <button className="btn fantasma" disabled={busy} onClick={() => fazer(desligarAvisos, 'Avisos desligados neste celular')}>Desligar</button>
          <button className="btn" disabled={busy} onClick={() => fazer(async () => { if (!(await avisoTeste())) throw new Error('O teste não chegou a este celular. Desligue e ligue os avisos de novo.') }, 'Aviso de teste enviado')}>Mandar teste</button>
        </div>
      )}
    </div>
  )
}
