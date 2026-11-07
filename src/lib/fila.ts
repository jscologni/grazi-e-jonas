// Fila de mudanças da lista feitas sem internet (no mercado o sinal costuma ser fraco).
// Cada mudança é guardada no celular e enviada, em ordem, quando a conexão volta.
import { supabase } from './supabase'

export type Op =
  | { tipo: 'insert'; tabela: 'shopping_items'; linhas: Record<string, unknown>[] }
  | { tipo: 'update'; tabela: 'shopping_items'; id: string; valores: Record<string, unknown> }
  | { tipo: 'delete'; tabela: 'shopping_items'; ids: string[] }

const CHAVE = 'fila-offline'
const ler = (): Op[] => { try { return JSON.parse(localStorage.getItem(CHAVE) ?? '[]') } catch { return [] } }
const gravar = (f: Op[]) => {
  try { localStorage.setItem(CHAVE, JSON.stringify(f)) } catch { /* sem espaço */ }
  window.dispatchEvent(new CustomEvent('fila-mudou', { detail: f.length }))
}
export const tamanhoFila = () => ler().length

/** erro de rede ou de login vencido: vale tentar de novo depois */
const temporario = (msg: string) => /Failed to fetch|NetworkError|Load failed|network|JWT|expired|timeout/i.test(msg)

async function executar(op: Op) {
  const t = supabase.from(op.tabela)
  if (op.tipo === 'insert') return t.upsert(op.linhas, { onConflict: 'id', ignoreDuplicates: true })
  if (op.tipo === 'update') return t.update(op.valores).eq('id', op.id)
  return t.delete().in('id', op.ids)
}

/** Grava já, ou põe na fila se estiver sem internet. Devolve erro só se for erro de verdade. */
export async function gravarOuGuardar(op: Op): Promise<{ erro: string | null; naFila: boolean }> {
  if (!navigator.onLine || tamanhoFila() > 0) {
    gravar([...ler(), op])
    if (navigator.onLine) void enviarFila()
    return { erro: null, naFila: true }
  }
  try {
    const { error } = await executar(op)
    if (!error) return { erro: null, naFila: false }
    if (temporario(error.message)) { gravar([...ler(), op]); return { erro: null, naFila: true } }
    return { erro: error.message, naFila: false }
  } catch (e) {
    gravar([...ler(), op])
    void e
    return { erro: null, naFila: true }
  }
}

let enviando: Promise<number> | null = null
/** Envia a fila em ordem. Para no primeiro erro de rede; descarta o que o banco recusar de vez. */
export function enviarFila(): Promise<number> {
  if (enviando) return enviando
  enviando = (async () => {
    let enviados = 0
    while (navigator.onLine) {
      const fila = ler()
      if (!fila.length) break
      try {
        const { error } = await executar(fila[0])
        if (error && temporario(error.message)) break
      } catch { break }
      gravar(ler().slice(1))
      enviados++
    }
    return enviados
  })().finally(() => { enviando = null })
  return enviando
}
