import { AnimatePresence, animate, motion, useDragControls, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { FRUITS } from './lib/catalog'
import { addMonths, monthName, moneyParts } from './lib/format'
import { useStore } from './lib/store'

// último valor mostrado por chave, para o número correr do antigo ao novo mesmo depois de trocar de aba
const ultimos = new Map<string, number>()

/** Com chave, o valor mostrado corre do anterior até o novo quando muda */
function useContagem(value: number, chave?: string) {
  const reduce = useReducedMotion()
  const [mostrado, setMostrado] = useState(() => (chave ? ultimos.get(chave) ?? value : value))
  const de = useRef(mostrado)
  useEffect(() => {
    if (chave) ultimos.set(chave, value)
    const inicio = de.current
    if (!chave || reduce || inicio === value) { de.current = value; setMostrado(value); return }
    const c = animate(inicio, value, {
      duration: 0.9, ease: [0.2, 0.8, 0.2, 1],
      onUpdate: v => { de.current = v; setMostrado(Math.round(v * 100) / 100) },
      onComplete: () => { de.current = value; setMostrado(value) },
    })
    return () => c.stop()
  }, [value, chave, reduce])
  return chave ? mostrado : value
}

/** Valor no estilo cartaz de oferta: R$ pequeno, número gordo, centavos no alto sublinhados.
 *  contar: chave que liga o valor entre telas (ex.: "saldo"); com ela o número corre ao mudar. */
export function Cartaz({ value, size = 'm', className = '', contar }: { value: number; size?: 'p' | 'm' | 'g' | 'xg'; className?: string; contar?: string }) {
  const mostrado = useContagem(value, contar)
  // o tamanho da letra segue o valor final, para não pular durante a contagem
  const { sign, int } = moneyParts(value)
  const visto = moneyParts(mostrado)
  // largura do valor em "em": dígitos gordos + pontos + R$ e centavos. Usado para caber no espaço (cqi).
  const digitos = int.replace(/\D/g, '').length + (sign ? 0.6 : 0)
  const largura = digitos * 0.66 + (int.length - int.replace(/\D/g, '').length) * 0.3 + 1.35
  return (
    <span className={`cartaz ${size} ${className}`} style={{ ['--largura' as string]: largura }} aria-label={`${value < 0 ? 'menos ' : ''}${int} reais e ${moneyParts(value).cents} centavos`}>
      <span className="rs" aria-hidden>{visto.sign}R$</span>
      <span className="int" aria-hidden>{visto.int}</span>
      <span className="cents" aria-hidden>,{visto.cents}</span>
    </span>
  )
}

export function Adesivo({ fruit, size = 34, title }: { fruit?: string; size?: number; title?: string }) {
  const f = FRUITS[fruit ?? ''] ?? FRUITS.tomate
  return (
    <span className="adesivo" title={title} style={{ width: size, height: size * 0.92, ['--cor' as string]: f.color }}>
      <span style={{ fontSize: size * 0.56 }}>{f.emoji}</span>
    </span>
  )
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  const reduce = useReducedMotion()
  const id = useId()
  const drag = useDragControls()
  useEffect(() => {
    if (!open) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = '' }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="veu" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div
            className="sheet" role="dialog" aria-modal="true" aria-labelledby={id}
            initial={reduce ? { opacity: 0 } : { y: '100%' }} animate={reduce ? { opacity: 1 } : { y: 0 }}
            exit={reduce ? { opacity: 0 } : { y: '100%' }} transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            drag={reduce ? false : 'y'} dragControls={drag} dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => { if (i.offset.y > 120 || i.velocity.y > 600) onClose() }}
          >
            <div className="alca-area" onPointerDown={e => drag.start(e)}><div className="alca" /></div>
            <div className="sheet-topo" onPointerDown={e => { if (!(e.target as HTMLElement).closest('button')) drag.start(e) }}>
              <h2 className="subtitulo" id={id}>{title}</h2>
              <button className="fechar" onClick={onClose} aria-label="Fechar">✕</button>
            </div>
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/** Teclado de valor em centavos: digitar 1 2 3 4 vira 12,34 */
export function useCents(initial = 0) {
  const [cents, setCents] = useState(Math.round(initial * 100))
  const press = (k: string) => setCents(c => {
    if (k === '⌫') return Math.floor(c / 10)
    if (k === '00') return c * 100 > 99999999 ? c : c * 100
    const n = c * 10 + Number(k)
    return n > 999999999 ? c : n
  })
  return { value: cents / 100, cents, press, set: (v: number) => setCents(Math.round(v * 100)) }
}
export function Teclado({ onKey }: { onKey: (k: string) => void }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName)) return
      if (/^[0-9]$/.test(e.key)) onKey(e.key)
      else if (e.key === 'Backspace') onKey('⌫')
    }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [onKey])
  return (
    <div className="teclado">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫'].map(k => (
        <button key={k} type="button" onClick={() => onKey(k)} aria-label={k === '⌫' ? 'Apagar' : k}>{k}</button>
      ))}
    </div>
  )
}

export function MesNav({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="mes">
      <button className="seta" onClick={() => onChange(addMonths(month, -1))} aria-label="Mês anterior">‹</button>
      <span className="nome-mes">{monthName(month)}</span>
      <button className="seta" onClick={() => onChange(addMonths(month, 1))} aria-label="Próximo mês">›</button>
    </div>
  )
}

export function Toasts() {
  const { toasts } = useStore()
  return (
    <div className="toasts" aria-live="polite">
      <AnimatePresence>
        {toasts.map(t => (
          <motion.div key={t.id} className={`toast ${t.tone}`} initial={{ y: -30, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }} exit={{ y: -20, opacity: 0 }}>{t.msg}</motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}

/** O item "voa" até a sacola da barra de baixo e a sacola balança. atraso: espera o ✓ se desenhar antes de sair. */
export function voarParaSacola(from: HTMLElement | null, label: string, atraso = 0) {
  const alvo = document.querySelector('[data-sacola]') as HTMLElement | null
  if (!from || !alvo || matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const a = from.getBoundingClientRect(), b = alvo.getBoundingClientRect()
  const el = document.createElement('div')
  el.className = 'voando'
  el.textContent = label
  el.style.left = `${a.left + 40}px`
  el.style.top = `${a.top + a.height / 2 - 18}px`
  const dx = b.left + b.width / 2 - (a.left + 40) - 30
  const dy = b.top - (a.top + a.height / 2 - 18)
  // a etiqueta só aparece na hora de voar, para não cobrir o risco no nome
  const voar = () => {
    document.body.appendChild(el)
    animate(el, {
      x: [0, dx * 0.35, dx], y: [0, dy * 0.15 - 90, dy],
      scale: [1, 1.1, 0.25], rotate: [0, -12, 20], opacity: [1, 1, 0.2],
    }, { duration: 0.75, ease: [0.45, 0, 0.3, 1] }).then(() => {
      el.remove()
      animate(alvo, { rotate: [0, -14, 10, -6, 0], scale: [1, 1.18, 1] }, { duration: 0.5 })
    })
  }
  if (atraso) window.setTimeout(voar, atraso); else voar()
}
