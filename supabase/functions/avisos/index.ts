// Avisos no celular: contas fixas e faturas que vencem em até 3 dias.
//   { modo: "chave" }   -> chave pública para o celular se inscrever
//   { modo: "teste" }   -> manda um aviso de teste para quem está logado (precisa do login)
//   { modo: "diario" }  -> roda todo dia às 8h (agendado no banco); no máximo 1 aviso por casa por dia
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const APP = 'https://jscologni.github.io/grazi-e-jonas/'
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
const brl = (v: number) => `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

type Chaves = { publicKey: string; privateKey: string }
let cache: Chaves | null = null
async function chaves(): Promise<Chaves> {
  if (cache) return cache
  const { data } = await db.from('config_privada').select('valor').eq('nome', 'vapid').maybeSingle()
  if (data?.valor) return (cache = data.valor as Chaves)
  const novas = webpush.generateVAPIDKeys()
  const { error } = await db.from('config_privada').insert({ nome: 'vapid', valor: novas })
  if (error) { // outra execução criou ao mesmo tempo: usa a que ficou gravada
    const { data: d2 } = await db.from('config_privada').select('valor').eq('nome', 'vapid').single()
    return (cache = d2!.valor as Chaves)
  }
  return (cache = novas)
}

async function usuario(auth: string): Promise<string | null> {
  if (!auth.startsWith('Bearer ')) return null
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
  }).catch(() => null)
  if (!r?.ok) return null
  return (await r.json()).id ?? null
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string }
async function enviar(subs: Sub[], aviso: { title: string; body: string; url?: string; tag?: string }) {
  const k = await chaves()
  webpush.setVapidDetails(APP, k.publicKey, k.privateKey)
  let ok = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(aviso), { TTL: 20 * 3600 })
      ok++
    } catch (e) {
      const st = (e as { statusCode?: number }).statusCode
      if (st === 404 || st === 410) await db.from('push_subs').delete().eq('id', s.id) // celular desinstalou ou desligou
    }
  }
  return ok
}

/** data de hoje em Criciúma (America/Sao_Paulo) */
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const dias = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / 86400000)
const quando = (d: number) => d === 0 ? 'hoje' : d === 1 ? 'amanhã' : d < 0 ? 'venceu ontem' : `em ${d} dias`

async function diario() {
  const hoje = hojeSP()
  const [y, m] = hoje.split('-').map(Number)
  // mês passado, este e o próximo: quem vence dia 1 precisa do aviso ainda no fim do mês anterior
  const meses = [-1, 0, 1].map(n => new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10))
  const venc = (mes: string, dia: number) => {
    const [a, b] = mes.split('-').map(Number)
    const ultimo = new Date(Date.UTC(a, b, 0)).getUTCDate()
    return `${mes.slice(0, 8)}${String(Math.min(dia, ultimo)).padStart(2, '0')}`
  }

  const { data: subs } = await db.from('push_subs').select('id, household_id, endpoint, p256dh, auth')
  const casas = [...new Set((subs ?? []).map(s => s.household_id))]
  let avisadas = 0
  for (const casa of casas) {
    const itens: { nome: string; valor: number; d: number }[] = []
    const [{ data: bills }, { data: pagas }, { data: cards }, { data: compras }, { data: pagtos }] = await Promise.all([
      db.from('bills').select('id, name, amount, due_day').eq('household_id', casa).eq('active', true),
      db.from('transactions').select('bill_id, month').eq('household_id', casa).in('month', meses).not('bill_id', 'is', null),
      db.from('cards').select('id, name, due_day').eq('household_id', casa).eq('archived', false),
      db.from('transactions').select('card_id, month, amount').eq('household_id', casa).in('month', meses).eq('kind', 'out').not('card_id', 'is', null),
      db.from('card_payments').select('card_id, month, amount').eq('household_id', casa).in('month', meses),
    ])
    for (const mes of meses) {
      for (const b of bills ?? []) {
        const d = dias(hoje, venc(mes, b.due_day))
        const paga = (pagas ?? []).some(p => p.bill_id === b.id && p.month === mes)
        if (!paga && d >= -1 && d <= 3) itens.push({ nome: b.name, valor: +b.amount, d })
      }
      for (const c of cards ?? []) {
        const total = (compras ?? []).filter(t => t.card_id === c.id && t.month === mes).reduce((a, t) => a + +t.amount, 0)
        const pago = (pagtos ?? []).filter(p => p.card_id === c.id && p.month === mes).reduce((a, p) => a + +p.amount, 0)
        const falta = Math.round((total - pago) * 100) / 100
        const d = dias(hoje, venc(mes, c.due_day))
        if (falta > 0 && d >= -1 && d <= 3) itens.push({ nome: `Fatura ${c.name}`, valor: falta, d })
      }
    }
    if (!itens.length) continue
    // no máximo um aviso por casa por dia
    const { error: ja } = await db.from('avisos_enviados').insert({ household_id: casa, chave: 'diario', dia: hoje })
    if (ja) continue
    itens.sort((a, b) => a.d - b.d)
    const title = itens.length === 1 ? `${itens[0].nome} vence ${quando(itens[0].d)}`.replace('vence venceu', 'venceu') : `${itens.length} contas para pagar`
    const body = itens.map(i => `${i.nome} ${quando(i.d)} (${brl(i.valor)})`).join(' · ')
    await enviar((subs ?? []).filter(s => s.household_id === casa), { title, body, url: `${APP}#dinheiro`, tag: `contas-${hoje}` })
    avisadas++
  }
  return { casas: casas.length, avisadas }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const resp = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
  let body: { modo?: string } = {}
  try { body = await req.json() } catch { /* corpo vazio */ }
  try {
    if (body.modo === 'chave') return resp({ publicKey: (await chaves()).publicKey })
    if (body.modo === 'teste') {
      const uid = await usuario(req.headers.get('Authorization') ?? '')
      if (!uid) return resp({ erro: 'Entre no app primeiro' }, 401)
      const { data: subs } = await db.from('push_subs').select('id, endpoint, p256dh, auth').eq('user_id', uid)
      const ok = await enviar(subs ?? [], { title: 'Avisos ligados 🔔', body: 'É assim que os avisos de contas e faturas vão chegar.', url: `${APP}#dinheiro`, tag: 'teste' })
      return resp({ enviados: ok })
    }
    if (body.modo === 'diario') return resp(await diario())
    return resp({ erro: 'modo desconhecido' }, 400)
  } catch (e) {
    return resp({ erro: String((e as Error).message ?? e) }, 500)
  }
})
