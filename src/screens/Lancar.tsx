import { useState } from 'react'
import { METHODS } from '../lib/catalog'
import { contaPadrao, invoiceMonth } from '../lib/finance'
import { addMonths, money, monthOf, monthShort, today } from '../lib/format'
import { say, useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import type { Kind, Method, Tx } from '../lib/types'
import { Adesivo, Cartaz, Sheet, Teclado, useCents } from '../ui'
import { EscolherConta } from './Saldos'

/** Abre para lançar algo novo (tx = null) ou para ver/editar um lançamento existente */
export function Lancar({ open, onClose, tx, kindInicial = 'out' }: { open: boolean; onClose: () => void; tx?: Tx | null; kindInicial?: Kind }) {
  const s = useStore()
  const c = useCents(0)
  const [aberto, setAberto] = useState(false)
  const [kind, setKind] = useState<Kind>('out')
  const [desc, setDesc] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const [quem, setQuem] = useState<string | null>(null)
  const [data, setData] = useState(today())
  const [metodo, setMetodo] = useState<Method>('pix')
  const [cartao, setCartao] = useState<string | null>(null)
  const [parcelas, setParcelas] = useState(1)
  const [conta, setConta] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (open && !aberto) {
    setAberto(true)
    setKind(tx?.kind ?? kindInicial); c.set(tx ? +tx.amount : 0); setDesc(tx?.description ?? ''); setCat(tx?.category_id ?? null)
    setQuem(tx?.member_id ?? s.me?.user_id ?? null); setData(tx?.occurred_on ?? today()); setMetodo(tx?.method ?? 'pix')
    setCartao(tx?.card_id ?? null); setParcelas(1)
    setConta(tx ? tx.account_id : contaPadrao(s.accounts, s.me?.user_id))
  }
  if (!open && aberto) setAberto(false)

  const editando = !!tx
  const parcelado = !!tx?.group_id && (tx.installments ?? 1) > 1
  const cards = s.cards.filter(k => !k.archived)
  const card = cards.find(k => k.id === cartao)
  const cats = s.categories.filter(k => k.kind === kind && !k.archived)
  const primeiraFatura = card ? invoiceMonth(data, card) : null
  const valorParcela = c.value / parcelas

  const salvar = async () => {
    if (c.value <= 0 || busy) return
    if (kind === 'out' && metodo === 'credito' && !card) return s.toast('Escolha o cartão', 'erro')
    setBusy(true)
    try {
      const base = {
        kind, description: desc.trim() || (cats.find(k => k.id === cat)?.name ?? (kind === 'in' ? 'Entrada' : 'Gasto')),
        category_id: cat, member_id: quem, occurred_on: data,
        method: kind === 'in' ? 'pix' : metodo, card_id: kind === 'out' && metodo === 'credito' ? cartao : null,
        account_id: kind === 'out' && metodo === 'credito' ? null : conta,
      }
      if (editando && tx) {
        const { error } = await supabase.from('transactions').update({
          ...base, amount: c.value,
          // só recalcula a fatura se a compra mudou de dia ou de cartão ("valor de antes do app" fica onde foi posto)
          month: base.card_id && card
            ? (parcelado || (tx.occurred_on === data && tx.card_id === base.card_id) ? tx.month : invoiceMonth(data, card))
            : (tx.bill_id ? tx.month : monthOf(data)),
        }).eq('id', tx.id)
        if (error) throw error
        s.toast('Lançamento atualizado')
      } else if (base.card_id && card && parcelas > 1) {
        const group = crypto.randomUUID()
        const cents = Math.round(c.value * 100)
        const each = Math.floor(cents / parcelas)
        const rows = Array.from({ length: parcelas }, (_, i) => ({
          ...base, group_id: group, installment: i + 1, installments: parcelas,
          amount: (i === 0 ? each + (cents - each * parcelas) : each) / 100,
          month: addMonths(invoiceMonth(data, card), i),
        }))
        const { error } = await supabase.from('transactions').insert(rows)
        if (error) throw error
        s.toast(`${parcelas}× de ${money(each / 100)} lançadas`)
      } else {
        const { error } = await supabase.from('transactions').insert({
          ...base, amount: c.value, month: base.card_id && card ? invoiceMonth(data, card) : monthOf(data),
          installment: base.card_id ? 1 : null, installments: base.card_id ? 1 : null,
        })
        if (error) throw error
        s.toast(kind === 'in' ? `Entrada de ${money(c.value)} anotada` : `Gasto de ${money(c.value)} anotado`)
      }
      await s.reload()
      onClose()
    } catch (e) { s.toast(say(e), 'erro') } finally { setBusy(false) }
  }

  const apagar = async (todas: boolean) => {
    if (!tx) return
    const q = supabase.from('transactions').delete()
    const { error } = todas && tx.group_id ? await q.eq('group_id', tx.group_id) : await q.eq('id', tx.id)
    if (error) return s.toast(say(error), 'erro')
    s.patch('txs', t => t.filter(x => todas && tx.group_id ? x.group_id !== tx.group_id : x.id !== tx.id))
    s.toast(todas ? 'Todas as parcelas apagadas' : 'Lançamento apagado')
    onClose()
  }

  return (
    <Sheet open={open} onClose={onClose} title={editando ? 'Lançamento' : kind === 'in' ? 'Entrou dinheiro' : 'Saiu dinheiro'}>
      {!editando && (
        <div className="segmento">
          <button aria-pressed={kind === 'out'} onClick={() => { setKind('out'); setCat(null) }}>Gastei</button>
          <button aria-pressed={kind === 'in'} onClick={() => { setKind('in'); setCat(null) }}>Ganhei</button>
        </div>
      )}
      <div className={`visor ${kind === 'in' ? 'entra' : 'sai'} cabe`}><Cartaz value={c.value} size="g" /></div>
      <Teclado onKey={c.press} />

      <label className="campo"><span>{kind === 'in' ? 'De onde veio' : 'Com o quê'}</span>
        <input className="entrada" value={desc} onChange={e => setDesc(e.target.value)}
          placeholder={kind === 'in' ? 'Salário, freela, venda…' : 'Farmácia, gasolina, pizza…'} maxLength={60} /></label>

      <div className="campo"><span>Categoria</span>
        <div className="chips">
          {cats.map(k => <button key={k.id} className="chip" aria-pressed={cat === k.id} onClick={() => setCat(cat === k.id ? null : k.id)}>{k.emoji} {k.name}</button>)}
        </div>
      </div>

      <div className="campo"><span>{kind === 'in' ? 'Quem recebeu' : 'Quem gastou'}</span>
        <div className="chips">
          {s.members.map(m => <button key={m.user_id} className="chip" aria-pressed={quem === m.user_id} onClick={() => { setQuem(m.user_id); if (!editando) setConta(contaPadrao(s.accounts, m.user_id)) }}>
            <Adesivo fruit={m.fruit} size={22} /> {m.name}</button>)}
        </div>
      </div>

      <label className="campo"><span>Dia</span>
        <input className="entrada" type="date" value={data} onChange={e => setData(e.target.value || today())} disabled={parcelado} /></label>

      {kind === 'out' && (
        <div className="campo"><span>Como pagou</span>
          <div className="chips">
            {METHODS.map(m => <button key={m.id} className="chip" aria-pressed={metodo === m.id} disabled={parcelado}
              onClick={() => { setMetodo(m.id as Method); if (m.id === 'credito' && !cartao) setCartao(cards[0]?.id ?? null) }}>{m.label}</button>)}
          </div>
          {metodo === 'credito' && (cards.length ? (
            <>
              <div className="chips" style={{ marginTop: 8 }}>
                {cards.map(k => <button key={k.id} className="chip" aria-pressed={cartao === k.id} disabled={parcelado} onClick={() => setCartao(k.id)}>💳 {k.name}</button>)}
              </div>
              {!editando && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                  <button className="fechar" onClick={() => setParcelas(p => Math.max(1, p - 1))} aria-label="Menos parcelas">−</button>
                  <b className="num" style={{ minWidth: 70, textAlign: 'center' }}>{parcelas === 1 ? 'À vista' : `${parcelas}×`}</b>
                  <button className="fechar" onClick={() => setParcelas(p => Math.min(24, p + 1))} aria-label="Mais parcelas">+</button>
                  {c.value > 0 && primeiraFatura && (
                    <span className="pequeno leve">{parcelas > 1 ? `${parcelas}× de ${money(valorParcela)}, ` : ''}1ª na fatura de {monthShort(primeiraFatura)}</span>
                  )}
                </div>
              )}
              {parcelado && <p className="pequeno leve">Parcela {tx?.installment} de {tx?.installments}.</p>}
            </>
          ) : <p className="pequeno" style={{ color: 'var(--tomate)', fontWeight: 700 }}>Cadastre um cartão em Dinheiro › Cartões.</p>)}
        </div>
      )}

      {(kind === 'in' || metodo !== 'credito') && (
        <EscolherConta value={conta} onChange={setConta} titulo={kind === 'in' ? 'Entrou em qual conta' : 'Saiu de qual conta'} />
      )}

      <button className={`btn cheio ${kind === 'in' ? 'folha' : 'tomate'}`} style={{ marginTop: 22 }} onClick={salvar} disabled={busy || c.value <= 0}>
        {busy ? 'Salvando…' : editando ? 'Salvar alterações' : kind === 'in' ? 'Anotar entrada' : 'Anotar gasto'}
      </button>
      {editando && (
        <div className="acoes" style={{ marginTop: 10 }}>
          <button className="btn fantasma" onClick={() => apagar(false)}>{parcelado ? 'Apagar esta parcela' : 'Apagar'}</button>
          {parcelado && <button className="btn fantasma" onClick={() => apagar(true)}>Apagar todas</button>}
        </div>
      )}
    </Sheet>
  )
}
