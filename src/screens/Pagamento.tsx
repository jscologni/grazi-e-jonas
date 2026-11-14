import { useState } from 'react'
import { METHODS } from '../lib/catalog'
import { contaPadrao, contaVale, invoiceMonth } from '../lib/finance'
import { monthOf, norm } from '../lib/format'
import { useStore } from '../lib/store'
import type { Method } from '../lib/types'
import { Adesivo } from '../ui'
import { EscolherConta } from './Saldos'

/** Compra de mercado lançada como um gasto só (fechar compra e nota escaneada): escolhas + linha para o guardar_compra */
export function usePagamento() {
  const s = useStore()
  const [lancar, setLancar] = useState(true)
  const [metodo, setMetodo] = useState<Method>('debito')
  const [cartao, setCartao] = useState<string | null>(null)
  const [quem, setQuem] = useState<string | null>(null)
  const [conta, setConta] = useState<string | null>(null)
  const cards = s.cards.filter(k => !k.archived)
  const card = cards.find(k => k.id === cartao)

  const reiniciar = (lancarInicial?: boolean) => {
    if (lancarInicial !== undefined) setLancar(lancarInicial)
    setQuem(s.me?.user_id ?? null); setConta(contaPadrao(s.accounts, s.me?.user_id))
  }
  const linha = (total: number, descricao: string, dia: string) => lancar && total > 0 ? {
    amount: total, description: descricao, member_id: quem, occurred_on: dia, method: metodo,
    category_id: s.categories.find(k => k.kind === 'out' && norm(k.name) === 'mercado')?.id ?? null,
    card_id: metodo === 'credito' ? card?.id ?? null : null,
    month: metodo === 'credito' && card ? invoiceMonth(dia, card) : monthOf(dia),
    installment: metodo === 'credito' ? 1 : null, installments: metodo === 'credito' ? 1 : null,
    account_id: metodo === 'credito' ? null : conta,
  } : null

  return { lancar, setLancar, metodo, setMetodo, cartao, setCartao, quem, setQuem, conta, setConta, cards, reiniciar, linha, pronto: !lancar || metodo !== 'credito' || !!card }
}

export function EscolherPagamento({ p, rotulo = 'Lançar como gasto no mês' }: { p: ReturnType<typeof usePagamento>; rotulo?: string }) {
  const s = useStore()
  const vale = contaVale(s.accounts, p.quem)
  const ehVale = (id: string | null) => s.accounts.find(a => a.id === id)?.kind === 'alimentacao'
  return (
    <>
      <label className="campo" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="checkbox" checked={p.lancar} onChange={e => p.setLancar(e.target.checked)} style={{ width: 22, height: 22 }} />
        <span style={{ margin: 0 }}>{rotulo}</span>
      </label>

      {p.lancar && (
        <>
          <div className="campo"><span>Quem pagou</span>
            <div className="chips">
              {s.members.map(m => <button key={m.user_id} className="chip" aria-pressed={p.quem === m.user_id} onClick={() => { p.setQuem(m.user_id); p.setConta(contaPadrao(s.accounts, m.user_id)) }}>
                <Adesivo fruit={m.fruit} size={22} /> {m.name}</button>)}
            </div>
          </div>
          <div className="campo"><span>Como pagou</span>
            <div className="chips">
              {METHODS.filter(m => m.id !== 'boleto' && (m.id !== 'vale' || vale)).map(m => <button key={m.id} className="chip" aria-pressed={p.metodo === m.id}
                onClick={() => { p.setMetodo(m.id as Method); if (m.id === 'credito' && !p.cartao) p.setCartao(p.cards[0]?.id ?? null); if (m.id === 'vale') p.setConta(vale?.id ?? null); else if (ehVale(p.conta)) p.setConta(contaPadrao(s.accounts, p.quem)) }}>{m.label}</button>)}
            </div>
            {p.metodo === 'credito' && (
              p.cards.length
                ? <div className="chips" style={{ marginTop: 8 }}>{p.cards.map(k => <button key={k.id} className="chip" aria-pressed={p.cartao === k.id} onClick={() => p.setCartao(k.id)}>💳 {k.name}</button>)}</div>
                : <p className="pequeno" style={{ color: 'var(--tomate)', fontWeight: 700 }}>Cadastre um cartão em Dinheiro › Cartões.</p>
            )}
          </div>
          {p.metodo !== 'credito' && <EscolherConta value={p.conta} onChange={id => { p.setConta(id); if (ehVale(id)) p.setMetodo('vale'); else if (p.metodo === 'vale') p.setMetodo('debito') }} titulo="Saiu de qual conta" />}
        </>
      )}
    </>
  )
}
