import { useState } from 'react'
import { METHODS } from '../lib/catalog'
import { contaPadrao, contaVale, invoiceMonth } from '../lib/finance'
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
  // compra antiga: parte das parcelas já foi paga antes de usar o app
  const [antiga, setAntiga] = useState(false)
  const [pagas, setPagas] = useState(1)
  const [primeira, setPrimeira] = useState<string | null>(null)
  const [conta, setConta] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (open && !aberto) {
    setAberto(true)
    setKind(tx?.kind ?? kindInicial); c.set(tx ? +tx.amount : 0); setDesc(tx?.description ?? ''); setCat(tx?.category_id ?? null)
    setQuem(tx?.member_id ?? s.me?.user_id ?? null); setData(tx?.occurred_on ?? today()); setMetodo(tx?.method ?? 'pix')
    setCartao(tx?.card_id ?? null); setParcelas(1); setAntiga(false); setPagas(1); setPrimeira(null)
    setConta(tx ? tx.account_id : contaPadrao(s.accounts, s.me?.user_id))
  }
  if (!open && aberto) setAberto(false)

  const editando = !!tx
  const parcelado = !!tx?.group_id && (tx.installments ?? 1) > 1
  const cards = s.cards.filter(k => !k.archived)
  const card = cards.find(k => k.id === cartao)
  const cats = s.categories.filter(k => k.kind === kind && !k.archived)
  const vale = contaVale(s.accounts, quem)
  const ehVale = (id: string | null) => s.accounts.find(a => a.id === id)?.kind === 'alimentacao'
  const primeiraFatura = card ? invoiceMonth(data, card) : null
  const valorParcela = c.value / parcelas
  const emAndamento = antiga && !editando && kind === 'out' && metodo === 'credito' && !!card
  const proximas = card ? [0, 1, 2].map(i => addMonths(invoiceMonth(today(), card), i)) : []
  const mesInicial = primeira && proximas.includes(primeira) ? primeira : proximas[0]
  const jaPagas = Math.min(pagas, parcelas - 1)
  const faltam = parcelas - jaPagas

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
      } else if (emAndamento) {
        const group = crypto.randomUUID()
        const rows = Array.from({ length: faltam }, (_, i) => ({
          ...base, group_id: group, installment: jaPagas + 1 + i, installments: parcelas,
          amount: c.value, month: addMonths(mesInicial, i),
        }))
        const { error } = await supabase.from('transactions').insert(rows)
        if (error) throw error
        s.toast(`${faltam} ${faltam === 1 ? 'parcela lançada' : 'parcelas lançadas'}, a partir da fatura de ${monthShort(mesInicial)}`)
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
      {emAndamento && <p className="pequeno leve" style={{ margin: '10px 0 -6px', textAlign: 'center', fontWeight: 700 }}>Valor de cada parcela</p>}
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

      <label className="campo"><span>{emAndamento ? 'Dia da compra (se não lembrar, deixe hoje)' : 'Dia'}</span>
        <input className="entrada" type="date" value={data} onChange={e => setData(e.target.value || today())} disabled={parcelado} /></label>

      {kind === 'out' && (
        <div className="campo"><span>Como pagou</span>
          <div className="chips">
            {METHODS.filter(m => m.id !== 'vale' || vale).map(m => <button key={m.id} className="chip" aria-pressed={metodo === m.id} disabled={parcelado}
              onClick={() => { setMetodo(m.id as Method); if (m.id === 'credito' && !cartao) setCartao(cards[0]?.id ?? null); if (m.id === 'vale') setConta(vale?.id ?? null); else if (ehVale(conta)) setConta(contaPadrao(s.accounts, quem)) }}>{m.label}</button>)}
          </div>
          {metodo === 'credito' && (cards.length ? (
            <>
              <div className="chips" style={{ marginTop: 8 }}>
                {cards.map(k => <button key={k.id} className="chip" aria-pressed={cartao === k.id} disabled={parcelado} onClick={() => setCartao(k.id)}>💳 {k.name}</button>)}
              </div>
              {!editando && (
                <>
                  <label className="campo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input type="checkbox" checked={antiga} onChange={e => { setAntiga(e.target.checked); if (e.target.checked) setParcelas(p => Math.max(2, p)) }} style={{ width: 22, height: 22 }} />
                    <span style={{ margin: 0 }}>Compra antiga, com parcelas já pagas</span>
                  </label>
                  <div className="pequeno" style={{ fontWeight: 700, marginTop: 12 }}>{antiga ? 'Total de parcelas da compra' : 'Parcelas'}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                    <button className="fechar" onClick={() => setParcelas(p => Math.max(antiga ? 2 : 1, p - 1))} aria-label="Menos parcelas">−</button>
                    <b className="num" style={{ minWidth: 70, textAlign: 'center' }}>{parcelas === 1 ? 'À vista' : `${parcelas}×`}</b>
                    <button className="fechar" onClick={() => setParcelas(p => Math.min(48, p + 1))} aria-label="Mais parcelas">+</button>
                    {!antiga && c.value > 0 && primeiraFatura && (
                      <span className="pequeno leve">{parcelas > 1 ? `${parcelas}× de ${money(valorParcela)}, ` : ''}1ª na fatura de {monthShort(primeiraFatura)}</span>
                    )}
                  </div>
                  {antiga && card && (
                    <>
                      <div className="pequeno" style={{ fontWeight: 700, marginTop: 12 }}>Quantas já foram pagas</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
                        <button className="fechar" onClick={() => setPagas(Math.max(1, jaPagas - 1))} aria-label="Menos parcelas pagas">−</button>
                        <b className="num" style={{ minWidth: 70, textAlign: 'center' }}>{jaPagas}</b>
                        <button className="fechar" onClick={() => setPagas(Math.min(parcelas - 1, jaPagas + 1))} aria-label="Mais parcelas pagas">+</button>
                      </div>
                      <div className="pequeno" style={{ fontWeight: 700, marginTop: 12 }}>A próxima parcela vence na fatura de</div>
                      <div className="chips" style={{ marginTop: 6 }}>
                        {proximas.map(m => <button key={m} className="chip" aria-pressed={mesInicial === m} onClick={() => setPrimeira(m)}>{monthShort(m)}</button>)}
                      </div>
                      {c.value > 0 && (
                        <p className="aviso">
                          {faltam === 1 ? `Falta 1 parcela de ${money(c.value)}` : `Faltam ${faltam} parcelas de ${money(c.value)}`}: a {jaPagas + 1}/{parcelas} em {monthShort(mesInicial)}
                          {faltam > 1 ? ` e a última em ${monthShort(addMonths(mesInicial, faltam - 1))}` : ''}.
                        </p>
                      )}
                    </>
                  )}
                </>
              )}
              {parcelado && <p className="pequeno leve">Parcela {tx?.installment} de {tx?.installments}.</p>}
            </>
          ) : <p className="pequeno" style={{ color: 'var(--tomate)', fontWeight: 700 }}>Cadastre um cartão em Dinheiro › Cartões.</p>)}
        </div>
      )}

      {(kind === 'in' || metodo !== 'credito') && (
        <EscolherConta value={conta} onChange={id => { setConta(id); if (kind === 'out') { if (ehVale(id)) setMetodo('vale'); else if (metodo === 'vale') setMetodo('debito') } }} titulo={kind === 'in' ? 'Entrou em qual conta' : 'Saiu de qual conta'} />
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
