import QrScanner from 'qr-scanner'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Chave de acesso de 44 dígitos dentro do QR da NFC-e → CNPJ do mercado (posições 7 a 20) */
export function chaveDoQR(texto: string) {
  const p = texto.match(/[?&]p=(\d{44})/)?.[1] ?? texto.match(/\b(\d{44})\b/)?.[1]
  if (!p) return null
  return { chave: p, cnpj: p.slice(6, 20), uf: p.slice(0, 2) }
}

// recursos de câmera que o TypeScript ainda não conhece (Chrome no Android; o Safari ignora)
type Recursos = MediaTrackCapabilities & { focusMode?: string[]; zoom?: { min: number; max: number; step: number } }
type Ajuste = MediaTrackConstraintSet & { focusMode?: string; zoom?: number; pointsOfInterest?: { x: number; y: number }[] }

export function LerQR({ onClose, onNota }: { onClose: () => void; onNota: (cnpj: string, chave: string, conteudo?: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [erro, setErro] = useState('')
  const [zoom, setZoom] = useState<{ min: number; max: number; step: number; valor: number } | null>(null)
  const [lentes, setLentes] = useState<{ id: string; label: string }[]>([])
  const [lente, setLente] = useState(0)
  const leitor = useRef<QrScanner | null>(null)
  const cb = useRef(onNota)
  useEffect(() => { cb.current = onNota })

  const trilha = () => (video.current?.srcObject as MediaStream | null)?.getVideoTracks()[0]
  const ajustar = (a: Ajuste) => trilha()?.applyConstraints({ advanced: [a] }).catch(() => {})
  const recursos = () => (trilha()?.getCapabilities?.() ?? {}) as Recursos
  // foco automático contínuo e um pouco de zoom: o cupom fica nítido sem encostar o celular nele
  const preparar = async () => {
    const r = recursos()
    if (r.focusMode?.includes('continuous')) await ajustar({ focusMode: 'continuous' })
    if (r.zoom && r.zoom.max > r.zoom.min) {
      const valor = Math.min(r.zoom.max, Math.max(r.zoom.min, 2))
      await ajustar({ zoom: valor })
      setZoom({ ...r.zoom, valor })
    } else setZoom(null)
  }
  const focarAqui = (e: React.MouseEvent<HTMLVideoElement>) => {
    const r = recursos()
    if (!r.focusMode?.length) return
    const box = e.currentTarget.getBoundingClientRect()
    const ponto = { x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height }
    ajustar({ pointsOfInterest: [ponto], focusMode: r.focusMode.includes('single-shot') ? 'single-shot' : 'continuous' })
    if (r.focusMode.includes('continuous')) setTimeout(() => ajustar({ focusMode: 'continuous' }), 1500)
  }
  const trocarLente = async () => {
    const i = (lente + 1) % lentes.length
    setLente(i)
    await leitor.current?.setCamera(lentes[i].id).catch(() => {})
    await preparar()
  }

  useEffect(() => {
    if (!video.current) return
    let feito = false
    const scanner = new QrScanner(video.current, r => {
      if (feito) return
      const n = chaveDoQR(r.data)
      if (n) { feito = true; scanner.stop(); cb.current(n.cnpj, n.chave, r.data) }
      else setErro('Esse QR não é de nota fiscal. Procure o QR no rodapé do cupom.')
    }, { returnDetailedScanResult: true, preferredCamera: 'environment', highlightScanRegion: true, maxScansPerSecond: 8 })
    leitor.current = scanner
    scanner.start().then(async () => {
      await preparar()
      // celulares com várias lentes: algumas (ultra-angular) não focam de perto, então dá para trocar
      const traseiras = (await QrScanner.listCameras(true)).filter(c => /tras|back|rear|environment/i.test(c.label))
      setLentes(traseiras)
      setLente(Math.max(0, traseiras.findIndex(c => c.id === trilha()?.getSettings().deviceId)))
    }).catch(() => setErro('Não deu para abrir a câmera. Permita o acesso à câmera nas configurações do navegador.'))
    return () => { scanner.stop(); scanner.destroy(); leitor.current = null }
  }, [])

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: '#140A17', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 'calc(env(safe-area-inset-top) + 16px) 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <b className="subtitulo">Aponte para o QR do cupom</b>
        <button className="fechar" onClick={onClose} aria-label="Fechar câmera" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }}>✕</button>
      </div>
      <video ref={video} onClick={focarAqui} style={{ flex: 1, width: '100%', minHeight: 0, objectFit: 'cover' }} muted playsInline />
      <div style={{ padding: '14px 18px calc(env(safe-area-inset-bottom) + 18px)', display: 'grid', gap: 12 }}>
        {zoom && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 700 }}>Zoom
            <input type="range" min={zoom.min} max={zoom.max} step={zoom.step || 0.1} value={zoom.valor} style={{ flex: 1, accentColor: 'var(--banana)', minHeight: 44 }}
              onChange={e => { const valor = +e.target.value; setZoom({ ...zoom, valor }); ajustar({ zoom: valor }) }} />
            <span style={{ minWidth: 40, textAlign: 'right' }}>{zoom.valor.toFixed(1)}×</span>
          </label>
        )}
        {lentes.length > 1 && (
          <button className="btn cheio" onClick={trocarLente} style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }}>
            Trocar lente · {lentes[lente]?.label || `${lente + 1} de ${lentes.length}`}
          </button>
        )}
        <p style={{ margin: 0, fontWeight: 600 }}>
          {erro || 'Borrado? Afaste o celular uns 20 cm e toque na imagem para focar.'}
        </p>
      </div>
    </div>,
    document.body,
  )
}
