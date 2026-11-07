import QrScanner from 'qr-scanner'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Chave de acesso de 44 dígitos dentro do QR da NFC-e → CNPJ do mercado (posições 7 a 20) */
export function chaveDoQR(texto: string) {
  const p = texto.match(/[?&]p=(\d{44})/)?.[1] ?? texto.match(/\b(\d{44})\b/)?.[1]
  if (!p) return null
  return { chave: p, cnpj: p.slice(6, 20), uf: p.slice(0, 2) }
}

export function LerQR({ onClose, onNota }: { onClose: () => void; onNota: (cnpj: string, chave: string, conteudo?: string) => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const [erro, setErro] = useState('')
  const cb = useRef(onNota)
  useEffect(() => { cb.current = onNota })
  useEffect(() => {
    if (!video.current) return
    let feito = false
    const scanner = new QrScanner(video.current, r => {
      if (feito) return
      const n = chaveDoQR(r.data)
      if (n) { feito = true; scanner.stop(); cb.current(n.cnpj, n.chave, r.data) }
      else setErro('Esse QR não é de nota fiscal. Procure o QR no rodapé do cupom.')
    }, { returnDetailedScanResult: true, preferredCamera: 'environment', highlightScanRegion: true, maxScansPerSecond: 8 })
    scanner.start().catch(() => setErro('Não deu para abrir a câmera. Permita o acesso à câmera nas configurações do navegador.'))
    return () => { scanner.stop(); scanner.destroy() }
  }, [])

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: '#140A17', color: '#fff', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: 'calc(env(safe-area-inset-top) + 16px) 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <b className="subtitulo">Aponte para o QR do cupom</b>
        <button className="fechar" onClick={onClose} aria-label="Fechar câmera" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }}>✕</button>
      </div>
      <video ref={video} style={{ flex: 1, width: '100%', objectFit: 'cover' }} muted playsInline />
      <p style={{ padding: '14px 18px calc(env(safe-area-inset-bottom) + 18px)', margin: 0, fontWeight: 600, minHeight: 70 }}>
        {erro || 'O app reconhece o mercado pelo CNPJ que vem no código.'}
      </p>
    </div>,
    document.body,
  )
}
