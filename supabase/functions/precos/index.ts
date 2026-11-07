// Ponte de preços: busca nos sites (VTEX) do Angeloni, Bistek, Giassi e Atacadão.
// O celular não pode chamar esses sites direto (sem CORS), então o app chama esta função.
// Só responde para quem está logado no app (conferido em logado(); a verificação JWT antiga fica desligada).
//   { termo: "café pilão" }      -> produtos de cada mercado para escolher
//   { eans: ["789...", ...] }    -> preço atual de cada código de barras em cada mercado

const LOJAS = [
  { id: 'angeloni', nome: 'Angeloni', api: 'https://super.angeloni.com.br/api', site: 'https://super.angeloni.com.br' },
  { id: 'bistek', nome: 'Bistek', api: 'https://www.bistek.com.br/api', site: 'https://www.bistek.com.br' },
  { id: 'giassi', nome: 'Giassi', api: 'https://www.giassi.com.br/api', site: 'https://www.giassi.com.br' },
  { id: 'atacadao', nome: 'Atacadão', api: 'https://www.atacadao.com.br/io/api', site: 'https://www.atacadao.com.br' },
]
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const TTL = 4 * 3600 * 1000 // guarda por 4 horas para não sobrecarregar os sites
const cache = new Map<string, { t: number; v: Oferta[] }>()

interface Oferta {
  loja: string; mercado: string; nome: string; marca: string | null; ean: string | null
  preco: number; de: number | null; porKg: boolean; imagem: string | null; link: string
}

// deno-lint-ignore no-explicit-any
function ler(loja: typeof LOJAS[number], produtos: any[]): Oferta[] {
  const out: Oferta[] = []
  for (const p of produtos ?? []) {
    for (const it of p.items ?? []) {
      const o = it.sellers?.find((s: { commertialOffer?: { Price?: number } }) => (s.commertialOffer?.Price ?? 0) > 0)?.commertialOffer
      if (!o) continue
      const porKg = it.measurementUnit === 'kg' && it.unitMultiplier > 0
      const div = porKg ? it.unitMultiplier : 1
      out.push({
        loja: loja.id, mercado: loja.nome, nome: p.productName, marca: p.brand ?? null, ean: it.ean || null,
        preco: Math.round((o.Price / div) * 100) / 100,
        de: o.ListPrice && o.ListPrice > o.Price ? Math.round((o.ListPrice / div) * 100) / 100 : null,
        porKg, imagem: it.images?.[0]?.imageUrl ?? null, link: `${loja.site}/${p.linkText}/p`,
      })
    }
  }
  return out
}

async function buscar(loja: typeof LOJAS[number], query: string): Promise<Oferta[]> {
  const chave = `${loja.id}?${query}`
  const c = cache.get(chave)
  if (c && Date.now() - c.t < TTL) return c.v
  try {
    const r = await fetch(`${loja.api}/catalog_system/pub/products/search?${query}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (app pessoal Grazi e Jonas)', Accept: 'application/json' },
      signal: AbortSignal.timeout(9000),
    })
    if (!r.ok && r.status !== 206) return []
    const v = ler(loja, await r.json())
    cache.set(chave, { t: Date.now(), v })
    return v
  } catch {
    return []
  }
}

// confere se quem chama está logado no app (guarda o resultado por 10 min)
const logados = new Map<string, number>()
async function logado(auth: string) {
  if (!auth.startsWith('Bearer ')) return false
  const ate = logados.get(auth)
  if (ate && ate > Date.now()) return true
  const r = await fetch(`${Deno.env.get('SUPABASE_URL')}/auth/v1/user`, {
    headers: { Authorization: auth, apikey: Deno.env.get('SUPABASE_ANON_KEY') ?? '' },
  }).catch(() => null)
  if (!r?.ok) return false
  logados.set(auth, Date.now() + 10 * 60 * 1000)
  return true
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const resp = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
  if (!(await logado(req.headers.get('Authorization') ?? ''))) return resp({ erro: 'Entre no app primeiro' }, 401)
  let body: { termo?: string; eans?: string[] }
  try { body = await req.json() } catch { return resp({ erro: 'Pedido inválido' }, 400) }

  if (body.termo) {
    const termo = body.termo.trim().slice(0, 60)
    if (termo.length < 2) return resp({ ofertas: [] })
    const q = `ft=${encodeURIComponent(termo)}&_from=0&_to=11`
    const ofertas = (await Promise.all(LOJAS.map(l => buscar(l, q)))).flat()
    return resp({ ofertas })
  }

  if (Array.isArray(body.eans)) {
    const eans = [...new Set(body.eans.filter(e => /^\d{8,14}$/.test(e)))].slice(0, 60)
    if (!eans.length) return resp({ ofertas: [] })
    const lotes: string[][] = []
    for (let i = 0; i < eans.length; i += 20) lotes.push(eans.slice(i, i + 20))
    const ofertas = (await Promise.all(LOJAS.flatMap(l => lotes.map(lote =>
      buscar(l, `${lote.sort().map(e => `fq=alternateIds_Ean:${e}`).join('&')}&_from=0&_to=49`))))).flat()
    return resp({ ofertas: ofertas.filter(o => o.ean && eans.includes(o.ean)) })
  }

  return resp({ erro: 'Mande termo ou eans' }, 400)
})
