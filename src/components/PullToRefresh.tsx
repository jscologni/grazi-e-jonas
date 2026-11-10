import { motion, AnimatePresence } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Aba } from '../Menu'

interface PullToRefreshProps {
  children: ReactNode
  onRefresh: () => Promise<void>
  aba: Aba
}

const TEXTOS_ABA: Record<Aba, { puxando: string; solte: string; carregando: string; sucesso: string; iconeFim: string }> = {
  inicio: {
    puxando: 'Puxe para colher…',
    solte: 'Solte para atualizar! ✨',
    carregando: 'Atualizando a casa…',
    sucesso: 'Lar doce lar! ✨',
    iconeFim: '🏡'
  },
  lista: {
    puxando: 'Puxe a feira…',
    solte: 'Solte para colher! 🧺',
    carregando: 'Colhendo a feira…',
    sucesso: 'Tudo fresquinho! 🌿',
    iconeFim: '🥬'
  },
  dinheiro: {
    puxando: 'Puxe para calcular…',
    solte: 'Solte para somar! 💰',
    carregando: 'Contando as continhas…',
    sucesso: 'Contas em dia! 🪙',
    iconeFim: '✨'
  },
  casa: {
    puxando: 'Puxe para organizar…',
    solte: 'Solte para arrumar! 🧹',
    carregando: 'Arrumando a casa…',
    sucesso: 'Casa em ordem! ✨',
    iconeFim: '🧼'
  }
}

export function PullToRefresh({ children, onRefresh, aba }: PullToRefreshProps) {
  const [pullY, setPullY] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [success, setSuccess] = useState(false)

  const pullYRef = useRef(0)
  const refreshingRef = useRef(false)
  pullYRef.current = pullY
  refreshingRef.current = refreshing

  const isInicio = aba === 'inicio'

  useEffect(() => {
    let startY = 0
    let startX = 0
    let tracking = false
    let isPulling = false

    const isAtTop = () => {
      const scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0
      return scrollY <= 3
    }

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current || e.touches.length !== 1) return

      const target = e.target as HTMLElement | null
      // Não intercepta se o toque começou dentro de um modal/sheet aberto
      if (target?.closest('.sheet, .veu, .toasts')) return

      // Verifica se o alvo está dentro de um container com scroll próprio que não está no topo
      let el = target
      while (el && el !== document.body) {
        if (el.scrollHeight > el.clientHeight && el.scrollTop > 2) {
          return
        }
        el = el.parentElement
      }

      if (isAtTop()) {
        const touch = e.touches[0]
        startY = touch.clientY
        startX = touch.clientX
        tracking = true
        isPulling = false
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking || refreshingRef.current || e.touches.length !== 1) return

      const touch = e.touches[0]
      const diffY = touch.clientY - startY
      const diffX = touch.clientX - startX

      if (diffY > 4) {
        // Ignora se for claramente um gesto horizontal
        if (Math.abs(diffX) > 16 && Math.abs(diffX) > diffY * 1.4 && !isPulling) {
          tracking = false
          setPullY(0)
          return
        }

        if (isAtTop()) {
          isPulling = true
          if (e.cancelable) e.preventDefault()
          // Curva elástica com amortecimento
          const damped = Math.min(95, Math.pow(diffY, 0.78) * 1.75)
          setPullY(damped)
        }
      } else if (diffY < 0 && isPulling) {
        setPullY(0)
        isPulling = false
      }
    }

    const onTouchEnd = async () => {
      if (!tracking) return
      tracking = false

      if (isPulling) {
        isPulling = false
        const currentY = pullYRef.current

        if (currentY >= 50 && !refreshingRef.current) {
          setRefreshing(true)
          setPullY(62)
          try {
            if ('vibrate' in navigator) navigator.vibrate?.(20)
            await onRefresh()
            setSuccess(true)
            await new Promise(r => setTimeout(r, 600))
          } catch {
            // tratado
          } finally {
            setSuccess(false)
            setRefreshing(false)
            setPullY(0)
          }
        } else {
          setPullY(0)
        }
      }
    }

    // Suporte também a mouse drag no computador
    let mouseDragging = false
    const onMouseDown = (e: MouseEvent) => {
      if (refreshingRef.current || e.button !== 0) return
      const target = e.target as HTMLElement | null
      if (target?.closest('.sheet, .veu, .toasts, button, input, textarea, a')) return
      if (!isAtTop()) return

      mouseDragging = true
      startY = e.clientY
      startX = e.clientX
      tracking = true
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!mouseDragging || !tracking || refreshingRef.current) return
      const diffY = e.clientY - startY
      if (diffY > 6) {
        isPulling = true
        const damped = Math.min(95, Math.pow(diffY, 0.78) * 1.75)
        setPullY(damped)
      }
    }
    const onMouseUp = () => {
      if (mouseDragging) {
        mouseDragging = false
        onTouchEnd()
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd)
    window.addEventListener('touchcancel', onTouchEnd)

    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchEnd)

      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onRefresh])

  const threshold = pullY >= 50
  const txt = TEXTOS_ABA[aba] ?? TEXTOS_ABA.inicio

  // Progresso do arrasto de 0 a 1
  const progresso = Math.min(1, pullY / 50)
  const temTomate = progresso >= 0.25 || refreshing
  const temAbacate = progresso >= 0.50 || refreshing
  const temBanana = progresso >= 0.75 || refreshing
  const temUva = threshold || refreshing

  return (
    <div
      className={isInicio ? 'ptr-container ptr-inicio' : 'ptr-container ptr-padrao'}
      style={{ position: 'relative' }}
    >
      <AnimatePresence>
        {(pullY > 6 || refreshing) && (
          <motion.div
            className="ptr-palco"
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{
              opacity: 1,
              y: refreshing ? 16 : Math.min(32, pullY * 0.5),
              scale: refreshing ? 1 : Math.min(1.04, 0.94 + progresso * 0.1)
            }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
          >
            {/* Cordão elástico decorativo da feira */}
            <svg
              className="ptr-corda-svg"
              viewBox="0 0 360 48"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path
                d={`M 0,0 Q 180,${Math.min(42, Math.max(8, pullY * 0.6))} 360,0`}
                fill="none"
                stroke="var(--folha)"
                strokeWidth="2.5"
                strokeDasharray="4 3"
                opacity={0.5}
              />
            </svg>

            {/* Cartaz animado da cesta de feira / casa */}
            <div className={`ptr-cartaz ${threshold ? 'pronto' : ''} ${refreshing ? 'girando' : ''} ${success ? 'sucesso' : ''}`}>
              <div className="ptr-cesta-area">
                <span className="ptr-cesta-base" role="img" aria-label="Cesta de feira">
                  {success ? txt.iconeFim : '🧺'}
                </span>

                {/* Frutas saltitantes que entram na cesta com a puxada */}
                <span className={`ptr-fruta f-tomate ${temTomate ? 'ativa' : ''} ${refreshing ? 'malabarismo' : ''}`} aria-hidden>
                  🍅
                </span>
                <span className={`ptr-fruta f-abacate ${temAbacate ? 'ativa' : ''} ${refreshing ? 'malabarismo' : ''}`} aria-hidden>
                  🥑
                </span>
                <span className={`ptr-fruta f-banana ${temBanana ? 'ativa' : ''} ${refreshing ? 'malabarismo' : ''}`} aria-hidden>
                  🍌
                </span>
                {temUva && (
                  <span className={`ptr-fruta f-uva ativa ${refreshing ? 'malabarismo' : ''}`} aria-hidden>
                    🍇
                  </span>
                )}
                {threshold && !success && (
                  <span className="ptr-brilho-pop" aria-hidden>✨</span>
                )}
              </div>

              <div className="ptr-texto-area">
                <span className="ptr-mensagem">
                  {success
                    ? txt.sucesso
                    : refreshing
                      ? txt.carregando
                      : threshold
                        ? txt.solte
                        : txt.puxando}
                </span>
                <span className="ptr-sub">
                  {success
                    ? 'Sincronizado'
                    : refreshing
                      ? 'Buscando do banco…'
                      : threshold
                        ? 'Pode soltar o dedo!'
                        : `${Math.round(progresso * 100)}% da colheita`}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className={isInicio ? 'ptr-content ptr-content-inicio' : 'ptr-content'}
        animate={{
          y: refreshing ? 72 : pullY * 0.55
        }}
        transition={{ type: 'spring', damping: 26, stiffness: 340 }}
      >
        {children}
      </motion.div>
    </div>
  )
}
