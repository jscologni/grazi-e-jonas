import { motion, useReducedMotion } from 'motion/react'
import { useState, type ReactNode } from 'react'

export type Aba = 'inicio' | 'lista' | 'dinheiro' | 'casa'

const Ico = ({ children }: { children: ReactNode }) => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
)

export const ABAS: { id: Aba; nome: string; ico: ReactNode }[] = [
  { id: 'inicio', nome: 'Início', ico: <Ico><path d="M4 11.2 12 4l8 7.2V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z" /></Ico> },
  { id: 'lista', nome: 'Feira', ico: <Ico><path d="M5.5 8h13l-1.1 11.1a1 1 0 0 1-1 .9H7.6a1 1 0 0 1-1-.9z" /><path d="M9 10V6.8a3 3 0 0 1 6 0V10" /></Ico> },
  { id: 'dinheiro', nome: 'Dinheiro', ico: <Ico><circle cx="12" cy="12" r="8.2" /><path d="M14.6 9.4c-.5-.9-1.5-1.4-2.6-1.4-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 2 2.6.8 2.6 2-1.1 2-2.6 2c-1.1 0-2.1-.5-2.6-1.4M12 6.4V8m0 8v1.6" /></Ico> },
  { id: 'casa', nome: 'Casa', ico: <Ico><path d="M8 3.8h8v3H8z" /><path d="M7 6.8h10a1.5 1.5 0 0 1 1.5 1.5v10.2a1.8 1.8 0 0 1-1.8 1.8H7.3a1.8 1.8 0 0 1-1.8-1.8V8.3A1.5 1.5 0 0 1 7 6.8z" /><path d="M9 12.5h6" /></Ico> },
]

/** Menu de baixo: uma luminária desliza até a aba escolhida, balança e acende o ícone */
export function Menu({ aba, ir, contador }: { aba: Aba; ir: (a: Aba) => void; contador: number }) {
  const reduce = useReducedMotion()
  const i = ABAS.findIndex(a => a.id === aba)
  const [prevI, setPrevI] = useState(i)
  const dir = Math.sign(i - prevI) || 0
  if (prevI !== i) setPrevI(i)
  const left = `${i * 25}%`
  const desliza = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 210, damping: 22, mass: 0.9 }

  return (
    <nav className="barra" aria-label="Seções">
      {/* o cone de luz fica dentro da barra (cortado pelas bordas) */}
      <div className="luz-trilho" aria-hidden>
        <motion.div className="luz" initial={false} animate={{ left }} transition={desliza}>
          <motion.div
            key={aba}
            className="cone"
            style={{ originY: 0 }}
            initial={reduce ? false : { rotate: dir * 20, opacity: 0.45 }}
            animate={reduce ? { opacity: 1 } : { rotate: [dir * 20, -dir * 11, dir * 5, -dir * 2, 0], opacity: [0.45, 1, 0.7, 1, 0.92, 1] }}
            transition={{ duration: 1.25, ease: 'easeOut' }}
          />
        </motion.div>
      </div>
      {/* a lâmpada fica por cima da borda, com brilho para fora */}
      <motion.div className="lampada" aria-hidden initial={false} animate={{ left }} transition={desliza}>
        <span />
      </motion.div>

      {ABAS.map(a => (
        <button key={a.id} aria-current={aba === a.id ? 'page' : undefined} onClick={() => ir(a.id)}>
          <span className="ico" {...(a.id === 'lista' ? { 'data-sacola': true } : {})}>{a.ico}</span>
          <span className="rotulo-aba">{a.nome}</span>
          {a.id === 'lista' && contador > 0 && <span className="contador">{contador}</span>}
        </button>
      ))}
    </nav>
  )
}
