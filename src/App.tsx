import { AnimatePresence, MotionConfig, motion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { monthOf } from './lib/format'
import { say, useStore } from './lib/store'
import { Casa as CasaTela } from './screens/Casa'
import { Dinheiro } from './screens/Dinheiro'
import { Casa as CriarCasa, Login, NovaSenha } from './screens/Entrar'
import { Inicio } from './screens/Inicio'
import { Lancar } from './screens/Lancar'
import { Lista } from './screens/Lista'
import { ABAS, Menu, type Aba } from './Menu'
import { PullToRefresh } from './components/PullToRefresh'
import { Toasts } from './ui'

// o conteúdo entra pelo lado da aba tocada e sai pelo lado oposto (dir: 1 = aba à direita)
const TELAS = {
  entra: (d: number) => ({ opacity: 0, x: d * 28, y: d === 0 ? 8 : 0 }),
  centro: { opacity: 1, x: 0, y: 0 },
  sai: (d: number) => ({ opacity: 0, x: d * -28 }),
}
const posicao = (a: Aba) => ABAS.findIndex(x => x.id === a)

const lerAba = (): Aba => {
  const h = location.hash.replace('#', '') as Aba
  return ABAS.some(a => a.id === h) ? h : 'inicio'
}

export default function App() {
  const s = useStore()
  const [aba, setAba] = useState<Aba>(lerAba)
  const [mes, setMes] = useState(monthOf(new Date()))
  const [lancar, setLancar] = useState(false)
  const [fabVisivel, setFabVisivel] = useState(true)
  const [dir, setDir] = useState(0)
  const abaAtual = useRef(aba)
  const mudar = (nova: Aba) => {
    if (nova === abaAtual.current) return
    setDir(Math.sign(posicao(nova) - posicao(abaAtual.current)))
    abaAtual.current = nova
    setAba(nova)
  }
  // puxar para atualizar: sem internet ou com erro, avisa em vez de dizer que sincronizou
  const { reload, toast } = s
  const atualizar = useCallback(async () => {
    if (!navigator.onLine) { toast('Sem internet. Não deu para atualizar agora.', 'erro'); throw new Error('sem internet') }
    try { await reload() } catch (e) { toast(say(e), 'erro'); throw e }
  }, [reload, toast])
  useEffect(() => {
    let ultimo = window.scrollY
    const rolar = () => {
      const y = window.scrollY
      if (Math.abs(y - ultimo) > 8) { setFabVisivel(y < ultimo || y < 80); ultimo = y }
    }
    window.addEventListener('scroll', rolar, { passive: true })
    return () => window.removeEventListener('scroll', rolar)
  }, [])

  useEffect(() => {
    const h = () => mudar(lerAba())
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const ir = (a: Aba) => { if (a !== aba) { history.pushState(null, '', `#${a}`); mudar(a); window.scrollTo({ top: 0, behavior: 'instant' }) } }

  if (!s.ready) return <div className="app" />
  if (!s.session) return <div className="app"><Login /><Toasts /></div>
  if (s.recuperando) return (
    <div className="app"><div className="entrada-tela">
      <NovaSenha titulo={`Crie a senha nova de ${s.session.user.email}`} onPronto={s.fimRecuperacao} />
    </div><Toasts /></div>
  )
  if (!s.loaded) return <div className="app"><div className="vazio" style={{ paddingTop: '40vh' }}><span className="emoji">🧺</span>Arrumando a feira…</div></div>
  if ((!s.household || !s.me) && s.semConexao) return (
    <div className="app">
      <div className="vazio" style={{ paddingTop: '32vh' }}>
        <span className="emoji">📡</span>
        <p>Sem conexão para abrir a casa de vocês. Na primeira vez neste aparelho, o app precisa de internet.</p>
        <button className="btn tomate" onClick={() => s.reload().catch(() => s.toast('Ainda sem conexão. Tente de novo em instantes.', 'erro'))}>Tentar de novo</button>
      </div>
      <Toasts />
    </div>
  )
  if (!s.household || !s.me) return <div className="app"><CriarCasa /><Toasts /></div>

  const faltam = s.items.filter(i => !i.checked).length
  return (
    <MotionConfig reducedMotion="user">
    <div className={`app ${aba === 'inicio' ? 'app-inicio' : ''}`}>
      {(!s.online || s.pendentes > 0) && (
        <div className="offline" role="status">
          {!s.online ? 'Sem internet. A lista continua funcionando' : 'Enviando mudanças da lista'}
          {s.pendentes > 0 ? ` · ${s.pendentes} ${s.pendentes === 1 ? 'mudança esperando' : 'mudanças esperando'}` : '.'}
        </div>
      )}
      <PullToRefresh aba={aba} onRefresh={atualizar}>
        <AnimatePresence mode="wait" custom={dir}>
          <motion.main key={aba} className={aba === 'inicio' ? 'main-inicio' : ''} custom={dir} variants={TELAS} initial="entra" animate="centro" exit="sai" transition={{ duration: 0.18, ease: 'easeOut' }}>
            {aba === 'inicio' && <Inicio ir={ir} />}
            {aba === 'lista' && <Lista />}
            {aba === 'dinheiro' && <Dinheiro month={mes} setMonth={setMes} />}
            {aba === 'casa' && <CasaTela />}
          </motion.main>
        </AnimatePresence>
      </PullToRefresh>

      {(aba === 'inicio' || aba === 'dinheiro') && (
        <button className={`fab ${fabVisivel ? '' : 'escondido'}`} onClick={() => setLancar(true)}><span className="mais" aria-hidden>+</span> Lançar</button>
      )}
      <Lancar open={lancar} onClose={() => setLancar(false)} />

      <Menu aba={aba} ir={ir} contador={faltam} />
      <Toasts />
    </div>
    </MotionConfig>
  )
}
