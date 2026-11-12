import { Suspense, lazy, useMemo, useState } from 'react'
import { Camera, ClipboardPaste } from 'lucide-react'
import { dayMonth, money, norm } from '../lib/format'
import { mercadoDoCnpj } from '../lib/mercado'
import { lerNota, type ItemNota } from '../lib/nota'
import { say, useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Sheet } from '../ui'

const LerQR = lazy(() => import('./LerQR').then(m => ({ default: m.LerQR })))

/** Nota lida pelo QR, esperando o texto (fica guardada se o app fechar enquanto você está no site) */
export interface NotaPendente { url: string; chave: string; cnpj: string; mercadoId: string | null; mercado: string | null; t: number }
const CHAVE = 'nota-pendente'
export const lerPendente = (): NotaPendente | null => {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE) ?? 'null') as NotaPendente | null
    return v && Date.now() - v.t < 6 * 3600 * 1000 ? v : null
  } catch { return null }
}
const gravarPendente = (v: NotaPendente | null) => {
  try {
    if (v) localStorage.setItem(CHAVE, JSON.stringify(v))
    else localStorage.removeItem(CHAVE)
  } catch { /* sem armazenamento */ }
}

export function EscanearNota({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore()
  const [aberto, setAberto] = useState(false)
  const [pend, setPend] = useState<NotaPendente | null>(null)
  const [camera, setCamera] = useState(false)
  const [texto, setTexto] = useState('')
  const [desmarcados, setDesmarcados] = useState<Set<number>>(new Set())
  const [jaGuardada, setJaGuardada] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tripId, setTripId] = useState('') // tentar de novo não duplica a nota

  if (open && !aberto) {
    setAberto(true)
    setTripId(crypto.randomUUID())
    const p = lerPendente()
    setPend(p); setTexto(''); setDesmarcados(new Set()); setJaGuardada(null)
    setCamera(!p) // sem nota esperando: já abre a câmera
  }
  if (!open && aberto) { setAberto(false); setCamera(false) }

  const nota = useMemo(() => texto.trim().length > 30 ? lerNota(texto) : null, [texto])
  const marcados = useMemo(() => new Set((nota?.itens.map((_, i) => i) ?? []).filter(i => !desmarcados.has(i))), [nota, desmarcados])

  const lido = async (cnpj: string, chave: string, conteudo: string) => {
    setCamera(false)
    const url = /^https?:\/\//i.test(conteudo.trim()) ? conteudo.trim() : ''
    const base: NotaPendente = { url, chave, cnpj, mercadoId: null, mercado: null, t: Date.now() }
    setPend(base); gravarPendente(base)
    const m = await mercadoDoCnpj(s, cnpj)
    const comMercado = { ...base, mercadoId: m?.id ?? null, mercado: m?.name ?? null }
    setPend(comMercado); gravarPendente(comMercado)
    const { data } = await supabase.from('trips').select('created_at').eq('access_key', chave).limit(1)
    if (data?.length) setJaGuardada(data[0].created_at)
  }

  const colar = async () => {
    try {
      const t = await navigator.clipboard.readText()
      if (!t.trim()) return s.toast('A área de transferência está vazia. Copie a nota no site primeiro.', 'erro')
      setTexto(t)
    } catch {
      s.toast('O celular não deixou colar pelo botão. Toque e segure no campo abaixo e escolha Colar.', 'erro')
    }
  }

  const guardar = async () => {
    if (!nota || busy) return
    const itens = nota.itens.filter((_, i) => marcados.has(i))
    if (!itens.length) return
    setBusy(true)
    try {
      let mercadoId = pend?.mercadoId ?? null
      let mercadoNome = pend?.mercado ?? null
      if (!mercadoId && nota.cnpj) {
        const m = await mercadoDoCnpj(s, nota.cnpj, nota.mercado)
        mercadoId = m?.id ?? null; mercadoNome = m?.name ?? null
      }
      const quando = nota.data ? `${nota.data}T12:00:00` : new Date().toISOString()
      const { error } = await supabase.rpc('guardar_compra', {
        p_trip: tripId, p_market: mercadoId, p_total: nota.total ?? itens.reduce((a, i) => a + i.total, 0),
        p_itens: itens.length, p_chave: pend?.chave ?? '', p_tx: null, p_apagar: [],
        p_precos: itens.map((it: ItemNota) => ({ name: it.nome, norm: norm(it.nome), unit: it.un, unit_price: it.unit, ean: it.ean, seen_at: quando })),
      })
      if (error) throw error
      gravarPendente(null)
      s.toast(`${itens.length} ${itens.length === 1 ? 'preço guardado' : 'preços guardados'}${mercadoNome ? ` do ${mercadoNome}` : ''}`)
      await s.reload()
      onClose()
    } catch (e) { s.toast(say(e), 'erro') } finally { setBusy(false) }
  }

  const descartar = () => { gravarPendente(null); setPend(null); setTexto(''); setDesmarcados(new Set()); setCamera(true) }
  const alternar = (i: number) => setDesmarcados(m => { const n = new Set(m); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const qtdItens = nota?.itens.length ?? 0

  return (
    <Sheet open={open} onClose={onClose} title="Escanear nota">
      {camera && (
        <Suspense fallback={null}>
          <LerQR onClose={() => setCamera(false)} onNota={(cnpj, chave, conteudo) => { void lido(cnpj, chave, conteudo ?? '') }} />
        </Suspense>
      )}

      {qtdItens > 0 && nota ? (
        <>
          <div className="bloco folha" style={{ padding: 16 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Achei {qtdItens} {qtdItens === 1 ? 'produto' : 'produtos'}</div>
            <div className="pequeno" style={{ opacity: 0.9 }}>
              {pend?.mercado ?? nota.mercado ?? 'Mercado'}{nota.data ? ` · ${dayMonth(nota.data)}` : ''}{nota.total ? ` · nota de ${money(nota.total)}` : ''}
            </div>
          </div>
          <p className="pequeno leve" style={{ margin: '10px 4px' }}>
            Desmarque o que não quiser guardar. Só os preços são guardados: o gasto da compra você lança em Dinheiro, se quiser.
          </p>
          <div className="folha-lista" style={{ boxShadow: 'none', border: '1px solid var(--linha)' }}>
            {nota.itens.map((it, i) => (
              <label className="linha" key={i} style={{ cursor: 'pointer', minHeight: 54 }}>
                <input type="checkbox" checked={marcados.has(i)} onChange={() => alternar(i)} style={{ width: 22, height: 22, flex: 'none' }} />
                <div className="meio">
                  <div className="nome" style={{ whiteSpace: 'normal' }}>{it.nome}</div>
                  <div className="info">{String(it.qtd).replace('.', ',')} {it.un} × {money(it.unit)}{it.un === 'kg' ? '/kg' : ''}</div>
                </div>
                <span className="valor">{money(it.total)}</span>
              </label>
            ))}
          </div>
          <button className="btn folha cheio" style={{ marginTop: 18 }} onClick={guardar} disabled={busy || !marcados.size}>
            {busy ? 'Guardando…' : `Guardar ${marcados.size} ${marcados.size === 1 ? 'preço' : 'preços'}`}
          </button>
          <button className="btn fantasma cheio" style={{ marginTop: 10 }} onClick={() => { setTexto(''); setDesmarcados(new Set()) }}>Colar de novo</button>
        </>
      ) : (
        <ol className="passos">
          <li className={pend ? 'feito' : 'atual'}>
            <b>Ler o QR do cupom</b>
            {pend ? (
              <p>✓ {pend.mercado ? `Cupom do ${pend.mercado}` : 'Cupom lido'}. <button className="link" onClick={descartar}>Ler outro</button></p>
            ) : (
              <>
                <p>É o quadradinho no fim do cupom fiscal.</p>
                <button className="btn tomate" onClick={() => setCamera(true)}><Camera size={18} /> Abrir câmera</button>
                <p className="pequeno"><button className="link" onClick={() => setPend({ url: '', chave: '', cnpj: '', mercadoId: null, mercado: null, t: Date.now() })}>Já estou com a nota aberta no navegador</button></p>
              </>
            )}
            {jaGuardada && <p className="aviso">Essa nota já foi guardada em {dayMonth(jaGuardada)}. Se guardar de novo, os preços ficam repetidos.</p>}
          </li>

          <li className={pend && !texto ? 'atual' : pend ? 'feito' : ''}>
            <b>Abrir a nota e copiar</b>
            {pend?.url && <a className="btn banana" href={pend.url} target="_blank" rel="noopener noreferrer">Abrir nota no site da Sefaz</a>}
            <ul>
              <li>No site, faça a verificação <i>"Não sou um robô"</i>.</li>
              <li>Quando aparecer a lista de produtos, <b>toque e segure</b> em qualquer texto.</li>
              <li>Escolha <b>Selecionar tudo</b> e depois <b>Copiar</b>.</li>
              <li>Volte para este app. A nota fica esperando aqui.</li>
            </ul>
          </li>

          <li className={pend ? 'atual' : ''}>
            <b>Colar aqui</b>
            <button className="btn cheio" onClick={colar} disabled={!pend}><ClipboardPaste size={18} /> Colar nota</button>
            <textarea className="entrada" value={texto} onChange={e => setTexto(e.target.value)} disabled={!pend}
              placeholder="Ou toque e segure aqui e escolha Colar" style={{ marginTop: 10, minHeight: 80 }} aria-label="Texto da nota" />
            {nota && !qtdItens && (
              <p className="aviso">
                Não reconheci produtos nesse texto. Confira se copiou a página inteira da nota (com <b>Selecionar tudo</b>),
                depois da verificação. Se continuar, mande o texto para o Jonas ajustar o app.
              </p>
            )}
          </li>
        </ol>
      )}
    </Sheet>
  )
}
