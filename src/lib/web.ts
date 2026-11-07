// Preços dos sites dos mercados (Angeloni, Bistek, Giassi, Atacadão) via função "precos" no Supabase.
import { supabase } from './supabase'

export interface Oferta {
  loja: string; mercado: string; nome: string; marca: string | null; ean: string | null
  preco: number; de: number | null; porKg: boolean; imagem: string | null; link: string
}

const VALIDADE = 3 * 3600 * 1000 // guarda no celular por 3 horas
const ler = (k: string) => {
  try {
    const v = JSON.parse(localStorage.getItem(k) ?? 'null')
    return v && Date.now() - v.t < VALIDADE ? (v.ofertas as Oferta[]) : null
  } catch { return null }
}
const gravar = (k: string, ofertas: Oferta[]) => {
  try { localStorage.setItem(k, JSON.stringify({ t: Date.now(), ofertas })) } catch { /* sem espaço: tudo bem */ }
}

type Pedido = { termo: string } | { eans: string[] }
// na página de demonstração os preços vêm de exemplo, sem chamar a função
declare global { interface Window { __precosFalsos?: (p: Pedido) => Oferta[] } }

async function chamar(pedido: Pedido): Promise<Oferta[]> {
  if (window.__precosFalsos) return window.__precosFalsos(pedido)
  const { data, error } = await supabase.functions.invoke('precos', { body: pedido })
  if (error) throw new Error('Não deu para buscar os preços dos sites agora.')
  return (data?.ofertas ?? []) as Oferta[]
}

export async function buscarNosSites(termo: string) {
  const k = `sites:termo:${termo.toLowerCase().trim()}`
  const c = ler(k)
  if (c) return c
  const ofertas = await chamar({ termo })
  gravar(k, ofertas)
  return ofertas
}

export async function precosPorCodigo(eans: string[]) {
  const lista = [...new Set(eans)].sort()
  if (!lista.length) return []
  const k = `sites:eans:${lista.join(',')}`
  const c = ler(k)
  if (c) return c
  const ofertas = await chamar({ eans: lista })
  gravar(k, ofertas)
  return ofertas
}

/** Agrupa ofertas do mesmo produto (código de barras) entre os mercados, mais barato primeiro */
export function agruparPorProduto(ofertas: Oferta[]) {
  const grupos = new Map<string, { ean: string; nome: string; imagem: string | null; porKg: boolean; ofertas: Oferta[] }>()
  for (const o of ofertas) {
    if (!o.ean) continue
    const g = grupos.get(o.ean) ?? { ean: o.ean, nome: o.nome, imagem: o.imagem, porKg: o.porKg, ofertas: [] }
    if (!g.ofertas.some(x => x.loja === o.loja)) g.ofertas.push(o)
    if (!g.imagem && o.imagem) g.imagem = o.imagem
    grupos.set(o.ean, g)
  }
  return [...grupos.values()]
    .map(g => ({ ...g, ofertas: g.ofertas.sort((a, b) => a.preco - b.preco) }))
    .sort((a, b) => b.ofertas.length - a.ofertas.length || a.ofertas[0].preco - b.ofertas[0].preco)
}
