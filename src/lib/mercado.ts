import { norm } from './format'
import { supabase } from './supabase'
import type { Market } from './types'

type Loja = { markets: Market[]; patch: (k: 'markets', fn: (m: Market[]) => Market[]) => void }

/** Acha o mercado pelo CNPJ (da nota) ou cadastra, com nome e endereço da BrasilAPI */
export async function mercadoDoCnpj(s: Loja, cnpj: string, nomeDaNota?: string | null): Promise<Market | null> {
  const ja = s.markets.find(m => m.cnpj === cnpj)
  if (ja) return ja
  let nome = nomeDaNota?.trim() || `Mercado ${cnpj.slice(0, 8)}`
  let endereco: string | null = null
  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
    if (r.ok) {
      const j = await r.json()
      const bruto = String(j.nome_fantasia || j.razao_social || nome).replace(/\b(LTDA|S\.?A\.?|EIRELI|ME|EPP)\b\.?/gi, '').trim()
      nome = bruto.toLowerCase().replace(/(^|\s)\S/g, (x: string) => x.toUpperCase())
      endereco = [j.logradouro, j.numero, j.bairro, j.municipio].filter(Boolean).join(', ')
    }
  } catch { /* sem internet: fica com o nome da nota */ }
  const igual = s.markets.find(m => norm(m.name) === norm(nome))
  if (igual) {
    await supabase.from('markets').update({ cnpj, address: endereco ?? igual.address }).eq('id', igual.id)
    return { ...igual, cnpj }
  }
  const { data, error } = await supabase.from('markets').insert({ name: nome, cnpj, address: endereco }).select().single()
  if (error || !data) return null
  s.patch('markets', m => [...m, data as Market])
  return data as Market
}
