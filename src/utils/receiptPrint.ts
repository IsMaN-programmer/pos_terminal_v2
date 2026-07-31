import { toPng } from 'html-to-image'

export type PaperSize = '58' | '80'

// Typical printable width of thermal receipt paper (paper is a bit wider than
// what actually gets printed on, because of the printer's side margins).
// These numbers match the 32/48 character-per-line convention already used
// elsewhere in the app (~1.5mm per monospace character at 58/80mm).
const PRINTABLE_WIDTH_MM: Record<PaperSize, number> = { '58': 48, '80': 72 }

// Render at a high pixel density so bold text, the logo and the QR code all
// come out crisp on a real printer instead of blurry/thin.
const CAPTURE_PIXEL_RATIO = 4

function waitForImages(node: HTMLElement): Promise<void> {
  const imgs = Array.from(node.querySelectorAll('img'))
  return Promise.all(
    imgs.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve()
      return new Promise<void>(resolve => {
        img.addEventListener('load', () => resolve(), { once: true })
        img.addEventListener('error', () => resolve(), { once: true })
      })
    }),
  ).then(() => undefined)
}

function pngDataUrlSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('Не удалось прочитать сгенерированное изображение чека'))
    img.src = dataUrl
  })
}

/**
 * Captures the receipt DOM node exactly as it looks on screen (real bold
 * fonts, logo, QR code) as a PNG, ignoring the on-screen scroll clipping so
 * the *whole* receipt is captured even if it doesn't fully fit in the modal
 * preview area.
 */
export async function captureReceiptPng(node: HTMLElement): Promise<{ dataUrl: string; widthPx: number; heightPx: number }> {
  await waitForImages(node)

  const scrollW = node.scrollWidth
  const scrollH = node.scrollHeight

  const dataUrl = await toPng(node, {
    pixelRatio: CAPTURE_PIXEL_RATIO,
    width: scrollW,
    height: scrollH,
    backgroundColor: '#ffffff',
    cacheBust: true,
    style: {
      overflow: 'visible',
      maxHeight: 'none',
      height: `${scrollH}px`,
      flex: 'none',
      margin: '0',
      position: 'static',
      top: '0',
      left: '0',
      zIndex: 'auto',
      visibility: 'visible',
    },
  })

  const dims = await pngDataUrlSize(dataUrl)
  return { dataUrl, widthPx: dims.width, heightPx: dims.height }
}

/**
 * Captures the given receipt node and sends it to the backend as an image so
 * the printer reproduces exactly what's shown in the preview - correct width
 * for 58/80mm paper, real bold fonts, logo and QR code included.
 */
export async function printReceiptNode(printerName: string, node: HTMLElement, paperSize: PaperSize): Promise<void> {
  const { dataUrl, widthPx, heightPx } = await captureReceiptPng(node)

  const res = await fetch('/api/print-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      printerName,
      image: dataUrl,
      paperWidthMm: PRINTABLE_WIDTH_MM[paperSize],
      widthPx,
      heightPx,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Print failed' }))
    throw new Error(err.error || 'Print failed')
  }
}
