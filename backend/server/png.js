// Minimal, dependency-free PNG decoder.
//
// We only need to support what the browser itself produces: the receipt is
// captured with html-to-image (canvas.toDataURL('image/png')), which always
// emits a non-interlaced, 8-bit-per-channel PNG. That keeps this decoder
// small - no need to pull in a native image library just to read pixels back
// out of an image we generated ourselves a few hundred milliseconds earlier.
import zlib from "node:zlib";

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Decodes a PNG Buffer into { width, height, rgba } where rgba is a Buffer
 * of width*height*4 bytes (R,G,B,A per pixel, straight, not premultiplied).
 */
export function decodePng(buffer) {
  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error("Not a valid PNG (bad signature)");
  }

  let pos = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette = null;
  let trns = null;
  const idatChunks = [];

  while (pos + 8 <= buffer.length) {
    const len = buffer.readUInt32BE(pos);
    const type = buffer.toString("ascii", pos + 4, pos + 8);
    const dataStart = pos + 8;
    const data = buffer.subarray(dataStart, dataStart + len);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "PLTE") {
      palette = data;
    } else if (type === "tRNS") {
      trns = data;
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }

    pos = dataStart + len + 4; // skip CRC
  }

  if (!width || !height) throw new Error("Missing IHDR in PNG");
  if (interlace !== 0) throw new Error("Interlaced PNGs are not supported");
  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${bitDepth}`);

  let channels;
  if (colorType === 6) channels = 4;
  else if (colorType === 2) channels = 3;
  else if (colorType === 0) channels = 1;
  else if (colorType === 4) channels = 2;
  else if (colorType === 3) channels = 1;
  else throw new Error(`Unsupported PNG color type: ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const stride = width * channels;
  const unfiltered = Buffer.alloc(height * stride);

  let rawPos = 0;
  let prevRowStart = -1;
  for (let y = 0; y < height; y++) {
    const filterType = raw[rawPos];
    rawPos += 1;
    const rowStart = y * stride;

    for (let x = 0; x < stride; x++) {
      const rawByte = raw[rawPos + x];
      const a = x >= channels ? unfiltered[rowStart + x - channels] : 0;
      const b = prevRowStart >= 0 ? unfiltered[prevRowStart + x] : 0;
      const c = prevRowStart >= 0 && x >= channels ? unfiltered[prevRowStart + x - channels] : 0;

      let value;
      switch (filterType) {
        case 0: value = rawByte; break;
        case 1: value = rawByte + a; break;
        case 2: value = rawByte + b; break;
        case 3: value = rawByte + ((a + b) >> 1); break;
        case 4: value = rawByte + paeth(a, b, c); break;
        default: throw new Error(`Unsupported PNG filter type: ${filterType}`);
      }
      unfiltered[rowStart + x] = value & 0xff;
    }
    rawPos += stride;
    prevRowStart = rowStart;
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0, p = 0; i < width * height; i++, p += channels) {
    let r, g, b, a = 255;
    if (colorType === 6) {
      r = unfiltered[p]; g = unfiltered[p + 1]; b = unfiltered[p + 2]; a = unfiltered[p + 3];
    } else if (colorType === 2) {
      r = unfiltered[p]; g = unfiltered[p + 1]; b = unfiltered[p + 2];
    } else if (colorType === 0) {
      r = g = b = unfiltered[p];
    } else if (colorType === 4) {
      r = g = b = unfiltered[p]; a = unfiltered[p + 1];
    } else if (colorType === 3) {
      if (!palette) throw new Error("Palette PNG missing PLTE chunk");
      const idx = unfiltered[p];
      r = palette[idx * 3]; g = palette[idx * 3 + 1]; b = palette[idx * 3 + 2];
      a = trns && trns[idx] !== undefined ? trns[idx] : 255;
    }
    const o = i * 4;
    rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = a;
  }

  return { width, height, rgba };
}
