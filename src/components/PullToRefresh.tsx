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
  const [isPulling, setIsPulling] = useState(false)

  const pullYRef = useRef(0)
  const refreshingRef = useRef(false)
  pullYRef.current = pullY
  refreshingRef.current = refreshing

  const isInicio = aba === 'inicio'

  useEffect(() => {
    let startY = 0
    let startX = 0
    let tracking = false
    let pulling = false

    const isPageAtTop = () => {
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

      if (isPageAtTop()) {
        const touch = e.touches[0]
        startY = touch.clientY
        startX = touch.clientX
        tracking = true
        pulling = false
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking || refreshingRef.current || e.touches.length !== 1) return

      const touch = e.touches[0]
      const diffY = touch.clientY - startY
      const diffX = touch.clientX - startX

      if (diffY > 4) {
        // Se gesto for predominantemente horizontal, ignora
        if (Math.abs(diffX) > 18 && Math.abs(diffX) > diffY * 1.4 && !pulling) {
          tracking = false
          setPullY(0)
          setIsPulling(false)
          return
        }

        if (isPageAtTop()) {
          pulling = true
          setIsPulling(true)
          if (e.cancelable) e.preventDefault()
          // Curva de amortecimento suave
          const damped = Math.min(88, Math.pow(diffY, 0.78) * 1.7)
          setPullY(damped)
        }
      } else if (diffY < 0 && pulling) {
        setPullY(0)
        pulling = false
        setIsPulling(false)
      }
    }

    const onTouchEnd = async () => {
      if (!tracking) return
      tracking = false

      if (pulling) {
        pulling = false
        setIsPulling(false)
        const currentY = pullYRef.current

        if (currentY >= 48 && !refreshingRef.current) {
          setRefreshing(true)
          setPullY(72)
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

    // Suporte também a mouse drag no computador para testes
    let mouseDragging = false
    const onMouseDown = (e: MouseEvent) => {
      if (refreshingRef.current || e.button !== 0) return
      const target = e.target as HTMLElement | null
      if (target?.closest('.sheet, .veu, .toasts, button, input, textarea, a')) return
      if (!isPageAtTop()) return

      mouseDragging = true
      startY = e.clientY
      startX = e.clientX
      tracking = true
    }
    const onMouseMove = (e: MouseEvent) => {
      if (!mouseDragging || !tracking || refreshingRef.current) return
      const diffY = e.clientY - startY
      if (diffY > 6) {
        pulling = true
        setIsPulling(true)
        const damped = Math.min(88, Math.pow(diffY, 0.78) * 1.7)
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

  const threshold = pullY >= 48
  const txt = TEXTOS_ABA[aba] ?? TEXTOS_ABA.inicio
  const progresso = Math.min(1, pullY / 48)

  const temTomate = progresso >= 0.25 || refreshing
  const temAbacate = progresso >= 0.50 || refreshing
  const temBanana = progresso >= 0.75 || refreshing
  const temUva = threshold || refreshing

  const alturaAtual = refreshing ? 72 : pullY

  return (
    <div className={`ptr-wrapper ${isInicio ? 'ptr-wrapper-inicio' : ''}`}>
      {/* Área expansível no topo do conteúdo (em fluxo natural, nunca sai da tela) */}
      <div
        className="ptr-head"
        style={{
          height: alturaAtual,
          transition: isPulling ? 'none' : 'height 0.28s cubic-bezier(0.2, 0.8, 0.2, 1)'
        }}
        aria-hidden={alturaAtual === 0}
      >
        <div
          className="ptr-head-inner"
          style={{
            opacity: pullY > 8 || refreshing ? 1 : Math.max(0, pullY / 8),
            transform: `scale(${refreshing ? 1 : Math.min(1.05, 0.85 + progresso * 0.18)})`
          }}
        >
          <div className={`ptr-cartaz ${threshold ? 'pronto' : ''} ${refreshing ? 'girando' : ''} ${success ? 'sucesso' : ''}`}>
            <div className="ptr-cesta-area">
              <span className="ptr-cesta-base" role="img" aria-label="Cesta">
                {success ? txt.iconeFim : '🧺'}
              </span>

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
        </div>
      </div>

      {/* Conteúdo da página */}
      <div className={isInicio ? 'ptr-content-inicio' : 'ptr-content-padrao'}>
        {children}
      </div>
    </div>
  )
}
