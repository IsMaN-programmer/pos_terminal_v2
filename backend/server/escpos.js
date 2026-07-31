// Builds raw ESC/POS bytes that we write directly to the printer (see
// sendRawBytesToPrinter in index.js), instead of going through
// System.Drawing.Printing / the Windows GDI print driver.
//
// Why: GDI printing asks the *driver* to rasterize a page of a given size.
// Many thermal-receipt "Generic / Text Only" style drivers don't honor an
// arbitrary custom PaperSize - they silently substitute their own default
// page width, which is what produced the "blank in the middle, stuff only
// at the edges" prints (our narrow receipt image gets stretched/misaligned
// onto whatever page size the driver actually decided to use). The same
// GDI path is also responsible for the garbled Cyrillic ("hieroglyphs"):
// text sent through a raw/generic driver gets re-encoded into the printer's
// own OEM code page, and that conversion mangles Cyrillic unless it happens
// to match exactly.
//
// Sending raw ESC/POS bytes sidesteps both problems: we decide the exact
// dot width ourselves (matching the physical printer), and the receipt
// content is a bitmap (rendered from real HTML/CSS, so Cyrillic, the logo
// and the QR code all look exactly like the on-screen preview) - no text
// re-encoding involved at all for the image path.

const ESC = 0x1b;
const GS = 0x1d;

// Standard thermal printer dot widths at 203 dpi.
export const DOTS_58MM = 384;
export const DOTS_80MM = 576;

export function dotsWidthForPaper(paperWidthMm) {
  return Number(paperWidthMm) > 60 ? DOTS_80MM : DOTS_58MM;
}

/**
 * Downscales RGBA pixel data to `dstWidth` using a box filter (averages every
 * source pixel that falls into each destination pixel), compositing over a
 * white background first. Box filtering holds up much better than
 * nearest-neighbor when shrinking a 4x-oversampled capture down to printer
 * resolution - important for keeping small QR modules and logo detail legible
 * instead of aliasing them away.
 */
function resizeToGray(rgba, srcW, srcH, dstWidth) {
  const scale = dstWidth / srcW;
  const dstHeight = Math.max(1, Math.round(srcH * scale));
  const gray = new Float32Array(dstWidth * dstHeight);

  for (let dy = 0; dy < dstHeight; dy++) {
    const sy0 = Math.floor(dy / scale);
    const sy1 = Math.min(srcH, Math.max(sy0 + 1, Math.floor((dy + 1) / scale)));
    for (let dx = 0; dx < dstWidth; dx++) {
      const sx0 = Math.floor(dx / scale);
      const sx1 = Math.min(srcW, Math.max(sx0 + 1, Math.floor((dx + 1) / scale)));

      let sum = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        const rowBase = sy * srcW;
        for (let sx = sx0; sx < sx1; sx++) {
          const p = (rowBase + sx) * 4;
          const a = rgba[p + 3] / 255;
          const r = rgba[p] * a + 255 * (1 - a);
          const g = rgba[p + 1] * a + 255 * (1 - a);
          const b = rgba[p + 2] * a + 255 * (1 - a);
          sum += 0.299 * r + 0.587 * g + 0.114 * b;
          count++;
        }
      }
      gray[dy * dstWidth + dx] = count ? sum / count : 255;
    }
  }

  return { gray, width: dstWidth, height: dstHeight };
}

/** Floyd-Steinberg dithering: much closer to the on-screen look than a flat threshold. */
function ditherToBitmap(gray, width, height) {
  const bitmap = new Uint8Array(width * height); // 1 = black dot
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = gray[i];
      const isBlack = old < 128;
      bitmap[i] = isBlack ? 1 : 0;
      const err = old - (isBlack ? 0 : 255);
      if (x + 1 < width) gray[i + 1] += (err * 7) / 16;
      if (y + 1 < height) {
        if (x > 0) gray[i + width - 1] += (err * 3) / 16;
        gray[i + width] += (err * 5) / 16;
        if (x + 1 < width) gray[i + width + 1] += (err * 1) / 16;
      }
    }
  }
  return bitmap;
}

function packRaster(bitmap, width, height) {
  const bytesPerRow = Math.ceil(width / 8);
  const data = Buffer.alloc(bytesPerRow * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (bitmap[y * width + x]) {
        data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }
  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = height & 0xff;
  const yH = (height >> 8) & 0xff;
  // GS v 0: print raster bit image, normal size.
  const header = Buffer.from([GS, 0x76, 0x30, 0x00, xL, xH, yL, yH]);
  return Buffer.concat([header, data]);
}

/**
 * Builds a full print job: init printer, the receipt as a raster image at
 * the printer's real dot width, a feed, and a cut.
 */
export function buildReceiptEscposJob({ rgba, width, height, dotsWidth }) {
  const { gray, width: w, height: h } = resizeToGray(rgba, width, height, dotsWidth);
  const bitmap = ditherToBitmap(gray, w, h);
  const raster = packRaster(bitmap, w, h);

  const init = Buffer.from([ESC, 0x40]); // ESC @ - initialize printer
  const feed = Buffer.from([ESC, 0x64, 0x03]); // ESC d 3 - feed 3 lines
  const cut = Buffer.from([GS, 0x56, 0x42, 0x00]); // GS V 66 0 - partial cut, widely supported

  return Buffer.concat([init, raster, feed, cut]);
}

// --- CP866 (DOS Cyrillic) plain-text fallback -------------------------------
//
// Used only if raster/image printing fails outright (see /api/print in
// index.js). Sends real ESC/POS bytes with an explicit code page selection
// instead of handing Unicode text to a GDI driver to mistranslate.
const CP866_MAP = (() => {
  const map = new Map();
  const addRange = (startChar, startByte, count) => {
    const base = startChar.codePointAt(0);
    for (let i = 0; i < count; i++) map.set(base + i, startByte + i);
  };
  addRange("А", 0x80, 16); // А-П
  addRange("Р", 0x90, 16); // Р-Я
  addRange("а", 0xa0, 16); // а-п
  addRange("р", 0xe0, 16); // р-я
  map.set("Ё".codePointAt(0), 0xf0);
  map.set("ё".codePointAt(0), 0xf1);
  map.set("№".codePointAt(0), 0xfc);
  return map;
})();

export function encodeCp866(text) {
  const bytes = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp < 128) { bytes.push(cp); continue; }
    bytes.push(CP866_MAP.has(cp) ? CP866_MAP.get(cp) : 0x3f); // '?' for anything unmapped
  }
  return Buffer.from(bytes);
}

/**
 * Builds a plain-text ESC/POS job using CP866. Note: the code-page index
 * that selects CP866 (ESC t n) is not standardized across ESC/POS clones -
 * 17 is the most common mapping (used by the Xprinter/Gainscha/Epson-clone
 * family), but if a specific printer uses a different table, adjust
 * CODEPAGE_INDEX below to match its manual.
 */
const CODEPAGE_INDEX = 17;

export function buildTextEscposJob(text) {
  const init = Buffer.from([ESC, 0x40]);
  const selectCodepage = Buffer.from([ESC, 0x74, CODEPAGE_INDEX]);
  const body = encodeCp866(text.replace(/\r\n/g, "\n"));
  const feed = Buffer.from([ESC, 0x64, 0x03]);
  const cut = Buffer.from([GS, 0x56, 0x42, 0x00]);
  return Buffer.concat([init, selectCodepage, body, feed, cut]);
}
