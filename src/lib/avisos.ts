// Liga e desliga os avisos de vencimento neste celular (Web Push).
import { supabase } from './supabase'

export type Estado = 'sem-suporte' | 'instalar-iphone' | 'bloqueado' | 'desligado' | 'ligado'

const iphone = () => /iPhone|iPad|iPod/i.test(navigator.userAgent)
const instalado = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

const paraBytes = (b64: string) => {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(s), c => c.charCodeAt(0))
}

async function registro() {
  if (!('serviceWorker' in navigator)) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

export async function estadoAvisos(): Promise<Estado> {
  if (iphone() && !instalado()) return 'instalar-iphone'
  if (!('Notification' in window) || !('PushManager' in window) || !('serviceWorker' in navigator)) return 'sem-suporte'
  if (Notification.permission === 'denied') return 'bloqueado'
  const reg = await registro()
  const sub = await reg?.pushManager.getSubscription()
  return sub && Notification.permission === 'granted' ? 'ligado' : 'desligado'
}

export async function ligarAvisos() {
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Sem permissão para avisos. Libere as notificações do app nas configurações do celular.')
  const reg = await registro()
  if (!reg) throw new Error('Abra o app instalado (ou pelo site publicado) para ligar os avisos.')
  const { data, error } = await supabase.functions.invoke('avisos', { body: { modo: 'chave' } })
  if (error || !data?.publicKey) throw new Error('Não deu para ligar os avisos agora. Tente de novo em instantes.')
  const sub = (await reg.pushManager.getSubscription()) ??
    await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: paraBytes(data.publicKey) })
  const j = sub.toJSON()
  const { error: e2 } = await supabase.from('push_subs').upsert(
    { endpoint: sub.endpoint, p256dh: j.keys?.p256dh, auth: j.keys?.auth }, { onConflict: 'endpoint' })
  if (e2) throw e2
}

export async function desligarAvisos() {
  const reg = await registro()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    await supabase.from('push_subs').delete().eq('endpoint', sub.endpoint)
    await sub.unsubscribe()
  }
}

export async function avisoTeste() {
  const { data, error } = await supabase.functions.invoke('avisos', { body: { modo: 'teste' } })
  if (error) throw new Error('Não deu para mandar o teste agora.')
  return (data?.enviados ?? 0) as number
}
