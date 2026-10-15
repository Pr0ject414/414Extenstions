import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

// Minimal pure Node.js PNG encoder
function crc32(buf) {
  let table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c >>> 0;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(width, height, rgbaBuffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const ihdrChunk = createChunk('IHDR', ihdr);

  // IDAT: Scanlines with filter byte 0 (None)
  const scanlines = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    const scanlineOffset = y * (1 + width * 4);
    scanlines[scanlineOffset] = 0; // No filter
    const rowData = rgbaBuffer.subarray(y * width * 4, (y + 1) * width * 4);
    rowData.copy(scanlines, scanlineOffset + 1);
  }
  const compressed = zlib.deflateSync(scanlines, { level: 9 });
  const idatChunk = createChunk('IDAT', compressed);

  // IEND
  const iendChunk = createChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

// Generate modern "414" gradient icon
function render414Icon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const radius = size * 0.46;
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Gradient from vibrant indigo (#6366f1) to violet (#8b5cf6) to cyan (#06b6d4)
        const t = (x + y) / (2 * size);
        const r = Math.round(99 * (1 - t) + 6 * t);
        const g = Math.round(102 * (1 - t) + 182 * t);
        const b = Math.round(241 * (1 - t) + 212 * t);
        
        // Inner border highlight
        const borderFactor = Math.max(0, 1 - Math.abs(dist - radius) / 2);
        const finalR = Math.min(255, Math.round(r + borderFactor * 50));
        const finalG = Math.min(255, Math.round(g + borderFactor * 50));
        const finalB = Math.min(255, Math.round(b + borderFactor * 50));

        // Anti-aliasing edge
        let alpha = 255;
        if (dist > radius - 1) {
          alpha = Math.round(255 * (radius - dist + 1));
        }

        buf[idx] = finalR;
        buf[idx + 1] = finalG;
        buf[idx + 2] = finalB;
        buf[idx + 3] = Math.min(255, Math.max(0, alpha));
      } else {
        buf[idx + 3] = 0; // transparent
      }
    }
  }

  // Draw simple stylized "414" pattern in center with white pixels
  const scale = size / 48;
  const drawPixel = (px, py, alpha = 255) => {
    if (px >= 0 && px < size && py >= 0 && py < size) {
      const pIdx = (Math.floor(py) * size + Math.floor(px)) * 4;
      buf[pIdx] = 255;
      buf[pIdx + 1] = 255;
      buf[pIdx + 2] = 255;
      buf[pIdx + 3] = Math.max(buf[pIdx + 3], alpha);
    }
  };

  const drawRect = (x0, y0, w, h) => {
    for (let yy = y0; yy < y0 + h; yy++) {
      for (let xx = x0; xx < x0 + w; xx++) {
        drawPixel(xx, yy, 255);
      }
    }
  };

  // Draw stylized "4 1 4"
  // digit 1 (left "4"):
  const thick = Math.max(1, Math.round(2.5 * scale));
  const midY = cy;
  const l4x = cx - 12 * scale;
  drawRect(l4x, cy - 8 * scale, thick, 16 * scale);
  drawRect(l4x - 6 * scale, cy - 8 * scale, thick, 10 * scale);
  drawRect(l4x - 6 * scale, cy + 2 * scale, 8 * scale, thick);

  // digit 2 (center "1"):
  const c1x = cx - thick / 2;
  drawRect(c1x, cy - 8 * scale, thick, 16 * scale);
  drawRect(c1x - 3 * scale, cy - 8 * scale, 3 * scale, thick);
  drawRect(c1x - 3 * scale, cy + 8 * scale - thick, 8 * scale, thick);

  // digit 3 (right "4"):
  const r4x = cx + 12 * scale;
  drawRect(r4x, cy - 8 * scale, thick, 16 * scale);
  drawRect(r4x - 6 * scale, cy - 8 * scale, thick, 10 * scale);
  drawRect(r4x - 6 * scale, cy + 2 * scale, 8 * scale, thick);

  return encodePNG(size, size, buf);
}

const iconsDir = path.resolve('d:/Dev/414Extenstions/414Extensions/icons');
if (!fs.existsSync(iconsDir)) fs.mkdirSync(iconsDir, { recursive: true });

for (const s of [16, 32, 48, 128]) {
  const pngBuf = render414Icon(s);
  const outPath = path.join(iconsDir, `icon${s}.png`);
  fs.writeFileSync(outPath, pngBuf);
  console.log(`Generated: ${outPath} (${pngBuf.length} bytes)`);
}

console.log('Icons generated successfully!');
