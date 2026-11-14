/** Extrait le texte d'un PDF, ligne par ligne (lecture sur l'appareil, rien n'est envoyé). */
export async function pdfToLines(file: File): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const lines: string[] = []
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n)
    const content = await page.getTextContent()
    // Regroupe les morceaux de texte par hauteur (même ligne), puis de gauche à droite
    const rows: { y: number; parts: { x: number; w: number; s: string }[] }[] = []
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue
      const x = it.transform[4]
      const y = it.transform[5]
      const row = rows.find((r) => Math.abs(r.y - y) <= 2.5)
      const part = { x, w: it.width, s: it.str }
      if (row) row.parts.push(part)
      else rows.push({ y, parts: [part] })
    }
    rows.sort((a, b) => b.y - a.y)
    for (const r of rows) {
      r.parts.sort((a, b) => a.x - b.x)
      let text = ''
      let end = -Infinity
      for (const p of r.parts) {
        text += (text && p.x - end > 1 ? ' ' : '') + p.s
        end = p.x + p.w
      }
      lines.push(text.replace(/\s+/g, ' ').trim())
    }
  }
  return lines
}
