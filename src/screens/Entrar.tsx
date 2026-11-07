import { motion, useReducedMotion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import { FRUITS } from '../lib/catalog'
import { say, useStore } from '../lib/store'
import { supabase } from '../lib/supabase'
import { Adesivo } from '../ui'

// No iPhone, o app instalado não recebe o login feito pelo link do e-mail (abre no Safari, que é separado)
export const iphoneInstalado = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) &&
  (matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true)
const BASE = () => location.origin + import.meta.env.BASE_URL

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
  const [modo, setModo] = useState<'link' | 'senha' | 'criar' | 'esqueci'>(iphoneInstalado() ? 'senha' : 'link')
  const [enviado, setEnviado] = useState<false | 'link' | 'confirmar' | 'senha'>(false)
  const [busy, setBusy] = useState(false)
  const [erro, setErro] = useState('')

  const enviar = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setErro('')
    try {
      if (modo === 'link') {
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim().toLowerCase(), options: { emailRedirectTo: BASE() },
        })
        if (error) throw error
        setEnviado('link')
      } else if (modo === 'esqueci') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: BASE() })
        if (error) throw error
        setEnviado('senha')
      } else if (modo === 'senha') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password: senha })
        if (error) throw error.message.includes('Invalid login') ? new Error('E-mail ou senha não conferem.') : error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(), password: senha, options: { emailRedirectTo: BASE() },
        })
        if (error) throw error
        if (!data.session) setEnviado('confirmar')
      }
    } catch (e) {
      const m = say(e)
      setErro(/rate limit/i.test(m) ? 'Muitos e-mails em pouco tempo. Espere uma hora e tente de novo, ou entre com a senha.' : m)
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
            {enviado === 'senha' ? (
              <p style={{ margin: 0 }}>Mandamos um link para <b>{email}</b>. Toque nele: vai abrir no navegador uma tela para <b>criar a senha nova</b>.
                Depois, volte para o app instalado e entre com o e-mail e essa senha.</p>
            ) : enviado === 'confirmar' ? (
              <p style={{ margin: 0 }}>Mandamos um link para <b>{email}</b> para confirmar a conta. Toque nele e depois volte aqui para entrar com a senha.</p>
            ) : (
              <p style={{ margin: 0 }}>Mandamos um link para <b>{email}</b>. Abra neste celular e toque nele para entrar. Se não aparecer, olhe o spam.</p>
            )}
            <button className="link" style={{ marginTop: 12 }} onClick={() => { setEnviado(false); setModo('senha') }}>Voltar para entrar</button>
          </div>
        ) : (
          <form onSubmit={enviar}>
            <label className="campo">
              <span>Seu e-mail</span>
              <input className="entrada" type="email" required autoComplete="email" inputMode="email" autoCapitalize="none" autoCorrect="off" spellCheck={false}
                value={email} onChange={e => setEmail(e.target.value)} placeholder="voce@email.com" />
            </label>
            {iphoneInstalado() && modo === 'senha' && (
              <p className="aviso">No iPhone, o app instalado entra com <b>e-mail e senha</b>. O link do e-mail abre no Safari, que fica com um login separado.</p>
            )}
            {modo !== 'link' && modo !== 'esqueci' && (
              <label className="campo">
                <span>{modo === 'criar' ? 'Crie uma senha (mínimo 6)' : 'Senha'}</span>
                <input className="entrada" type="password" required minLength={6}
                  autoComplete={modo === 'criar' ? 'new-password' : 'current-password'}
                  value={senha} onChange={e => setSenha(e.target.value)} />
              </label>
            )}
            {erro && <p role="alert" style={{ color: 'var(--tomate)', fontWeight: 700 }}>{erro}</p>}
            <button className="btn tomate cheio" style={{ marginTop: 18 }} disabled={busy}>
              {busy ? 'Enviando…' : modo === 'link' ? 'Receber link de entrada' : modo === 'senha' ? 'Entrar' : modo === 'esqueci' ? 'Mandar link para criar senha' : 'Criar conta'}
            </button>
            <p className="pequeno leve" style={{ textAlign: 'center', marginTop: 16 }}>
              {modo === 'link'
                ? <>Prefere senha? <button type="button" className="link" onClick={() => setModo('senha')}>Entrar com senha</button></>
                : modo === 'senha'
                  ? <><button type="button" className="link" onClick={() => setModo('esqueci')}>Esqueci ou não tenho senha</button> · <button type="button" className="link" onClick={() => setModo('criar')}>Criar conta</button>{!iphoneInstalado() && <> · <button type="button" className="link" onClick={() => setModo('link')}>usar link</button></>}</>
                  : modo === 'esqueci'
                    ? <>Vamos mandar um link para você criar uma senha nova. <button type="button" className="link" onClick={() => setModo('senha')}>Voltar</button></>
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
    const { data, error } = modo === 'criar'
      ? await supabase.rpc('create_household', { p_name: 'Grazi e Jonas', p_member: nome, p_fruit: fruta })
      : await supabase.rpc('join_household', { p_code: codigo, p_member: nome, p_fruit: fruta })
    if (error) { setErro(say(error)); setBusy(false); return }
    if (!data || !(data as { id?: string }).id) { setErro('Código não encontrado. Confira as 8 letras e números com quem te convidou.'); setBusy(false); return }
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
            <input className="entrada" required value={codigo} maxLength={8} autoCapitalize="characters"
              style={{ textTransform: 'uppercase', letterSpacing: '0.3em', fontWeight: 800 }}
              onChange={e => setCodigo(e.target.value)} placeholder="K7Q2ZP9M" />
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

/** Criar ou trocar a senha de quem já está logado (link de recuperação ou Ajustes) */
export function NovaSenha({ titulo, onPronto }: { titulo: string; onPronto: () => void }) {
  const { toast } = useStore()
  const [senha, setSenha] = useState('')
  const [busy, setBusy] = useState(false)
  const salvar = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setBusy(false)
    if (error) return toast(/should be different/i.test(error.message) ? 'Escolha uma senha diferente da anterior.' : say(error), 'erro')
    toast('Senha salva. No iPhone, entre no app instalado com o e-mail e essa senha.')
    onPronto()
  }
  return (
    <form onSubmit={salvar}>
      <p className="subtitulo" style={{ margin: '0 0 6px' }}>{titulo}</p>
      <label className="campo"><span>Senha nova (mínimo 6)</span>
        <input className="entrada" type="password" required minLength={6} autoComplete="new-password" value={senha} onChange={e => setSenha(e.target.value)} /></label>
      <button className="btn folha cheio" style={{ marginTop: 14 }} disabled={busy || senha.length < 6}>{busy ? 'Salvando…' : 'Salvar senha'}</button>
    </form>
  )
}
