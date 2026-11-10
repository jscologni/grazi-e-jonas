import { useEffect, useMemo, useState } from 'react'
import { Broom, FileSpreadsheet, ShoppingBasket, Sparkles, UtensilsCrossed, Wallet } from 'lucide-react'
import { avisoTeste, desligarAvisos, estadoAvisos, ligarAvisos, type Estado } from '../lib/avisos'
import { accountBalance, choreStatus } from '../lib/finance'
import { dayMonth, firstName, money, monthOf } from '../lib/format'
import { say, useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Adesivo, Cartaz, Sheet } from '../ui'
import { Escolher, NovaSenha } from './Entrar'
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
  const faltam = s.items.filter(i => !i.checked)
  const tarefas = s.chores.filter(c => choreStatus(c.last_done_at, c.every_days).late)
  const outro = s.members.find(m => m.user_id !== s.me?.user_id)
  const bancos = s.accounts.filter(a => !a.archived)
  const nasContas = bancos.reduce((t, a) => t + accountBalance(a, s.txs, s.cardPays), 0)

  const contasOrdenadas = useMemo(() => {
    return [...bancos].sort((a, b) => {
      const aVale = a.kind === 'alimentacao' || /\b(vale|alimenta|refei|flash|ticket|sodexo|pluxee|vr|va|caju|swile|alelo)\b/i.test(a.name)
      const bVale = b.kind === 'alimentacao' || /\b(vale|alimenta|refei|flash|ticket|sodexo|pluxee|vr|va|caju|swile|alelo)\b/i.test(a.name)
      if (aVale !== bVale) return aVale ? 1 : -1
      return a.name.localeCompare(b.name)
    })
  }, [bancos])

  return (
    <div className="page page-inicio">
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

      {/* Card Financeiro Unificado (Sunset Glow) */}
      <div className="card-financeiro">
        <button
          onClick={() => ir('dinheiro')}
          className="card-financeiro-topo"
          aria-label="Ver o dinheiro da casa"
        >
          <div className="card-financeiro-rotulo">
            <span>Saldo total nas contas</span>
            <Sparkles size={16} className="card-financeiro-brilho" />
          </div>
          <div className="card-financeiro-valor cabe">
            <Cartaz value={nasContas} size="xg" />
          </div>
        </button>

        {bancos.length > 0 && (
          <div className="card-financeiro-contas">
            {contasOrdenadas.map(a => {
              const v = accountBalance(a, s.txs, s.cardPays)
              const dono = s.member(a.owner)
              const ehVale = a.kind === 'alimentacao' || /\b(vale|alimenta|refei|flash|ticket|sodexo|pluxee|vr|va|caju|swile|alelo)\b/i.test(a.name)
              return (
                <button
                  className="card-financeiro-linha"
                  key={a.id}
                  onClick={() => ir('dinheiro')}
                >
                  <div
                    className="card-financeiro-icone"
                    style={{
                      background: ehVale ? 'var(--folha-claro)' : dono ? 'var(--uva-claro)' : 'var(--chao)'
                    }}
                  >
                    {ehVale ? (
                      <UtensilsCrossed size={18} style={{ color: 'var(--folha)' }} />
                    ) : dono ? (
                      <Adesivo fruit={dono.fruit} size={24} />
                    ) : (
                      <Wallet size={18} style={{ color: 'var(--uva)' }} />
                    )}
                  </div>
                  <div className="meio">
                    <div className="nome">{a.name}</div>
                    <div className="info">
                      {ehVale
                        ? (dono ? `Vale alimentação • ${dono.name}` : 'Vale alimentação')
                        : (dono ? dono.name : 'Conta da casa')}
                    </div>
                  </div>
                  <span className={`valor ${v < 0 ? 'sai' : 'entra'}`} style={v < 0 ? { color: 'var(--tomate)' } : undefined}>
                    {money(v)}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="grade2">
        <button className="card-acao feira" onClick={() => ir('lista')}>
          <div className="card-acao-header">
            <span className="card-acao-tag">Feira</span>
            <div className="card-acao-icone"><ShoppingBasket size={22} /></div>
          </div>
          <div className="card-acao-corpo">
            <div className="card-acao-numero">{faltam.length}</div>
            <div className="card-acao-desc">{faltam.length === 1 ? 'item na lista' : 'itens na lista'}</div>
          </div>
          <div className="card-acao-fundo-decor" aria-hidden>🧺 🥖 🧀</div>
        </button>

        <button className="card-acao tarefas" onClick={() => ir('casa')}>
          <div className="card-acao-header">
            <span className="card-acao-tag">Tarefas</span>
            <div className="card-acao-icone"><Broom size={22} /></div>
          </div>
          <div className="card-acao-corpo">
            <div className="card-acao-numero">{tarefas.length}</div>
            <div className="card-acao-desc">{tarefas.length === 1 ? 'para hoje' : 'para hoje ou atrasadas'}</div>
          </div>
          <div className="card-acao-fundo-decor" aria-hidden>🧹 🗑️ ✨</div>
        </button>
      </div>

      {!s.txs.some(t => t.import_id && t.month === mes) && (
        <button
          className="btn fantasma cheio btn-extrato-inicio"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          onClick={() => setExtrato(true)}
        >
          <FileSpreadsheet size={18} /> Colocar o extrato do mês
        </button>
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
            <button onClick={() => arquivarCat(c.id)} aria-label={`Tirar categoria ${c.name}`} style={{ width: 26, height: 26, borderRadius: 0, background: 'var(--chao)' }}>✕</button>
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
