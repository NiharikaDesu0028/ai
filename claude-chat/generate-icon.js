/**
 * generate-icon.js
 * Generates a simple assets/icon.png using Node canvas-free approach.
 * Creates a 256x256 ICO-compatible PNG via raw pixel buffer written as BMP-in-ICO.
 * Run once: node generate-icon.js
 */
const fs   = require('fs');
const path = require('path');

// We'll create a minimal valid ICO file with a solid orange circle
// ICO format: ICONDIR + ICONDIRENTRY + BMP data
function createIco() {
  const SIZE   = 32;
  const pixels = Buffer.alloc(SIZE * SIZE * 4); // BGRA

  const cx = SIZE / 2, cy = SIZE / 2;

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const dx   = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx  = (y * SIZE + x) * 4;

      if (dist <= SIZE / 2 - 1) {
        // Orange background: RGB(217,119,87)
        pixels[idx]     = 87;   // B
        pixels[idx + 1] = 119;  // G
        pixels[idx + 2] = 217;  // R
        pixels[idx + 3] = 255;  // A
      }
      // else transparent
    }
  }

  // Draw asterisk lines (8 spokes)
  const draw = (x, y) => {
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) {
      const idx = (y * SIZE + x) * 4;
      pixels[idx] = 255; pixels[idx+1] = 255; pixels[idx+2] = 255; pixels[idx+3] = 255;
    }
  };
  const angles = [0, 45, 90, 135];
  for (const angle of angles) {
    const rad = angle * Math.PI / 180;
    for (let r = 2; r <= 10; r++) {
      draw(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)));
      draw(Math.round(cx - r * Math.cos(rad)), Math.round(cy - r * Math.sin(rad)));
    }
  }

  // Build ICO: ICONDIR (6) + ICONDIRENTRY (16) + BITMAPINFOHEADER (40) + pixels
  const bmpHeaderSize = 40;
  const xorSize       = SIZE * SIZE * 4;
  const andSize       = SIZE * SIZE / 8;  // 1-bit AND mask
  const imageSize     = bmpHeaderSize + xorSize + andSize;

  const ico = Buffer.alloc(6 + 16 + imageSize);
  let off = 0;

  // ICONDIR
  ico.writeUInt16LE(0,      off); off += 2; // reserved
  ico.writeUInt16LE(1,      off); off += 2; // type=1 (ICO)
  ico.writeUInt16LE(1,      off); off += 2; // count=1

  // ICONDIRENTRY
  ico.writeUInt8(SIZE,      off); off += 1; // width
  ico.writeUInt8(SIZE,      off); off += 1; // height
  ico.writeUInt8(0,         off); off += 1; // colorCount=0 (>256 colors)
  ico.writeUInt8(0,         off); off += 1; // reserved
  ico.writeUInt16LE(1,      off); off += 2; // planes
  ico.writeUInt16LE(32,     off); off += 2; // bitCount=32
  ico.writeUInt32LE(imageSize, off); off += 4;
  ico.writeUInt32LE(22,     off); off += 4; // offset to image data (6+16=22)

  // BITMAPINFOHEADER
  ico.writeUInt32LE(bmpHeaderSize, off); off += 4;
  ico.writeInt32LE(SIZE,           off); off += 4;  // width
  ico.writeInt32LE(SIZE * 2,       off); off += 4;  // height*2 (XOR+AND)
  ico.writeUInt16LE(1,             off); off += 2;  // planes
  ico.writeUInt16LE(32,            off); off += 2;  // bitCount
  ico.writeUInt32LE(0,             off); off += 4;  // compression=BI_RGB
  ico.writeUInt32LE(xorSize,       off); off += 4;
  ico.writeInt32LE(0,              off); off += 4;  // X ppm
  ico.writeInt32LE(0,              off); off += 4;  // Y ppm
  ico.writeUInt32LE(0,             off); off += 4;
  ico.writeUInt32LE(0,             off); off += 4;

  // XOR mask (pixel data, bottom-up in ICO BMP)
  for (let y = SIZE - 1; y >= 0; y--) {
    for (let x = 0; x < SIZE; x++) {
      const src = (y * SIZE + x) * 4;
      ico[off++] = pixels[src];       // B
      ico[off++] = pixels[src + 1];   // G
      ico[off++] = pixels[src + 2];   // R
      ico[off++] = pixels[src + 3];   // A
    }
  }

  // AND mask (all zeros = fully opaque)
  for (let i = 0; i < andSize; i++) ico[off++] = 0;

  fs.writeFileSync(path.join(__dirname, 'assets', 'icon.ico'), ico);
  console.log('✓ assets/icon.ico created');
}

createIco();
