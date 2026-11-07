import { motion, useReducedMotion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { FRUITS } from '../lib/catalog'
import { say, useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Adesivo } from '../ui'

const FAIXA = ['🍅', '🥑', '🍌', '🥕', '🍆', '🧀', '🍞', '🍋']

function Faixa() {
  const reduce = useReducedMotion()
  return (
    <div className="feira-faixa" aria-hidden>
      {FAIXA.map((f, i) => (
        <motion.span key={f} initial={reduce ? false : { y: -60, rotate: -40, opacity: 0 }}
          animate={{ y: 0, rotate: (i % 2 ? 8 : -8), opacity: 1 }}
          transition={{ type: 'spring', delay: 0.15 + i * 0.07, damping: 9, stiffness: 160 }}>{f}</motion.span>
      ))}
    </div>
  )
}

export function Login() {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [modo, setModo] = useState<'link' | 'senha' | 'criar'>('link')
  const [enviado, setEnviado] = useState(false)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErro('')
    try {
      if (modo === 'link') {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(), options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL },
        })
        if (error) throw error
        setEnviado(true)
      } else if (modo === 'senha') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: senha })
        if (error) throw error.message.includes('Invalid login') ? new Error('E-mail ou senha não conferem.') : error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password: senha, options: { emailRedirectTo: location.origin + import.meta.env.BASE_URL },
        })
        if (error) throw error
        if (!data.session) setEnviado(true)
      }
    } catch (e) {
      const m = say(e)
      setErro(/rate limit/i.test(m) ? 'Muitos e-mails em pouco tempo. Espere alguns minutos e tente de novo.' : m)
    } finally { setBusy(false) }
  }

  return (
    <div className="entrada-tela">
      <Faixa />
      <h1 className="marca-casa">Grazi <span className="e">e</span><br />Jonas</h1>
      <p className="leve" style={{ maxWidth: 340, margin: 0 }}>
        A lista do mercado, a despensa, as tarefas e o dinheiro de vocês dois no mesmo lugar.
      </p>

      <div style={{ marginTop: 'auto', paddingTop: 36 }}>
        {enviado ? (
          <div className="bloco banana">
            <p className="subtitulo" style={{ marginBottom: 6 }}>Confira seu e-mail</p>
            <p style={{ margin: 0 }}>
              Mandamos um link para <b>{email}</b>. Abra no celular e toque nele para entrar.
              Se não aparecer, olhe o spam.
            </p>
            <button className="link" style={{ marginTop: 12 }} onClick={() => setEnviado(false)}>Usar outro e-mail</button>
          </div>
        ) : (
          <form onSubmit={enviar}>
            <label className="campo">
              <span>Seu e-mail</span>
              <input className="entrada" type="email" required autoComplete="email" inputMode="email"
                value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" />
            </label>
            {modo !== 'link' && (
              <label className="campo">
                <span>{modo === 'criar' ? 'Crie uma senha (mínimo 6)' : 'Senha'}</span>
                <input className="entrada" type="password" required minLength={6}
                  autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
                  value={senha} onChange={e => setSenha(e.target.value)} />
              </label>
            )}
            {erro && <p role="alert" style={{ color: 'var(--tomate)', fontWeight: 700 }}>{erro}</p>}
            <button className="btn tomate cheio" style={{ marginTop: 18 }} disabled={busy}>
              {busy ? 'Enviando…' : modo === 'link' ? 'Receber link de entrada' : modo === 'senha' ? 'Entrar' : 'Criar conta'}
            </button>
            <p className="pequeno leve" style={{ textAlign: 'center', marginTop: 16 }}>
              {modo === 'link'
                ? <>No iPhone com o app instalado, prefira <button type="button" className="link" onClick={() => setModo('senha')}>entrar com senha</button>.</>
                : modo === 'senha'
                  ? <>Primeira vez? <button type="button" className="link" onClick={() => setModo('criar')}>Criar conta com senha</button> · <button type="button" className="link" onClick={() => setModo('link')}>usar link</button></>
                  : <>Já tem conta? <button type="button" className="link" onClick={() => setModo('senha')}>Entrar</button></>}
            </p>
          </form>
        )}
      </div>
    </div>
  )
}

export function Escolher({ value, onChange }: { value: string; onChange: (f: string) => void }) {
  return (
    <div className="chips" role="radiogroup" aria-label="Sua fruta">
      {Object.entries(FRUITS).map(([id, f]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} aria-label={f.label}
          onClick={() => onChange(id)}
          style={{ padding: 6, borderRadius: 18, background: value === id ? 'var(--banana)' : 'transparent' }}>
          <Adesivo fruit={id} size={40} />
        </button>
      ))}
    </div>
  )
}

export function Casa() {
  const { reload, session } = useStore()
  const [modo, setModo] = useState<'criar' | 'entrar'>('criar')
  const [nome, setNome] = useState('')
  const [fruta, setFruta] = useState('tomate')
  const [codigo, setCodigo] = useState('')
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErro('')
    const { error } = modo === 'criar'
      ? await supabase.rpc('create_household', { p_name: 'Grazi e Jonas', p_member: nome, p_fruit: fruta })
      : await supabase.rpc('join_household', { p_code: codigo, p_member: nome, p_fruit: fruta })
    if (error) { setErro(say(error)); setBusy(false); return }
    await reload()
  }

  return (
    <div className="entrada-tela">
      <h1 className="titulo">Quase lá</h1>
      <p className="leve">Entrou como {session?.user.email}.</p>
      <div className="segmento" style={{ marginTop: 18 }}>
        <button aria-pressed={modo === 'criar'} onClick={() => setModo('criar')}>Sou o primeiro</button>
        <button aria-pressed={modo === 'entrar'} onClick={() => setModo('entrar')}>Tenho um código</button>
      </div>
      <form onSubmit={enviar} style={{ marginTop: 8 }}>
        {modo === 'entrar' && (
          <label className="campo">
            <span>Código da casa</span>
            <input className="entrada" required value={codigo} maxLength={6} autoCapitalize="characters"
              style={{ textTransform: 'uppercase', letterSpacing: '0.3em', fontWeight: 800 }}
              onChange={e => setCodigo(e.target.value)} placeholder="A1B2C3" />
          </label>
        )}
        <label className="campo">
          <span>Como te chamam</span>
          <input className="entrada" required value={nome} onChange={e => setNome(e.target.value)} placeholder="Grazi" maxLength={24} />
        </label>
        <div className="campo">
          <span>Escolha seu adesivo</span>
          <Escolher value={fruta} onChange={setFruta} />
        </div>
        {erro && <p role="alert" style={{ color: 'var(--tomate)', fontWeight: 700 }}>{erro}</p>}
        <button className="btn tomate cheio" style={{ marginTop: 24 }} disabled={busy}>
          {busy ? 'Um instante…' : modo === 'criar' ? 'Criar a casa' : 'Entrar na casa'}
        </button>
        {modo === 'criar' && <p className="pequeno leve" style={{ textAlign: 'center' }}>Depois você manda o código para a outra pessoa entrar.</p>}
      </form>
    </div>
  )
}
