import { motion, AnimatePresence } from 'motion/react'
import { ArrowDown, Check, RefreshCw } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

interface PullToRefreshProps {
  children: ReactNode
  onRefresh: () => Promise<void>
  isInicio?: boolean
}

export function PullToRefresh({ children, onRefresh, isInicio }: PullToRefreshProps) {
  const [pullY, setPullY] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [success, setSuccess] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const startYRef = useRef(0)
  const startXRef = useRef(0)
  const isPullingRef = useRef(false)
  const canPullRef = useRef(false)
  const pullYRef = useRef(0)
  const refreshingRef = useRef(false)

  pullYRef.current = pullY
  refreshingRef.current = refreshing

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return
      const touch = e.touches[0]
      startYRef.current = touch.clientY
      startXRef.current = touch.clientX
      isPullingRef.current = false

      // Pode puxar se estiver no topo da página
      let can = window.scrollY <= 0 && document.documentElement.scrollTop <= 0
      if (can) {
        let target = e.target as HTMLElement | null
        while (target && target !== el && target !== document.body) {
          if (target.scrollTop > 0) {
            can = false
            break
          }
          target = target.parentElement
        }
      }
      canPullRef.current = can
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!canPullRef.current || refreshingRef.current) return
      const touch = e.touches[0]
      const diffY = touch.clientY - startYRef.current
      const diffX = touch.clientX - startXRef.current

      if (diffY > 6) {
        // Se gesto for predominantemente horizontal, não intercepta
        if (Math.abs(diffX) > diffY * 0.9) {
          canPullRef.current = false
          setPullY(0)
          return
        }

        isPullingRef.current = true
        if (e.cancelable) e.preventDefault()

        const damped = Math.min(84, Math.pow(diffY, 0.8) * 1.6)
        setPullY(damped)
      } else if (diffY < 0 && isPullingRef.current) {
        setPullY(0)
        isPullingRef.current = false
      }
    }

    const onTouchEnd = async () => {
      if (!isPullingRef.current) return
      isPullingRef.current = false
      canPullRef.current = false

      const currentY = pullYRef.current
      if (currentY >= 52 && !refreshingRef.current) {
        setRefreshing(true)
        setPullY(50)
        try {
          if ('vibrate' in navigator) navigator.vibrate?.(15)
          await onRefresh()
          setSuccess(true)
          await new Promise(r => setTimeout(r, 450))
        } catch {
          // Erro já tratado pelo store
        } finally {
          setSuccess(false)
          setRefreshing(false)
          setPullY(0)
        }
      } else {
        setPullY(0)
      }
    }

    // Suporte também para mouse drag no desktop
    let mouseDragging = false
    const onMouseDown = (e: MouseEvent) => {
      if (refreshingRef.current || e.button !== 0) return
      if (window.scrollY > 0) return
      mouseDragging = true
      startYRef.current = e.clientY
      startXRef.current = e.clientX
      canPullRef.current = true
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!mouseDragging || !canPullRef.current || refreshingRef.current) return
      const diffY = e.clientY - startYRef.current
      if (diffY > 8) {
        isPullingRef.current = true
        const damped = Math.min(84, Math.pow(diffY, 0.8) * 1.6)
        setPullY(damped)
      }
    }
    const onMouseUp = () => {
      if (mouseDragging) {
        mouseDragging = false
        onTouchEnd()
      }
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchmove', onTouchMove, { passive: false })
    el.addEventListener('touchend', onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)

    el.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)

    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchmove', onTouchMove)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)

      el.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onRefresh])

  const thresholdAtingido = pullY >= 52

  return (
    <div
      ref={containerRef}
      className={isInicio ? 'ptr-container ptr-inicio' : 'ptr-container ptr-padrao'}
      style={{ position: 'relative' }}
    >
      <AnimatePresence>
        {(pullY > 8 || refreshing) && (
          <motion.div
            className="ptr-indicador"
            initial={{ opacity: 0, y: -24 }}
            animate={{
              opacity: 1,
              y: refreshing ? 12 : Math.max(0, pullY * 0.7 - 20)
            }}
            exit={{ opacity: 0, y: -24 }}
            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
          >
            {success ? (
              <span className="ptr-badge feito">
                <Check size={16} strokeWidth={3} className="ptr-ico-check" />
                <span>Atualizado</span>
              </span>
            ) : refreshing ? (
              <span className="ptr-badge carregando">
                <RefreshCw size={15} strokeWidth={2.5} className="ptr-ico-spin" />
                <span>Atualizando…</span>
              </span>
            ) : thresholdAtingido ? (
              <span className="ptr-badge solte">
                <ArrowDown size={15} strokeWidth={2.5} style={{ transform: 'rotate(180deg)', transition: 'transform 0.15s ease' }} />
                <span>Solte para atualizar</span>
              </span>
            ) : (
              <span className="ptr-badge puxe">
                <ArrowDown
                  size={15}
                  strokeWidth={2.5}
                  style={{
                    transform: `rotate(${Math.min(180, (pullY / 52) * 180)}deg)`,
                    transition: 'transform 0.05s linear'
                  }}
                />
                <span>Puxe para atualizar</span>
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <motion.div
        className={isInicio ? 'ptr-content ptr-content-inicio' : 'ptr-content'}
        animate={{
          y: refreshing ? 42 : pullY * 0.42
        }}
        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
      >
        {children}
      </motion.div>
    </div>
  )
}
