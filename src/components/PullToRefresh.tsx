import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Aba } from '../Menu'

interface PullToRefreshProps {
  children: ReactNode
  onRefresh: () => Promise<void>
  aba: Aba
}

// distâncias do gesto, em px da área que abre no topo
const LIMITE = 84   // a partir daqui, soltar atualiza
const MAXIMO = 112  // o quanto a área estica
const ABERTO = 96   // altura enquanto atualiza

const TEXTOS_ABA: Record<Aba, { carregando: string; sucesso: string }> = {
  inicio: { carregando: 'Atualizando a casa…', sucesso: 'Tudo em dia' },
  lista: { carregando: 'Buscando a feira…', sucesso: 'Feira fresquinha' },
  dinheiro: { carregando: 'Conferindo as contas…', sucesso: 'Contas em dia' },
  casa: { carregando: 'Arrumando a casa…', sucesso: 'Casa em ordem' },
}

/** Carrinho de mercado: as compras caem no cesto conforme o puxão avança (itens = quantas já caíram) */
function Carrinho({ giro, itens }: { giro: number; itens: number }) {
  const roda = { transform: `rotate(${giro}deg)` }
  const traco = { fill: 'none', stroke: 'var(--tinta)', strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const
  return (
    <svg viewBox="0 0 96 72" width="92" height="69" aria-hidden>
      <ellipse className="ptr-sombra" cx="52" cy="67.5" rx="30" ry="2.6" />

      {/* compras: caixa de leite, baguete e tomate */}
      <g className={`ptr-item i3 ${itens >= 3 ? 'dentro' : ''}`}>
        <path d="M63 13l6.5-6.5L76 13v22H63z" fill="var(--papel)" stroke="var(--tinta)" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M63 13h13" stroke="var(--tinta)" strokeWidth="1.8" />
        <rect x="63.9" y="18" width="11.2" height="7" fill="var(--uva)" />
      </g>
      <g className={`ptr-item i2 ${itens >= 2 ? 'dentro' : ''}`}>
        <g transform="rotate(16 55 16)">
          <rect x="50" y="-4" width="10" height="40" rx="5" fill="#E2B36B" stroke="var(--tinta)" strokeWidth="1.8" />
          <path d="M52.5 3l5 3M52.5 10l5 3M52.5 17l5 3" stroke="#A9772F" strokeWidth="1.8" strokeLinecap="round" />
        </g>
      </g>
      <g className={`ptr-item i1 ${itens >= 1 ? 'dentro' : ''}`}>
        <circle cx="39" cy="18" r="9.5" fill="var(--tomate)" stroke="var(--tinta)" strokeWidth="1.8" />
        <path d="M33.5 16a6 6 0 0 1 4-4.5" fill="none" stroke="#fff" strokeOpacity="0.65" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M34 9.6c2.4-1.8 7.6-1.8 10 0-2.4 1.6-7.6 1.6-10 0z" fill="var(--folha)" />
        <path d="M39 9.4l.6-4" stroke="var(--folha)" strokeWidth="2" strokeLinecap="round" />
      </g>

      {/* cesto de arame, por cima das compras */}
      <path d="M22 20h62l-8 24H30z" fill="var(--papel)" fillOpacity="0.55" stroke="var(--tinta)" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M34 20l4.9 24M46 20l1.8 24M58 20l-1.3 24M70 20l-4.4 24M26 32h54" stroke="var(--tinta)" strokeOpacity="0.5" strokeWidth="1.5" />
      <path d="M19 20h68" {...traco} strokeWidth={3.4} />

      {/* cabo com pegador */}
      <path d="M22 20L13 9H6" {...traco} />
      <path d="M3.5 9h8.5" fill="none" stroke="var(--tomate)" strokeWidth="5" strokeLinecap="round" />

      {/* chassi e rodas */}
      <path d="M30 44l3 8h42M34 52v6M70 52v6" {...traco} />
      {[34, 70].map(x => (
        <g className="ptr-roda" style={roda} key={x}>
          <circle cx={x} cy="59" r="6.5" fill="var(--papel)" stroke="var(--tinta)" strokeWidth="2.6" />
          <path d={`M${x} 53.6v10.8M${x - 5.4} 59h10.8`} stroke="var(--tinta)" strokeWidth="1.5" />
          <circle cx={x} cy="59" r="2.1" fill="var(--abobora)" />
        </g>
      ))}
    </svg>
  )
}

export function PullToRefresh({ children, onRefresh, aba }: PullToRefreshProps) {
  const [pullY, setPullY] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [success, setSuccess] = useState(false)
  const [falhou, setFalhou] = useState(false)
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
    const amortecido = (diffY: number) => Math.min(MAXIMO, Math.pow(diffY, 0.78) * 2.2)

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
          setPullY(amortecido(diffY))
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

        if (currentY >= LIMITE && !refreshingRef.current) {
          setRefreshing(true)
          setPullY(ABERTO)
          try {
            if ('vibrate' in navigator) navigator.vibrate?.(20)
            await onRefresh()
            setSuccess(true)
          } catch {
            // quem chama já avisou o motivo; aqui o carrinho só volta de ré
            setFalhou(true)
          }
          // tempo para o carrinho sair de cena antes de a área fechar
          await new Promise(r => setTimeout(r, 750))
          setSuccess(false)
          setFalhou(false)
          setRefreshing(false)
          setPullY(0)
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
        setPullY(amortecido(diffY))
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

  const txt = TEXTOS_ABA[aba] ?? TEXTOS_ABA.inicio
  const progresso = Math.min(1, pullY / LIMITE)
  const pronto = pullY >= LIMITE
  const ativo = refreshing || success || falhou

  // o carrinho entra rodando da esquerda e as compras caem no cesto uma a uma
  const itens = ativo ? 3 : progresso >= 0.82 ? 3 : progresso >= 0.56 ? 2 : progresso >= 0.3 ? 1 : 0
  const estado = falhou ? 'voltou' : success ? 'foi' : refreshing ? 'rodando' : pronto ? 'pronto' : 'puxando'
  const legenda = falhou ? 'Não deu para atualizar' : success ? txt.sucesso : refreshing ? txt.carregando : pronto ? 'Solte para atualizar' : 'Puxe para atualizar'
  const alturaAtual = refreshing ? ABERTO : pullY

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
        <div className={`ptr-palco ${estado} ${isPulling ? 'no-dedo' : ''}`} style={{ ['--p' as string]: ativo ? 1 : progresso }}>
          <span className="ptr-legenda" role={ativo ? 'status' : undefined}>{legenda}</span>
          <div className="ptr-chao" />
          <div className="ptr-vento" aria-hidden><i /><i /><i /></div>
          <div className="ptr-carro">
            <Carrinho giro={Math.round(progresso * 540)} itens={itens} />
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
