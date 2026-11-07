import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { monthOf } from './lib/format'
import { useStore } from './lib/store'
import { Casa as CasaTela } from './screens/Casa'
import { Dinheiro } from './screens/Dinheiro'
import { Casa as CriarCasa, Login, NovaSenha } from './screens/Entrar'
import { Inicio } from './screens/Inicio'
import { Lancar } from './screens/Lancar'
import { Lista } from './screens/Lista'
import { ABAS, Menu, type Aba } from './Menu'
import { Toasts } from './ui'

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
    const h = () => setAba(lerAba())
    window.addEventListener('hashchange', h)
    return () => window.removeEventListener('hashchange', h)
  }, [])
  const ir = (a: Aba) => { if (a !== aba) { history.pushState(null, '', `#${a}`); setAba(a); window.scrollTo({ top: 0, behavior: 'instant' }) } }

  if (!s.ready) return <div className="app" />
  if (!s.session) return <div className="app"><Login /><Toasts /></div>
  if (s.recuperando) return (
    <div className="app"><div className="entrada-tela">
      <NovaSenha titulo={`Crie a senha nova de ${s.session.user.email}`} onPronto={s.fimRecuperacao} />
    </div><Toasts /></div>
  )
  if (!s.loaded) return <div className="app"><div className="vazio" style={{ paddingTop: '40vh' }}><span className="emoji">🧺</span>Arrumando a feira…</div></div>
  if (!s.household || !s.me) return <div className="app"><CriarCasa /><Toasts /></div>

  const faltam = s.items.filter(i => !i.checked).length
  return (
    <div className="app">
      {(!s.online || s.pendentes > 0) && (
        <div className="offline" role="status">
          {!s.online ? 'Sem internet. A lista continua funcionando' : 'Enviando mudanças da lista'}
          {s.pendentes > 0 ? ` · ${s.pendentes} ${s.pendentes === 1 ? 'mudança esperando' : 'mudanças esperando'}` : '.'}
        </div>
      )}
      <AnimatePresence mode="wait">
        <motion.main key={aba} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }}>
          {aba === 'inicio' && <Inicio ir={ir} />}
          {aba === 'lista' && <Lista />}
          {aba === 'dinheiro' && <Dinheiro month={mes} setMonth={setMes} />}
          {aba === 'casa' && <CasaTela />}
        </motion.main>
      </AnimatePresence>

      {(aba === 'inicio' || aba === 'dinheiro') && (
        <button className={`fab ${fabVisivel ? '' : 'escondido'}`} onClick={() => setLancar(true)}><span className="mais" aria-hidden>+</span> Lançar</button>
      )}
      <Lancar open={lancar} onClose={() => setLancar(false)} />

      <Menu aba={aba} ir={ir} contador={faltam} />
      <Toasts />
    </div>
  )
}
