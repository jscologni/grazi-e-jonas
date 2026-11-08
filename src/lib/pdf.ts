// Tira o texto de um PDF de extrato, linha por linha. Carregado só quando alguém escolhe um PDF.
import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

interface Pedaco { x: number; y: number; w: number; s: string }

export async function textoDoPdf(arquivo: File): Promise<string> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await arquivo.arrayBuffer()) }).promise
  const saida: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n)
    const conteudo = await pagina.getTextContent()
    const pedacos: Pedaco[] = []
    for (const it of conteudo.items) {
      if ('str' in it && it.str.trim()) pedacos.push({ x: it.transform[4], y: it.transform[5], w: it.width, s: it.str })
    }
    pedacos.sort((a, b) => b.y - a.y || a.x - b.x)
    // junta o que está na mesma altura numa linha só
    const linhas: Pedaco[][] = []
    for (const p of pedacos) {
      const ult = linhas[linhas.length - 1]
      if (ult && Math.abs(ult[0].y - p.y) <= 3) ult.push(p)
      else linhas.push([p])
    }
    for (const l of linhas) {
      l.sort((a, b) => a.x - b.x)
      let texto = ''
      l.forEach((p, i) => {
        const ant = l[i - 1]
        texto += (ant && p.x - (ant.x + ant.w) > 1 ? ' ' : '') + p.s
      })
      saida.push(texto)
    }
  }
  return saida.join('\n')
}
