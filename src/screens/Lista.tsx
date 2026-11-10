import { AnimatePresence, motion } from 'motion/react'
import { QrCode, ScanLine, Search, ShoppingCart, Tag } from 'lucide-react'
import { Suspense, lazy, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { MARKET_SUGGESTIONS, METHODS, SECTIONS, guessSection, parseItem, qtyLabel } from '../lib/catalog'
import { basketByMarket, contaPadrao, contaVale, invoiceMonth, latestByMarket } from '../lib/finance'
import { ago, money, monthOf, norm, today } from '../lib/format'
import { say, useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { enviarFila, gravarOuGuardar, tamanhoFila } from '../lib/fila'
import type { Item, Market, Method, Price } from '../lib/types'
import { Adesivo, Cartaz, Sheet, Teclado, useCents, voarParaSacola } from '../ui'
import { EscolherConta } from './Saldos'
import { Comparar } from './Comparar'
import { EscanearNota, lerPendente } from './Nota'
import { mercadoDoCnpj } from '../lib/mercado'
import { precosPorCodigo, type Oferta } from '../lib/web'

const LerQR = lazy(() => import('./LerQR').then(m => ({ default: m.LerQR })))

const lerMercado = () => { try { return localStorage.getItem('mercado-atual') } catch { return null } }
const gravarMercado = (id: string | null) => { try { id ? localStorage.setItem('mercado-atual', id) : localStorage.removeItem('mercado-atual') } catch { /* sem armazenamento */ } }

export function Lista() {
  const s = useStore()
  const [texto, setTexto] = useState('')
  const [mercadoId, setMercadoId] = useState<string | null>(lerMercado)
  const [editando, setEditando] = useState<Item | null>(null)
  const [precoDe, setPrecoDe] = useState<Item | null>(null)
  const [escolherMercado, setEscolherMercado] = useState(false)
  const [fechar, setFechar] = useState(false)
  const [comparar, setComparar] = useState<Item | null>(null)
  const [escanear, setEscanear] = useState(false)
  const pendente = escanear ? null : lerPendente()
  const [web, setWeb] = useState<Oferta[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const mercado = s.markets.find(m => m.id === mercadoId) ?? null
  const abertos = useMemo(() => s.items.filter(i => !i.checked), [s.items])
  const riscados = useMemo(() => s.items.filter(i => i.checked), [s.items])
  const precosDoItem = useMemo(() => new Map(s.items.map(i => [i.id, latestByMarket(s.prices, i.name, i.ean)])), [s.items, s.prices])
  const noCarrinho = riscados.reduce((t, i) => t + (i.price ?? 0) * i.qty, 0)

  const eans = [...new Set(abertos.map(i => i.ean).filter(Boolean) as string[])].sort().join(',')
  useEffect(() => {
    if (!eans) { setWeb([]); return }
    let vivo = true
    precosPorCodigo(eans.split(',')).then(o => { if (vivo) setWeb(o) }).catch(() => {})
    return () => { vivo = false }
  }, [eans])
  const ofertasDe = (ean: string | null) => ean ? web.filter(o => o.ean === ean).sort((a, b) => a.preco - b.preco) : []
  const cestaSites = useMemo(() => {
    const com = abertos.filter(i => i.ean)
    const lojas = new Map<string, { mercado: string; total: number; n: number }>()
    for (const it of com) for (const o of web.filter(x => x.ean === it.ean)) {
      const r = lojas.get(o.loja) ?? { mercado: o.mercado, total: 0, n: 0 }
      r.total += o.preco * (+it.qty || 1); r.n++; lojas.set(o.loja, r)
    }
    return { com: com.length, lojas: [...lojas.values()].sort((a, b) => b.n - a.n || a.total - b.total) }
  }, [abertos, web])

  const grupos = useMemo(() => SECTIONS.map(sec => ({
    sec, itens: s.items.filter(i => i.section === sec.id).sort((a, b) => Number(a.checked) - Number(b.checked) || a.created_at.localeCompare(b.created_at)),
  })).filter(g => g.itens.length), [s.items])

  // sugestões: o que vocês já compraram e não está na lista
  const conhecidos = useMemo(() => {
    const naLista = new Set(s.items.map(i => norm(i.name)))
    const nomes = new Map<string, string>()
    for (const p of s.prices) if (!naLista.has(p.norm)) nomes.set(p.norm, p.name)
    for (const p of s.pantry) if (!naLista.has(norm(p.name))) nomes.set(norm(p.name), p.name)
    return [...nomes.entries()]
  }, [s.items, s.prices, s.pantry])
  const sugestoes = useMemo(() => {
    const q = norm(texto)
    return q.length < 2 ? [] : conhecidos.filter(([n]) => n.includes(q)).slice(0, 8).map(([, nome]) => nome)
  }, [texto, conhecidos])

  const adicionar = async (raw: string) => {
    const nomes = raw.split(/[,;\n]/).map(t => t.trim()).filter(Boolean)
    if (!nomes.length) return
    setTexto('')
    inputRef.current?.focus()
    const rows = nomes.map(n => {
      const p = parseItem(n)
      const pick = s.picks.find(k => k.norm === norm(p.name))
      return { ...p, section: guessSection(p.name), ean: pick?.ean ?? null, product: pick?.product ?? null }
    })
    const agora = new Date().toISOString()
    const linhas = rows.map(r => ({ ...r, id: crypto.randomUUID(), added_by: s.me?.user_id ?? null, created_at: agora }))
    s.patch('items', it => [...it, ...linhas.map(l => ({ ...l, note: null, checked: false, price: null, checked_by: null, checked_at: null, pantry_id: null }))])
    const { erro } = await gravarOuGuardar({ tipo: 'insert', tabela: 'shopping_items', linhas })
    if (erro) { s.toast(say({ message: erro }), 'erro'); s.patch('items', it => it.filter(i => !linhas.some(l => l.id === i.id))) }
  }

  const marcar = async (item: Item, el: HTMLElement | null) => {
    const checked = !item.checked
    if (checked) voarParaSacola(el, item.name, 300)
    if (checked && mercado) setPrecoDe(item)
    s.patch('items', it => it.map(i => i.id === item.id ? { ...i, checked, checked_by: checked ? s.me?.user_id ?? null : null, price: checked ? i.price : null } : i))
    const { erro } = await gravarOuGuardar({ tipo: 'update', tabela: 'shopping_items', id: item.id, valores: {
      checked, checked_by: checked ? s.me?.user_id : null, checked_at: checked ? new Date().toISOString() : null, ...(checked ? {} : { price: null }),
    } })
    if (erro) s.toast(say({ message: erro }), 'erro')
  }

  const enviar = (e: FormEvent) => { e.preventDefault(); adicionar(texto) }
  const cesta = useMemo(() => basketByMarket(abertos, s.prices, s.markets), [abertos, s.prices, s.markets])

  return (
    <div className="page">
      <div className="topo">
        <div>
          <h1 className="titulo">Feira</h1>
          <p className="leve" style={{ margin: '4px 0 0' }}>
            {abertos.length ? `${abertos.length} ${abertos.length === 1 ? 'item falta' : 'itens faltam'}` : 'Nada pendente'}
            {riscados.length > 0 && ` · ${riscados.length} no carrinho`}
          </p>
        </div>
        <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
          <button className={`btn pequeno ${mercado ? 'folha' : 'banana'}`} onClick={() => setEscolherMercado(true)}>
            <ShoppingCart size={16} /> {mercado ? mercado.name : 'Estou no mercado'}
          </button>
          <button className="btn pequeno fantasma" onClick={() => setEscanear(true)}><ScanLine size={16} /> Escanear nota</button>
        </div>
      </div>
      {pendente && (
        <button className="bloco banana" onClick={() => setEscanear(true)} style={{ display: 'flex', width: '100%', gap: 12, alignItems: 'center', textAlign: 'left', padding: '12px 16px', marginBottom: 8 }}>
          <span style={{ fontSize: 26 }} aria-hidden>🧾</span>
          <span style={{ flex: 1 }}><b>Nota {pendente.mercado ? `do ${pendente.mercado} ` : ''}esperando</b><br /><span className="pequeno">Toque para colar o texto e guardar os preços</span></span>
        </button>
      )}

      <div className="adicionar">
        <form onSubmit={enviar}>
          <label className="sr" htmlFor="novo-item">Adicionar item</label>
          <input id="novo-item" ref={inputRef} value={texto} onChange={e => setTexto(e.target.value)} autoComplete="off"
            placeholder="2 leite, pão, café 500g…" enterKeyHint="done" />
          <button type="submit" aria-label="Adicionar">+</button>
        </form>
        {sugestoes.length > 0 && (
          <div className="sugestoes">
            {sugestoes.map(n => <button key={n} className="chip" onClick={() => adicionar(n)}>+ {n}</button>)}
          </div>
        )}
      </div>

      {s.items.length === 0 && (
        <div className="vazio">
          <span className="emoji">🧺</span>
          A lista está vazia. Escreva acima o que falta em casa. Dá para pôr vários de uma vez, separando por vírgula.
        </div>
      )}

      {grupos.map(({ sec, itens }) => (
        <section className="banca" key={sec.id}>
          <h2 className="banca-titulo"><span aria-hidden>{sec.emoji}</span>{sec.name}<span className="conta">{itens.filter(i => !i.checked).length || '✓'}</span></h2>
          <div className="folha-lista">
            <AnimatePresence initial={false}>
              {itens.map(item => (
                <LinhaItem key={item.id} item={item} onMarcar={marcar} onEditar={() => setEditando(item)} onPreco={() => setPrecoDe(item)}
                  ofertas={ofertasDe(item.ean)} precos={precosDoItem.get(item.id) ?? []} onComparar={() => setComparar(item)} />
              ))}
            </AnimatePresence>
          </div>
        </section>
      ))}

      {riscados.length > 0 && (
        <div className="bloco bloco-carrinho" style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ flex: 1 }}>
            <div className="pequeno" style={{ fontWeight: 700 }}>No carrinho · {riscados.length} {riscados.length === 1 ? 'item' : 'itens'}</div>
            <Cartaz value={noCarrinho} size="m" />
          </div>
          <button className="btn tomate" onClick={() => setFechar(true)}>Fechar compra</button>
        </div>
      )}

      {cestaSites.lojas.length > 0 && (
        <>
          <div className="secao"><h2 className="subtitulo">Nos sites dos mercados</h2></div>
          <div className="folha-lista">
            {cestaSites.lojas.map((r, i) => (
              <div className="linha" key={r.mercado}>
                <span style={{ fontSize: 22 }} aria-hidden>{i === 0 ? '🏆' : '🛒'}</span>
                <div className="meio"><div className="nome">{r.mercado}</div>
                  <div className="info">tem {r.n} de {cestaSites.com} {cestaSites.com === 1 ? 'produto escolhido' : 'produtos escolhidos'}</div></div>
                <span className="valor">{money(r.total)}</span>
              </div>
            ))}
          </div>
          <p className="pequeno leve" style={{ margin: '8px 4px 0' }}>
            Preços das lojas online, que podem variar um pouco na prateleira. Toque na lupa de um item para escolher o produto e entrar na conta.
          </p>
        </>
      )}

      {cesta.length > 0 && abertos.length > 0 && (
        <>
          <div className="secao"><h2 className="subtitulo">Pelo que vocês anotaram</h2></div>
          <div className="folha-lista">
            {cesta.slice(0, 5).map((r, i) => (
              <div className="linha" key={r.market.id}>
                <span style={{ fontSize: 22 }} aria-hidden>{i === 0 ? '🏆' : '🏪'}</span>
                <div className="meio">
                  <div className="nome">{r.market.name}</div>
                  <div className="info">vocês têm preço de {r.known} de {abertos.length} itens</div>
                </div>
                <span className="valor">{money(r.total)}</span>
              </div>
            ))}
          </div>
          <p className="pequeno leve" style={{ margin: '8px 4px 0' }}>
            Pelos preços que vocês anotaram. Compare só mercados com o mesmo número de itens.
          </p>
        </>
      )}

      <EditarItem item={editando} onClose={() => setEditando(null)} onComparar={i => { setEditando(null); setComparar(i) }} />
      <Comparar item={comparar} onClose={() => setComparar(null)} />
      <EscanearNota open={escanear} onClose={() => setEscanear(false)} />
      <PrecoItem item={precoDe} mercado={mercado} onClose={() => setPrecoDe(null)} />
      <EscolherMercado open={escolherMercado} atual={mercadoId} onClose={() => setEscolherMercado(false)}
        onPick={id => { setMercadoId(id); gravarMercado(id); setEscolherMercado(false) }} />
      <FecharCompra open={fechar} mercado={mercado} onClose={() => setFechar(false)}
        onDone={() => { setFechar(false); setMercadoId(null); gravarMercado(null) }} />
    </div>
  )
}

function LinhaItem({ item, onMarcar, onEditar, onPreco, ofertas, precos, onComparar }: { item: Item; onMarcar: (i: Item, el: HTMLElement | null) => void; onEditar: () => void; onPreco: () => void; ofertas: Oferta[]; precos: Price[]; onComparar: () => void }) {
  const s = useStore()
  const ref = useRef<HTMLDivElement>(null)
  const melhor = precos[0]
  const nomeMercado = (id: string | null) => s.markets.find(m => m.id === id)?.name ?? 'algum mercado'
  const quem = s.member(item.added_by)
  return (
    <motion.div ref={ref} layout="position" className={`linha ${item.checked ? 'item-riscado' : ''}`}
      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
      <button className={`marca ${item.checked ? 'feito' : ''}`} onClick={() => onMarcar(item, ref.current)}
        aria-label={item.checked ? `Tirar ${item.name} do carrinho` : `Pôr ${item.name} no carrinho`} aria-pressed={item.checked}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden><path d="M5 12.5l4.5 4.5L19 7" pathLength={1} /></svg>
      </button>
      <button className="meio" onClick={onEditar} style={{ textAlign: 'left' }}>
        <div className="nome"><span className="risco">{qtyLabel(+item.qty, item.unit) && <span className="leve">{qtyLabel(+item.qty, item.unit)} </span>}{item.name}</span></div>
        {item.checked
          ? <div className="info">no carrinho{item.checked_by && item.checked_by !== s.me?.user_id ? ` por ${s.memberName(item.checked_by)}` : ''}</div>
          : ofertas[0]
            ? <div className="dica-preco">{money(ofertas[0].preco)}{ofertas[0].porKg ? '/kg' : ''} no {ofertas[0].mercado} · site{ofertas.length > 1 ? ` · ${money(ofertas[ofertas.length - 1].preco)} no ${ofertas[ofertas.length - 1].mercado}` : ''}</div>
            : melhor
              ? <div className="dica-preco">{money(melhor.unit_price)} no {nomeMercado(melhor.market_id)} · {ago(melhor.seen_at)}</div>
              : item.note ? <div className="info">{item.note}</div> : null}
      </button>
      {item.checked
        ? <button className="chip" onClick={onPreco} style={{ minHeight: 34 }}>{item.price != null ? money(item.price * item.qty) : '+ preço'}</button>
        : <>
            <button className="lupa" onClick={onComparar} aria-label={`Comparar ${item.name} nos sites`} title="Comparar nos sites">{item.ean ? <Tag size={16} /> : <Search size={16} />}</button>
            {quem && <Adesivo fruit={quem.fruit} size={24} title={`Pedido por ${quem.name}`} />}
          </>}
    </motion.div>
  )
}

function EditarItem({ item, onClose, onComparar }: { item: Item | null; onClose: () => void; onComparar: (i: Item) => void }) {
  const s = useStore()
  const [form, setForm] = useState<Item | null>(null)
  if (item && form?.id !== item.id) setForm(item)
  const salvar = async () => {
    if (!form) return
    onClose()
    s.patch('items', it => it.map(i => i.id === form.id ? form : i))
    const { erro } = await gravarOuGuardar({ tipo: 'update', tabela: 'shopping_items', id: form.id, valores: {
      name: form.name.trim() || item?.name, qty: form.qty || 1, unit: form.unit, section: form.section, note: form.note || null,
    } })
    if (erro) s.toast(say({ message: erro }), 'erro')
  }
  const apagar = async () => {
    if (!form) return
    onClose()
    s.patch('items', it => it.filter(i => i.id !== form.id))
    const { erro } = await gravarOuGuardar({ tipo: 'delete', tabela: 'shopping_items', ids: [form.id] })
    if (erro) s.toast(say({ message: erro }), 'erro'); else s.toast(`${form.name} saiu da lista`)
  }
  const historico = form ? latestByMarket(s.prices, form.name, form.ean) : []
  return (
    <Sheet open={!!item} onClose={onClose} title="Editar item">
      {form && (
        <>
          <label className="campo"><span>Nome</span>
            <input className="entrada" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
          <div className="lado">
            <label className="campo"><span>Quantidade</span>
              <input className="entrada num" type="number" inputMode="decimal" step="any" min="0" value={form.qty}
                onChange={e => setForm({ ...form, qty: Number(e.target.value) })} /></label>
            <label className="campo"><span>Unidade</span>
              <select className="entrada" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                {['un', 'kg', 'g', 'l', 'ml', 'pct', 'cx', 'dz', 'maço', 'bandeja', 'lata', 'garrafa'].map(u => <option key={u}>{u}</option>)}
              </select></label>
          </div>
          <div className="campo"><span>Seção</span>
            <div className="chips rola">
              {SECTIONS.map(sec => <button key={sec.id} className="chip" aria-pressed={form.section === sec.id}
                onClick={() => setForm({ ...form, section: sec.id })}>{sec.emoji} {sec.name}</button>)}
            </div>
          </div>
          <label className="campo"><span>Observação</span>
            <input className="entrada" value={form.note ?? ''} placeholder="Ex.: da marca de sempre"
              onChange={e => setForm({ ...form, note: e.target.value })} /></label>
          {historico.length > 0 && (
            <div className="campo"><span>Preços que vocês já viram</span>
              <div className="folha-lista" style={{ boxShadow: 'none', background: 'var(--chao)' }}>
                {historico.map(p => (
                  <div className="linha" key={p.id} style={{ background: 'transparent', minHeight: 46 }}>
                    <div className="meio"><div className="nome">{s.markets.find(m => m.id === p.market_id)?.name ?? '—'}</div>
                      <div className="info">{ago(p.seen_at)}</div></div>
                    <span className="valor">{money(p.unit_price)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <button className="btn banana cheio" style={{ marginTop: 18 }} onClick={() => item && onComparar(item)}>
            <Search size={18} /> {form.ean ? `Produto: ${form.product}` : 'Comparar nos sites dos mercados'}
          </button>
          <div className="acoes">
            <button className="btn fantasma" onClick={apagar}>Tirar da lista</button>
            <button className="btn" onClick={salvar}>Salvar</button>
          </div>
        </>
      )}
    </Sheet>
  )
}

function PrecoItem({ item, mercado, onClose }: { item: Item | null; mercado: Market | null; onClose: () => void }) {
  const s = useStore()
  const c = useCents(0)
  const [ultimo, setUltimo] = useState<string | null>(null)
  if (item && ultimo !== item.id) { setUltimo(item.id); c.set(item.price ?? 0) }
  const conhecido = item && mercado ? latestByMarket(s.prices, item.name, item.ean).find(p => p.market_id === mercado.id) : undefined
  const salvar = async () => {
    if (!item) return
    onClose()
    const price = c.value > 0 ? c.value : null
    s.patch('items', it => it.map(i => i.id === item.id ? { ...i, price } : i))
    const { erro } = await gravarOuGuardar({ tipo: 'update', tabela: 'shopping_items', id: item.id, valores: { price } })
    if (erro) s.toast(say({ message: erro }), 'erro')
  }
  return (
    <Sheet open={!!item} onClose={onClose} title={item ? `Preço de ${item.name}` : ''}>
      <p className="leve pequeno" style={{ margin: 0 }}>
        Preço de uma unidade{item && item.unit !== 'un' ? ` (por ${item.unit})` : ''}{mercado ? ` no ${mercado.name}` : ''}.
        {conhecido && <> Da última vez: <b>{money(conhecido.unit_price)}</b>.</>}
      </p>
      <div className="visor sai cabe"><Cartaz value={c.value} size="g" /></div>
      <Teclado onKey={c.press} />
      <div className="acoes">
        <button className="btn fantasma" onClick={onClose}>Sem preço</button>
        <button className="btn folha" onClick={salvar}>Anotar</button>
      </div>
    </Sheet>
  )
}

function EscolherMercado({ open, atual, onClose, onPick }: { open: boolean; atual: string | null; onClose: () => void; onPick: (id: string | null) => void }) {
  const s = useStore()
  const [novo, setNovo] = useState('')
  const criar = async (name: string) => {
    const existe = s.markets.find(m => norm(m.name) === norm(name))
    if (existe) return onPick(existe.id)
    const { data, error } = await supabase.from('markets').insert({ name: name.trim() }).select().single()
    if (error) return s.toast(say(error), 'erro')
    s.patch('markets', m => [...m, data])
    onPick(data.id)
  }
  const sugestoes = MARKET_SUGGESTIONS.filter(n => !s.markets.some(m => norm(m.name) === norm(n)))
  return (
    <Sheet open={open} onClose={onClose} title="Em qual mercado?">
      <p className="leve pequeno" style={{ marginTop: 0 }}>
        Com o mercado escolhido, ao pôr cada item no carrinho o app pede o preço. Assim vocês descobrem onde cada coisa sai mais barato.
      </p>
      <div className="chips">
        {s.markets.map(m => <button key={m.id} className="chip folha" aria-pressed={atual === m.id} onClick={() => onPick(m.id)}>{m.name}</button>)}
        {sugestoes.map(n => <button key={n} className="chip" onClick={() => criar(n)}>+ {n}</button>)}
      </div>
      <form className="lado" style={{ marginTop: 14 }} onSubmit={e => { e.preventDefault(); if (novo.trim()) criar(novo) }}>
        <input className="entrada" value={novo} onChange={e => setNovo(e.target.value)} placeholder="Outro mercado" />
        <button className="btn" style={{ flex: 'none' }}>Usar</button>
      </form>
      {atual && <button className="btn fantasma cheio" style={{ marginTop: 16 }} onClick={() => onPick(null)}>Saí do mercado</button>}
    </Sheet>
  )
}

function FecharCompra({ open, mercado, onClose, onDone }: { open: boolean; mercado: Market | null; onClose: () => void; onDone: () => void }) {
  const s = useStore()
  const riscados = s.items.filter(i => i.checked)
  const soma = riscados.reduce((t, i) => t + (i.price ?? 0) * i.qty, 0)
  const c = useCents(soma)
  const [aberto, setAberto] = useState(false)
  const [mercadoId, setMercadoId] = useState<string | null>(null)
  const [lancar, setLancar] = useState(true)
  const [metodo, setMetodo] = useState<Method>('debito')
  const [cartao, setCartao] = useState<string | null>(null)
  const [quem, setQuem] = useState<string | null>(null)
  const [conta, setConta] = useState<string | null>(null)
  const [chave, setChave] = useState<string | null>(null)
  const [lendo, setLendo] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tripId, setTripId] = useState('') // mesmo código ao tentar de novo: não duplica a compra
  if (open && !aberto) { setAberto(true); setTripId(crypto.randomUUID()); c.set(soma); setMercadoId(mercado?.id ?? null); setQuem(s.me?.user_id ?? null); setConta(contaPadrao(s.accounts, s.me?.user_id)); setChave(null) }
  if (!open && aberto) setAberto(false)

  const cards = s.cards.filter(k => !k.archived)
  const mercadoEscolhido = s.markets.find(m => m.id === mercadoId)
  const vale = contaVale(s.accounts, quem)
  const ehVale = (id: string | null) => s.accounts.find(a => a.id === id)?.kind === 'alimentacao'

  const daNota = async (cnpj: string, key: string) => {
    setLendo(false); setChave(key)
    const m = await mercadoDoCnpj(s, cnpj)
    if (!m) return s.toast('Não deu para identificar o mercado dessa nota.', 'erro')
    setMercadoId(m.id); s.toast(`Nota do ${m.name}`)
  }

  const confirmar = async () => {
    if (busy) return
    if (!navigator.onLine) return s.toast('Para fechar a compra precisa de internet. Os itens continuam no carrinho.', 'erro')
    setBusy(true)
    try {
      // o que ficou guardado sem internet vai antes, para a compra ver a lista completa
      await enviarFila()
      if (tamanhoFila() > 0) throw new Error('Failed to fetch')
      const total = c.value
      const card = cards.find(k => k.id === cartao)
      const mercadoCat = s.categories.find(k => k.kind === 'out' && norm(k.name) === 'mercado')
      const precos = riscados.filter(i => i.price != null && i.price > 0).map(i => ({
        name: i.name, norm: norm(i.name), unit: i.unit, unit_price: i.price, ean: i.ean,
      }))
      const ids = riscados.map(i => i.id)
      const { error } = await supabase.rpc('guardar_compra', {
        p_trip: tripId, p_market: mercadoId, p_total: total, p_itens: riscados.length, p_chave: chave ?? '',
        p_precos: precos, p_apagar: ids,
        p_tx: lancar && total > 0 ? {
          amount: total, description: mercadoEscolhido ? `Mercado · ${mercadoEscolhido.name}` : 'Mercado',
          category_id: mercadoCat?.id ?? null, member_id: quem, occurred_on: today(), method: metodo,
          card_id: metodo === 'credito' ? card?.id ?? null : null,
          month: metodo === 'credito' && card ? invoiceMonth(today(), card) : monthOf(new Date()),
          installment: metodo === 'credito' ? 1 : null, installments: metodo === 'credito' ? 1 : null,
          account_id: metodo === 'credito' ? null : conta,
        } : null,
      })
      if (error) throw error
      s.patch('items', it => it.filter(i => !ids.includes(i.id)))
      s.toast(lancar && total > 0 ? `Compra fechada: ${money(total)} lançado` : 'Compra fechada')
      await s.reload()
      onDone()
    } catch (e) { s.toast(say(e), 'erro') } finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Fechar compra">
      <p className="leve pequeno" style={{ margin: 0 }}>
        {riscados.length} {riscados.length === 1 ? 'item' : 'itens'}. Confira o total da nota; se for diferente, corrija.
      </p>
      <div className="visor sai cabe"><Cartaz value={c.value} size="g" /></div>
      <Teclado onKey={c.press} />

      <div className="campo"><span>Mercado</span>
        <div className="chips">
          {s.markets.map(m => <button key={m.id} className="chip folha" aria-pressed={mercadoId === m.id} onClick={() => setMercadoId(m.id)}>{m.name}</button>)}
          <button className="chip" onClick={() => setLendo(true)}><QrCode size={16} /> Ler QR da nota</button>
        </div>
        {chave && <p className="pequeno leve" style={{ margin: '6px 4px 0' }}>Nota identificada pelo QR.</p>}
      </div>

      <label className="campo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="checkbox" checked={lancar} onChange={e => setLancar(e.target.checked)} style={{ width: 22, height: 22 }} />
        <span style={{ margin: 0 }}>Lançar como gasto no mês</span>
      </label>

      {lancar && (
        <>
          <div className="campo"><span>Quem pagou</span>
            <div className="chips">
              {s.members.map(m => <button key={m.user_id} className="chip" aria-pressed={quem === m.user_id} onClick={() => { setQuem(m.user_id); setConta(contaPadrao(s.accounts, m.user_id)) }}>
                <Adesivo fruit={m.fruit} size={22} /> {m.name}</button>)}
            </div>
          </div>
          <div className="campo"><span>Como pagou</span>
            <div className="chips">
              {METHODS.filter(m => m.id !== 'boleto' && (m.id !== 'vale' || vale)).map(m => <button key={m.id} className="chip" aria-pressed={metodo === m.id}
                onClick={() => { setMetodo(m.id as Method); if (m.id === 'credito' && !cartao) setCartao(cards[0]?.id ?? null); if (m.id === 'vale') setConta(vale?.id ?? null); else if (ehVale(conta)) setConta(contaPadrao(s.accounts, quem)) }}>{m.label}</button>)}
            </div>
            {metodo === 'credito' && (
              cards.length
                ? <div className="chips" style={{ marginTop: 8 }}>{cards.map(k => <button key={k.id} className="chip" aria-pressed={cartao === k.id} onClick={() => setCartao(k.id)}>💳 {k.name}</button>)}</div>
                : <p className="pequeno" style={{ color: 'var(--tomate)', fontWeight: 700 }}>Cadastre um cartão em Dinheiro › Cartões.</p>
            )}
          </div>
          {metodo !== 'credito' && <EscolherConta value={conta} onChange={id => { setConta(id); if (ehVale(id)) setMetodo('vale'); else if (metodo === 'vale') setMetodo('debito') }} titulo="Saiu de qual conta" />}
        </>
      )}

      <button className="btn tomate cheio" style={{ marginTop: 22 }} onClick={confirmar}
        disabled={busy || (lancar && metodo === 'credito' && !cartao)}>
        {busy ? 'Fechando…' : 'Fechar compra'}
      </button>
      {lendo && <Suspense fallback={null}><LerQR onClose={() => setLendo(false)} onNota={daNota} /></Suspense>}
    </Sheet>
  )
}
