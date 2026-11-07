import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState, type FormEvent } from 'react'
import { CHORE_SUGGESTIONS, SECTIONS, guessSection } from '../lib/catalog'
import { choreStatus } from '../lib/finance'
import { ago, monthOf } from '../lib/format'
import { say, useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import type { Chore, Pantry, PantryStatus } from '../lib/types'
import { Adesivo, Sheet } from '../ui'

export function Casa() {
  const [aba, setAba] = useState<'despensa' | 'tarefas'>('despensa')
  return (
    <div className="page">
      <div className="topo"><h1 className="titulo">Casa</h1></div>
      <div className="segmento">
        <button aria-pressed={aba === 'despensa'} onClick={() => setAba('despensa')}>🥫 Despensa</button>
        <button aria-pressed={aba === 'tarefas'} onClick={() => setAba('tarefas')}>🧹 Tarefas</button>
      </div>
      {aba === 'despensa' ? <Despensa /> : <Tarefas />}
    </div>
  )
}

/* ------------------------------------------------------------------ despensa */
const ESTADOS: { id: PantryStatus; label: string; curto: string }[] = [
  { id: 'cheio', label: 'Tem', curto: 'tem' },
  { id: 'acabando', label: 'Acabando', curto: '½' },
  { id: 'acabou', label: 'Acabou', curto: '0' },
]

function Despensa() {
  const s = useStore()
  const [nome, setNome] = useState('')
  const [editar, setEditar] = useState<Pantry | null>(null)
  const [filtro, setFiltro] = useState<'todos' | 'faltando'>('todos')
  const lista = s.pantry.filter(p => filtro === 'todos' || p.status !== 'cheio')
  const grupos = useMemo(() => SECTIONS.map(sec => ({ sec, itens: lista.filter(p => p.section === sec.id) })).filter(g => g.itens.length), [lista])
  const faltando = s.pantry.filter(p => p.status !== 'cheio').length

  const adicionar = async (e: FormEvent) => {
    e.preventDefault()
    const nomes = nome.split(/[,;]/).map(n => n.trim()).filter(Boolean)
    if (!nomes.length) return
    setNome('')
    const { error } = await supabase.from('pantry').insert(nomes.map(n => ({ name: n.charAt(0).toUpperCase() + n.slice(1), section: guessSection(n) })))
    if (error) s.toast(say(error), 'erro'); else await s.reload()
  }

  const mudar = async (p: Pantry, status: PantryStatus) => {
    if (p.status === status) return
    s.patch('pantry', ps => ps.map(x => x.id === p.id ? { ...x, status, updated_by: s.me?.user_id ?? null, updated_at: new Date().toISOString() } : x))
    const { error } = await supabase.from('pantry').update({ status, updated_by: s.me?.user_id, updated_at: new Date().toISOString() }).eq('id', p.id)
    if (error) return s.toast(say(error), 'erro')
    if (status !== 'cheio' && p.status === 'cheio') {
      const jaNaLista = s.items.some(i => !i.checked && i.name.toLowerCase() === p.name.toLowerCase())
      s.toast(jaNaLista ? `${p.name} já estava na lista` : `${p.name} foi para a lista 🛒`)
    }
  }

  return (
    <>
      <div className="adicionar" style={{ marginTop: 8 }}>
        <form onSubmit={adicionar}>
          <label className="sr" htmlFor="nova-despensa">Adicionar à despensa</label>
          <input id="nova-despensa" value={nome} onChange={e => setNome(e.target.value)} placeholder="Arroz, azeite, sabão em pó…" autoComplete="off" />
          <button type="submit" aria-label="Adicionar">+</button>
        </form>
      </div>
      <p className="pequeno leve" style={{ margin: '0 4px 8px' }}>Marcou <b>acabando</b> ou <b>acabou</b>, o item entra sozinho na lista de compras. Ao fechar a compra, volta para <b>tem</b>.</p>
      {s.pantry.length > 0 && (
        <div className="chips">
          <button className="chip" aria-pressed={filtro === 'todos'} onClick={() => setFiltro('todos')}>Tudo · {s.pantry.length}</button>
          <button className="chip tomate" aria-pressed={filtro === 'faltando'} onClick={() => setFiltro('faltando')}>Faltando · {faltando}</button>
        </div>
      )}
      {s.pantry.length === 0 && <div className="vazio"><span className="emoji">🥫</span>Cadastre o que costuma ter em casa. Quando estiver acabando, um toque manda para a lista.</div>}
      {grupos.map(({ sec, itens }) => (
        <section className="banca" key={sec.id}>
          <h2 className="banca-titulo"><span aria-hidden>{sec.emoji}</span>{sec.name}</h2>
          <div className="folha-lista">
            {itens.map(p => (
              <div className="linha" key={p.id}>
                <button className="meio" style={{ textAlign: 'left' }} onClick={() => setEditar(p)}>
                  <div className="nome">{p.name}</div>
                  <div className="info">{p.updated_by ? `${s.memberName(p.updated_by)} · ${ago(p.updated_at)}` : ''}</div>
                </button>
                <div className="estado" role="group" aria-label={`Quanto tem de ${p.name}`}>
                  {ESTADOS.map(e => (
                    <button key={e.id} className={e.id} aria-pressed={p.status === e.id} aria-label={e.label} title={e.label} onClick={() => mudar(p, e.id)}>{e.curto}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
      <EditarDespensa item={editar} onClose={() => setEditar(null)} />
    </>
  )
}

function EditarDespensa({ item, onClose }: { item: Pantry | null; onClose: () => void }) {
  const s = useStore()
  const [f, setF] = useState<Pantry | null>(null)
  if (item && f?.id !== item.id) setF(item)
  const salvar = async () => {
    if (!f) return
    const { error } = await supabase.from('pantry').update({ name: f.name.trim(), section: f.section }).eq('id', f.id)
    if (error) return s.toast(say(error), 'erro')
    await s.reload(); onClose()
  }
  const apagar = async () => {
    if (!f) return
    const { error } = await supabase.from('pantry').delete().eq('id', f.id)
    if (error) return s.toast(say(error), 'erro')
    await s.reload(); onClose()
  }
  return (
    <Sheet open={!!item} onClose={onClose} title="Item da despensa">
      {f && <>
        <label className="campo"><span>Nome</span><input className="entrada" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
        <div className="campo"><span>Seção</span>
          <div className="chips rola">{SECTIONS.map(sec => <button key={sec.id} className="chip" aria-pressed={f.section === sec.id} onClick={() => setF({ ...f, section: sec.id })}>{sec.emoji} {sec.name}</button>)}</div>
        </div>
        <div className="acoes">
          <button className="btn fantasma" onClick={apagar}>Tirar da despensa</button>
          <button className="btn" onClick={salvar}>Salvar</button>
        </div>
      </>}
    </Sheet>
  )
}

/* ------------------------------------------------------------------ tarefas */
function Tarefas() {
  const s = useStore()
  const [nova, setNova] = useState(false)
  const [editar, setEditar] = useState<Chore | null>(null)
  const mes = monthOf(new Date())
  const placar = s.members.map(m => ({ m, n: s.choreLog.filter(l => l.done_by === m.user_id && monthOf(new Date(l.done_at)) === mes).length }))
  const ordenadas = [...s.chores].sort((a, b) => choreStatus(a.last_done_at, a.every_days).days - choreStatus(b.last_done_at, b.every_days).days)

  const feito = async (c: Chore) => {
    const outros = s.members.filter(m => m.user_id !== s.me?.user_id)
    const proximo = c.rotate && outros.length ? outros[0].user_id : c.assignee
    const agora = new Date().toISOString()
    s.patch('chores', cs => cs.map(x => x.id === c.id ? { ...x, last_done_at: agora, last_done_by: s.me?.user_id ?? null, assignee: proximo } : x))
    const { error } = await supabase.from('chores').update({ last_done_at: agora, last_done_by: s.me?.user_id, assignee: proximo }).eq('id', c.id)
    if (error) return s.toast(say(error), 'erro')
    await supabase.from('chore_log').insert({ chore_id: c.id })
    s.toast(c.rotate && proximo && proximo !== s.me?.user_id ? `Feito! Próxima vez é com ${s.memberName(proximo)}` : 'Feito!')
  }

  return (
    <>
      {s.members.length > 0 && s.chores.length > 0 && (
        <div className="bloco uva" style={{ marginTop: 18 }}>
          <div className="pequeno" style={{ fontWeight: 700, opacity: 0.9 }}>Placar do mês</div>
          <div style={{ display: 'flex', gap: 22, marginTop: 8 }}>
            {placar.map(({ m, n }) => (
              <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Adesivo fruit={m.fruit} size={36} />
                <div><div style={{ fontWeight: 700 }}>{m.name}</div><div className="grande">{n}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="secao"><h2 className="subtitulo">Tarefas</h2><button className="btn pequeno banana" onClick={() => setNova(true)}>+ Tarefa</button></div>
      {s.chores.length === 0 && <div className="vazio"><span className="emoji">🧹</span>Cadastre as tarefas da casa. Com rodízio ligado, quem faz passa a vez para o outro.</div>}
      <div className="folha-lista">
        <AnimatePresence initial={false}>
          {ordenadas.map(c => {
            const st = choreStatus(c.last_done_at, c.every_days)
            const resp = s.member(c.assignee)
            return (
              <motion.div layout className="linha" key={c.id}>
                <button style={{ fontSize: 26, width: 32 }} onClick={() => setEditar(c)} aria-label={`Editar ${c.name}`}>{c.emoji}</button>
                <button className="meio" style={{ textAlign: 'left' }} onClick={() => setEditar(c)}>
                  <div className="nome">{c.name}</div>
                  <div className="info" style={{ color: st.late ? 'var(--tomate)' : undefined, fontWeight: st.late ? 700 : 400 }}>
                    {st.label}{c.last_done_by ? ` · última: ${s.memberName(c.last_done_by)}` : ''}
                  </div>
                </button>
                {resp && <Adesivo fruit={resp.fruit} size={26} title={`Vez de ${resp.name}`} />}
                <button className="btn pequeno folha" onClick={() => feito(c)}>Feito</button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
      <EditarTarefa tarefa={nova ? 'nova' : editar} onClose={() => { setNova(false); setEditar(null) }} />
    </>
  )
}

function EditarTarefa({ tarefa, onClose }: { tarefa: Chore | 'nova' | null; onClose: () => void }) {
  const s = useStore()
  const [chave, setChave] = useState<string | null>(null)
  const [f, setF] = useState({ name: '', emoji: '🧹', every_days: 7, rotate: true, assignee: null as string | null })
  const k = tarefa === 'nova' ? 'nova' : tarefa?.id ?? null
  if (k && chave !== k) {
    setChave(k)
    setF(tarefa && tarefa !== 'nova'
      ? { name: tarefa.name, emoji: tarefa.emoji, every_days: tarefa.every_days, rotate: tarefa.rotate, assignee: tarefa.assignee }
      : { name: '', emoji: '🧹', every_days: 7, rotate: true, assignee: s.me?.user_id ?? null })
  }
  if (!k && chave) setChave(null)
  const salvar = async () => {
    if (!f.name.trim()) return s.toast('Dê um nome para a tarefa', 'erro')
    const row = { ...f, name: f.name.trim(), every_days: Math.max(1, Math.min(365, f.every_days || 1)) }
    const { error } = tarefa === 'nova' ? await supabase.from('chores').insert(row) : await supabase.from('chores').update(row).eq('id', (tarefa as Chore).id)
    if (error) return s.toast(say(error), 'erro')
    await s.reload(); onClose()
  }
  const apagar = async () => {
    if (!tarefa || tarefa === 'nova') return
    await supabase.from('chores').delete().eq('id', tarefa.id)
    await s.reload(); onClose()
  }
  const usadas = new Set(s.chores.map(c => c.name))
  return (
    <Sheet open={!!tarefa} onClose={onClose} title={tarefa === 'nova' ? 'Nova tarefa' : 'Editar tarefa'}>
      {tarefa === 'nova' && (
        <div className="chips rola" style={{ marginBottom: 6 }}>
          {CHORE_SUGGESTIONS.filter(c => !usadas.has(c.name)).map(c => <button key={c.name} className="chip" onClick={() => setF({ ...f, name: c.name, emoji: c.emoji, every_days: c.every })}>{c.emoji} {c.name}</button>)}
        </div>
      )}
      <label className="campo"><span>Tarefa</span><input className="entrada" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
      <div className="chips" style={{ marginTop: 10 }}>{['🧹', '🗑️', '🍽️', '🧺', '🚿', '🛏️', '🪴', '🐶', '🚗', '🧽'].map(e => <button key={e} className="chip" aria-pressed={f.emoji === e} onClick={() => setF({ ...f, emoji: e })} style={{ fontSize: 20 }}>{e}</button>)}</div>
      <label className="campo"><span>A cada quantos dias</span>
        <input className="entrada num" type="number" min={1} max={365} inputMode="numeric" value={f.every_days} onChange={e => setF({ ...f, every_days: Number(e.target.value) })} /></label>
      <div className="campo"><span>Vez de quem</span>
        <div className="chips">{s.members.map(m => <button key={m.user_id} className="chip" aria-pressed={f.assignee === m.user_id} onClick={() => setF({ ...f, assignee: m.user_id })}><Adesivo fruit={m.fruit} size={20} /> {m.name}</button>)}</div>
      </div>
      <label className="campo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="checkbox" checked={f.rotate} onChange={e => setF({ ...f, rotate: e.target.checked })} style={{ width: 22, height: 22 }} />
        <span style={{ margin: 0 }}>Rodízio: quem fizer passa a vez para o outro</span>
      </label>
      <div className="acoes">
        {tarefa !== 'nova' && <button className="btn fantasma" onClick={apagar}>Apagar</button>}
        <button className="btn" onClick={salvar}>Salvar</button>
      </div>
    </Sheet>
  )
}

