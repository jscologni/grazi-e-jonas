import { useEffect, useState, type FormEvent } from 'react'
import { money, norm } from '../lib/format'
import { say, useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import type { Item } from '../lib/types'
import { agruparPorProduto, buscarNosSites, type Oferta } from '../lib/web'
import { Sheet } from '../ui'

/** Busca o item nos sites do Angeloni, Bistek, Giassi e Atacadão e deixa escolher o produto exato */
export function Comparar({ item, onClose }: { item: Item | null; onClose: () => void }) {
  const s = useStore()
  const [chave, setChave] = useState<string | null>(null)
  const [termo, setTermo] = useState('')
  const [ofertas, setOfertas] = useState<Oferta[] | null>(null)
  const [erro, setErro] = useState('')
  const [buscando, setBuscando] = useState(false)

  const buscar = async (t: string) => {
    if (t.trim().length < 2) return
    setBuscando(true); setErro('')
    try { setOfertas(await buscarNosSites(t)) } catch (e) { setErro(say(e)); setOfertas([]) } finally { setBuscando(false) }
  }
  if (item && chave !== item.id) {
    setChave(item.id)
    const t = item.product ?? item.name
    setTermo(t); setOfertas(null); setErro(''); setBuscando(true)
  }
  if (!item && chave) setChave(null)
  // busca assim que abre (uma vez por item)
  useEffect(() => {
    if (!item) return
    let vivo = true
    buscarNosSites(item.product ?? item.name)
      .then(res => { if (vivo) setOfertas(res) })
      .catch(e => { if (vivo) { setErro(say(e)); setOfertas([]) } })
      .finally(() => { if (vivo) setBuscando(false) })
    return () => { vivo = false }
  }, [item?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const escolher = async (ean: string, nome: string) => {
    if (!item) return
    s.patch('items', it => it.map(i => i.id === item.id ? { ...i, ean, product: nome } : i))
    const { error } = await supabase.from('shopping_items').update({ ean, product: nome }).eq('id', item.id)
    if (error) return s.toast(say(error), 'erro')
    // lembra a escolha: da próxima vez que pedirem esse item, já vem com o produto
    await supabase.from('product_picks').upsert({ norm: norm(item.name), ean, product: nome }, { onConflict: 'household_id,norm' })
    s.toast(`${item.name}: ${nome}`)
    await s.reload(); onClose()
  }
  const desfazer = async () => {
    if (!item) return
    await supabase.from('shopping_items').update({ ean: null, product: null }).eq('id', item.id)
    await supabase.from('product_picks').delete().eq('norm', norm(item.name))
    await s.reload(); onClose()
  }

  const grupos = ofertas ? agruparPorProduto(ofertas) : []
  const enviar = (e: FormEvent) => { e.preventDefault(); void buscar(termo) }

  return (
    <Sheet open={!!item} onClose={onClose} title={item ? `Comparar ${item.name}` : ''}>
      {item?.ean && (
        <div className="bloco banana" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: 1 }}><div className="pequeno" style={{ fontWeight: 700 }}>Produto escolhido</div><div>{item.product}</div></div>
          <button className="btn pequeno" onClick={desfazer}>Trocar</button>
        </div>
      )}
      <form className="lado" style={{ marginTop: 12 }} onSubmit={enviar}>
        <input className="entrada" value={termo} onChange={e => setTermo(e.target.value)} placeholder="Ex.: café pilão 500g" aria-label="Buscar produto" />
        <button className="btn" style={{ flex: 'none' }} disabled={buscando}>{buscando ? '…' : 'Buscar'}</button>
      </form>
      <p className="pequeno leve" style={{ margin: '8px 4px 0' }}>
        Angeloni, Bistek, Giassi e Atacadão (lojas online). Escreva marca e tamanho para achar o produto certo e toque nele para comparar sempre o mesmo.
      </p>

      {erro && <p role="alert" style={{ color: 'var(--tomate)', fontWeight: 700 }}>{erro}</p>}
      {buscando && !ofertas && <div className="vazio"><span className="emoji">🔎</span>Procurando nos sites…</div>}
      {ofertas && !grupos.length && !erro && <div className="vazio"><span className="emoji">🤷</span>Nada encontrado. Tente outro nome, com marca ou tamanho.</div>}

      {grupos.length > 0 && (
        <div className="folha-lista" style={{ marginTop: 14, boxShadow: 'none', border: '1px solid var(--linha)' }}>
          {grupos.slice(0, 15).map(g => (
            <button key={g.ean} className="produto" style={{ width: '100%', textAlign: 'left', background: item?.ean === g.ean ? 'var(--folha-claro)' : undefined }}
              onClick={() => escolher(g.ean, g.nome)} aria-label={`Escolher ${g.nome}`}>
              {g.imagem ? <img src={g.imagem} alt="" loading="lazy" /> : <span style={{ fontSize: 30, textAlign: 'center' }}>🛒</span>}
              <div>
                <div style={{ fontWeight: 700, lineHeight: 1.25 }}>{g.nome}</div>
                <div className="precos">
                  {g.ofertas.map((o, i) => (
                    <span key={o.loja} className={`preco-loja ${i === 0 && g.ofertas.length > 1 ? 'melhor' : ''}`}>
                      {o.mercado} {money(o.preco)}{o.porKg ? '/kg' : ''}{o.de ? <s>{money(o.de)}</s> : null}
                    </span>
                  ))}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  )
}
