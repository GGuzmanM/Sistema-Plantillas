// Muestra escaneada en PDF (Epson Scan 2: una página A4 con una sola imagen). Saca la imagen y su resolución sin
// pasar por otro programa. La imagen viene en JPEG (DCTDecode, a color), en blanco y negro (CCITTFaxDecode G4) o
// comprimida sin pérdida (FlateDecode). No es un lector de PDF general: solo lo que hace el escáner.

// Devuelve { bmp: ImageBitmap, ppmm, ancho, alto } o lanza un error si el PDF no es una muestra escaneada.
export async function imagenDePDF(buf) {
  const b = new Uint8Array(buf), s = latin1(b);
  const caja = /\/MediaBox\s*\[\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*\]/.exec(s);
  if (!caja) throw new Error('no parece un PDF');
  const anchoPag = (+caja[3] - +caja[1]) / 72;   // pulgadas
  // imágenes: el diccionario va desde el "<<" anterior a /Subtype/Image hasta la palabra "stream"
  const imgs = [];
  for (const m of s.matchAll(/\/Subtype\s*\/Image/g)) {
    const ini = abrirDic(s, m.index), fin = s.indexOf('stream', m.index);
    if (ini < 0 || fin < 0) continue;
    const dic = s.slice(ini, fin);
    let p = fin + 6; if (s[p] === '\r') p++; if (s[p] === '\n') p++;
    const fe = s.indexOf('endstream', p);
    const num = k => { const r = new RegExp('/' + k + '\\s+(\\d+)(?!\\s+\\d+\\s+R)').exec(dic); return r ? +r[1] : null; };
    const W = num('Width'), H = num('Height');
    if (!W || !H || fe < 0) continue;
    imgs.push({ dic, datos: b.subarray(p, fe), W, H });
  }
  if (!imgs.length) throw new Error('el PDF no tiene una imagen escaneada');
  const img = imgs.reduce((a, c) => (c.W * c.H > a.W * a.H ? c : a));
  const ppi = img.W / anchoPag, dpi = Math.round(ppi / 10) * 10;
  if (dpi < 100 || dpi > 1200) throw new Error('la imagen no ocupa la hoja (no es una muestra escaneada)');
  const { dic, datos, W, H } = img;
  let bmp;
  if (/\/DCTDecode/.test(dic)) {
    bmp = await createImageBitmap(new Blob([datos], { type: 'image/jpeg' }));
  } else if (/\/CCITTFaxDecode/.test(dic)) {
    const K = +(/\/K\s+(-?\d+)/.exec(dic)?.[1] ?? 0);
    if (K >= 0) throw new Error('blanco y negro con un formato que todavía no se lee (CCITT K ≥ 0)');
    // Como en el PDF: el bit de salida es 1 para "negro" si BlackIs1 es true (si no, 0), y en DeviceGray de 1 bit
    // el 1 es blanco; /Decode [1 0] lo invierte. (El escáner Epson marca el papel como "negro" con BlackIs1 true.)
    const negroEs1 = /\/BlackIs1\s+true/.test(dic), invertir = /\/Decode\s*\[\s*1(\.0)?\s+0(\.0)?\s*\]/.test(dic);
    const px = decodificarG4(datos, W, H);   // 1 = "negro" del código CCITT
    bmp = await aBitmap(W, H, (i) => {
      let b = px[i] ? (negroEs1 ? 1 : 0) : (negroEs1 ? 0 : 1);
      if (invertir) b ^= 1;
      return b ? 255 : 0;
    });
  } else if (/\/FlateDecode/.test(dic)) {
    const crudo = new Uint8Array(await new Response(new Blob([datos]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    const bpc = +(/\/BitsPerComponent\s+(\d+)/.exec(dic)?.[1] ?? 8), rgb = /\/DeviceRGB/.test(dic);
    if (/\/Predictor\s+([2-9]|1\d)/.test(dic)) throw new Error('imagen con predictor: todavía no se lee');
    const fila = Math.ceil((W * (rgb ? 3 : 1) * bpc) / 8);
    bmp = await aBitmap(W, H, (i, rgba) => {
      const y = (i / W) | 0, x = i - y * W;
      if (bpc === 1) { const v = (crudo[y * fila + (x >> 3)] >> (7 - (x & 7))) & 1; return v ? 255 : 0; }
      if (rgb) { const k = y * fila + 3 * x; rgba[0] = crudo[k]; rgba[1] = crudo[k + 1]; rgba[2] = crudo[k + 2]; return null; }
      return crudo[y * fila + x];
    });
  } else throw new Error('la imagen del PDF tiene un formato que todavía no se lee');
  return { bmp, ppmm: dpi / 25.4, ancho: W, alto: H };
}

function latin1(b) {
  let s = ''; const N = 0x8000;
  for (let i = 0; i < b.length; i += N) s += String.fromCharCode.apply(null, b.subarray(i, i + N));
  return s;
}
// posición del "<<" que abre el diccionario que contiene la posición p (cuenta los << >> anidados hacia atrás)
function abrirDic(s, p) {
  let prof = 0;
  for (let i = p; i > 0; i--) {
    if (s[i] === '>' && s[i - 1] === '>') { prof++; i--; }
    else if (s[i] === '<' && s[i - 1] === '<') { if (prof === 0) return i - 1; prof--; i--; }
  }
  return -1;
}
async function aBitmap(W, H, valor) {
  const c = new OffscreenCanvas(W, H), x = c.getContext('2d'), im = x.createImageData(W, H), d = im.data, rgba = [0, 0, 0];
  for (let i = 0; i < W * H; i++) {
    const v = valor(i, rgba), k = 4 * i;
    if (v == null) { d[k] = rgba[0]; d[k + 1] = rgba[1]; d[k + 2] = rgba[2]; } else d[k] = d[k + 1] = d[k + 2] = v;
    d[k + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  return c.transferToImageBitmap();
}

// ---- CCITT grupo 4 (T.6): cada línea se codifica comparando con la de arriba ----
// Tablas de largos de tramo (código → largo). Blanco y negro tienen códigos distintos; los largos de 1792 en
// adelante son comunes a los dos.
const BLANCO = {
  '00110101': 0, '000111': 1, '0111': 2, '1000': 3, '1011': 4, '1100': 5, '1110': 6, '1111': 7, '10011': 8, '10100': 9,
  '00111': 10, '01000': 11, '001000': 12, '000011': 13, '110100': 14, '110101': 15, '101010': 16, '101011': 17,
  '0100111': 18, '0001100': 19, '0001000': 20, '0010111': 21, '0000011': 22, '0000100': 23, '0101000': 24,
  '0101011': 25, '0010011': 26, '0100100': 27, '0011000': 28, '00000010': 29, '00000011': 30, '00011010': 31,
  '00011011': 32, '00010010': 33, '00010011': 34, '00010100': 35, '00010101': 36, '00010110': 37, '00010111': 38,
  '00101000': 39, '00101001': 40, '00101010': 41, '00101011': 42, '00101100': 43, '00101101': 44, '00000100': 45,
  '00000101': 46, '00001010': 47, '00001011': 48, '01010010': 49, '01010011': 50, '01010100': 51, '01010101': 52,
  '00100100': 53, '00100101': 54, '01011000': 55, '01011001': 56, '01011010': 57, '01011011': 58, '01001010': 59,
  '01001011': 60, '00110010': 61, '00110011': 62, '00110100': 63,
  '11011': 64, '10010': 128, '010111': 192, '0110111': 256, '00110110': 320, '00110111': 384, '01100100': 448,
  '01100101': 512, '01101000': 576, '01100111': 640, '011001100': 704, '011001101': 768, '011010010': 832,
  '011010011': 896, '011010100': 960, '011010101': 1024, '011010110': 1088, '011010111': 1152, '011011000': 1216,
  '011011001': 1280, '011011010': 1344, '011011011': 1408, '010011000': 1472, '010011001': 1536, '010011010': 1600,
  '011000': 1664, '010011011': 1728,
};
const NEGRO = {
  '0000110111': 0, '010': 1, '11': 2, '10': 3, '011': 4, '0011': 5, '0010': 6, '00011': 7, '000101': 8, '000100': 9,
  '0000100': 10, '0000101': 11, '0000111': 12, '00000100': 13, '00000111': 14, '000011000': 15, '0000010111': 16,
  '0000011000': 17, '0000001000': 18, '00001100111': 19, '00001101000': 20, '00001101100': 21, '00000110111': 22,
  '00000101000': 23, '00000010111': 24, '00000011000': 25, '000011001010': 26, '000011001011': 27,
  '000011001100': 28, '000011001101': 29, '000001101000': 30, '000001101001': 31, '000001101010': 32,
  '000001101011': 33, '000011010010': 34, '000011010011': 35, '000011010100': 36, '000011010101': 37,
  '000011010110': 38, '000011010111': 39, '000001101100': 40, '000001101101': 41, '000011011010': 42,
  '000011011011': 43, '000001010100': 44, '000001010101': 45, '000001010110': 46, '000001010111': 47,
  '000001100100': 48, '000001100101': 49, '000001010010': 50, '000001010011': 51, '000000100100': 52,
  '000000110111': 53, '000000111000': 54, '000000100111': 55, '000000101000': 56, '000001011000': 57,
  '000001011001': 58, '000000101011': 59, '000000101100': 60, '000001011010': 61, '000001100110': 62,
  '000001100111': 63,
  '0000001111': 64, '000011001000': 128, '000011001001': 192, '000001011011': 256, '000000110011': 320,
  '000000110100': 384, '000000110101': 448, '0000001101100': 512, '0000001101101': 576, '0000001001010': 640,
  '0000001001011': 704, '0000001001100': 768, '0000001001101': 832, '0000001110010': 896, '0000001110011': 960,
  '0000001110100': 1024, '0000001110101': 1088, '0000001110110': 1152, '0000001110111': 1216, '0000001010010': 1280,
  '0000001010011': 1344, '0000001010100': 1408, '0000001010101': 1472, '0000001011010': 1536, '0000001011011': 1600,
  '0000001100100': 1664, '0000001100101': 1728,
};
const COMUN = {
  '00000001000': 1792, '00000001100': 1856, '00000001101': 1920, '000000010010': 1984, '000000010011': 2048,
  '000000010100': 2112, '000000010101': 2176, '000000010110': 2240, '000000010111': 2304, '000000011100': 2368,
  '000000011101': 2432, '000000011110': 2496, '000000011111': 2560,
};
for (const t of [BLANCO, NEGRO]) Object.assign(t, COMUN);
// tablas por (largo del código, valor) para leer bit a bit sin armar textos
const aMapa = t => { const m = new Map(); for (const [c, v] of Object.entries(t)) m.set(c.length * 65536 + parseInt(c, 2), v); return m; };
const MB = aMapa(BLANCO), MN = aMapa(NEGRO);

// Devuelve un Uint8Array de W×H con 1 = negro.
export function decodificarG4(datos, W, H) {
  let pos = 0;   // bit
  const bit = () => { const v = (datos[pos >> 3] >> (7 - (pos & 7))) & 1; pos++; return v; };
  const tramo = mapa => {
    let total = 0;
    for (;;) {
      let v = 0, n = 0, r;
      do { v = (v << 1) | bit(); n++; r = mapa.get(n * 65536 + v); } while (r === undefined && n < 14);
      if (r === undefined) throw new Error('código G4 inválido');
      total += r;
      if (r < 64) return total;
    }
  };
  const px = new Uint8Array(W * H);
  let ref = [W, W];   // cambios de la línea de arriba (imaginaria: toda blanca)
  for (let y = 0; y < H; y++) {
    const cam = [];
    let a0 = -1, color = 0;   // 0 = blanco
    const b1de = () => {
      let i = 0; while (i < ref.length && ref[i] <= a0) i++;
      if ((i & 1) !== color) i++;   // con color blanco el cambio tiene que ser a negro (posición par)
      return i;
    };
    while (a0 < W) {
      // modo
      let modo;
      if (bit()) modo = 'V0';
      else if (bit()) modo = bit() ? 'VR1' : 'VL1';
      else if (bit()) modo = 'H';
      else if (bit()) modo = 'P';
      else if (bit()) modo = bit() ? 'VR2' : 'VL2';
      else if (bit()) modo = bit() ? 'VR3' : 'VL3';
      else { modo = 'X'; }
      if (modo === 'X') { // extensión o fin de datos (EOFB): no se esperan en una muestra; se termina
        y = H; break;
      }
      const i = b1de(), b1 = ref[i] ?? W, b2 = ref[i + 1] ?? W;
      if (modo === 'P') { a0 = b2; continue; }
      if (modo === 'H') {
        const inicio = Math.max(a0, 0);
        const r1 = tramo(color ? MN : MB), r2 = tramo(color ? MB : MN);
        const a1 = Math.min(inicio + r1, W), a2 = Math.min(a1 + r2, W);
        cam.push(a1, a2); a0 = a2; continue;
      }
      const d = { V0: 0, VR1: 1, VR2: 2, VR3: 3, VL1: -1, VL2: -2, VL3: -3 }[modo];
      const a1 = Math.min(Math.max(b1 + d, 0), W);
      cam.push(a1); a0 = a1; color ^= 1;
    }
    if (y >= H) break;
    // pintar la línea: empieza blanca y cambia en cada posición
    let c = 0, x = 0;
    for (const p of cam) { if (c) px.fill(1, y * W + x, y * W + Math.min(p, W)); x = Math.min(p, W); c ^= 1; }
    if (c && x < W) px.fill(1, y * W + x, y * W + W);
    ref = cam.filter(p => p < W).concat([W, W]);
    // los cambios repetidos en la misma posición se anulan
  }
  return px;
}
