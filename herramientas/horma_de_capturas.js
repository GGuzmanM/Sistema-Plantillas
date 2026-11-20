// Horma a partir de capturas de LutraCAD (Ernesto, 2026-11-17): contorno de arriba + perfil del lado interno + borde
// externo, con los cortes de lado a lado de la Guía de tallas (STL limpio) como molde. Se arma fila por fila en el
// formato de las hormas (estaciones cada 0,5 mm, 61 columnas del lado externo al interno) y se alisa a lo largo, así
// no quedan arrugas. Se usa desde el navegador (servidor del programa), no desde la pantalla.
import { prepararHorma, generar, medidas } from '../motor/plantilla.js';

const leerJSON = async r => (await fetch(r + '?' + Date.now())).json();
async function pixeles(url) {
  const img = new Image(); img.src = url + '?' + Date.now(); await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  return { d: x.getImageData(0, 0, c.width, c.height).data, W: c.width, H: c.height, img };
}
// brillo de un píxel de la plantilla (gris/blanco) o -1 si es fondo azul
const brillo = ({ d, W }, i, j) => { const o = (j * W + i) * 4, r = d[o], g = d[o + 1], b = d[o + 2]; return (b - r) < 25 && (r + g + b) / 3 > 35 ? (r + g + b) / 3 : -1; };

// Perfil de costado: por columna, lo más alto (silueta) y la línea blanca del borde (mayor salto de brillo bajo la
// silueta). `talonDerecha` = el talón está a la derecha de la imagen. Devuelve funciones de t (0 talón, 1 dedos) en mm.
export async function perfilCostado(url, largo, talonDerecha) {
  const P = await pixeles(url), { W, H } = P, top = [], bot = [], borde = [];
  for (let i = 0; i < W; i++) {
    let t = -1, b = -1; for (let j = 0; j < H; j++) if (brillo(P, i, j) >= 0) { if (t < 0) t = j; b = j; }
    top.push(t); bot.push(b);
    let mej = t, salto = 0;
    if (t >= 0) for (let j = t + 3; j < b - 1; j++) { const a = brillo(P, i, j - 1), c = brillo(P, i, j); if (a >= 0 && c >= 0 && c - a > salto) { salto = c - a; mej = j; } }
    borde.push(salto > 45 ? mej : t);
  }
  const x0 = top.findIndex(v => v >= 0), x1 = W - 1 - [...top].reverse().findIndex(v => v >= 0);
  const bots = bot.slice(x0, x1 + 1).filter(v => v >= 0).sort((a, b) => a - b), base = bots[Math.floor(bots.length * 0.9)];
  const px = (x1 - x0) / largo, col = t => Math.round(talonDerecha ? x1 - t * (x1 - x0) : x0 + t * (x1 - x0));
  return { x0, x1, base, px, top, borde, img: P.img, talonDerecha,
           silueta: t => (base - top[col(t)]) / px, bordeExt: t => (base - borde[col(t)]) / px };
}

export const muestrear = (f, N = 400) => Array.from({ length: N + 1 }, (_, k) => f(k / N));
export function gauss(a, sig) {   // sig en fracción del largo
  const N = a.length - 1, s = Math.max(sig * N, 1e-3), o = [];
  for (let k = 0; k <= N; k++) { let w = 0, v = 0; for (let m = Math.max(0, Math.floor(k - 3 * s)); m <= Math.min(N, Math.ceil(k + 3 * s)); m++) { const q = (m - k) / s, ww = Math.exp(-q * q / 2); w += ww; v += ww * a[m]; } o.push(v / w); }
  return o;
}
const en = (a, t) => { const N = a.length - 1, q = Math.min(Math.max(t, 0), 1) * N, i = Math.min(Math.floor(q), N - 1), u = q - i; return a[i] * (1 - u) + a[i + 1] * u; };
const sm = (a, b, x) => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

// Arma la horma: cont = contorno [[x, y]] (pie izq., interno +X, talón y mínima); I, E = lado interno (lo más alto)
// y borde externo en mm, muestreados de 0 a 1; f = espesor (piso); molde = datos de la Guía (guia_stl.json).
// alisar = sigma a lo largo en mm (quita las rayas entre filas).
export function sintetizar({ cont, I, E, f, molde, alisar = 2 }) {
  const R = molde.estaciones, yT = molde.puntaTalon[1], LT = molde.puntaDedos[1] - yT;
  let F0 = Infinity; for (const r of R) for (const v of r.z) F0 = Math.min(F0, v);
  const filaT = t => { const y = yT + t * LT; let a = 0, b = R.length - 1; while (b - a > 1) { const m = (a + b) >> 1; if (R[m].y <= y) a = m; else b = m; }
    const A = R[a], B = R[b], k = B.y > A.y ? Math.min(1, Math.max(0, (y - A.y) / (B.y - A.y))) : 0; return A.z.map((v, c) => v + k * (B.z[c] - v)); };
  let y0 = Infinity, y1 = -Infinity; for (const [, y] of cont) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const L = y1 - y0;
  const cruces = y => { const xs = []; for (let i = 0; i < cont.length; i++) { const [ax, ay] = cont[i], [bx, by] = cont[(i + 1) % cont.length]; if ((ay - y) * (by - y) <= 0 && ay !== by) xs.push(ax + (y - ay) / (by - ay) * (bx - ax)); } return xs.length ? [Math.min(...xs), Math.max(...xs)] : null; };
  const est = [];
  for (let y = y0 + 0.5; y <= y1 - 0.5; y += 0.5) {
    const xx = cruces(y); if (!xx || xx[1] - xx[0] < 0.5) continue;
    const t = (y - y0) / L, zt = filaT(t), ET = zt[0], IT = Math.max(...zt);
    // en la punta del talón el lado interno y el externo se juntan: los dos van a su promedio de a poco (si no, la
    // diferencia queda apretada en filas de pocos mm y se ve como pliegue)
    const u = 1 - sm(0, 0.07, t), m0 = (en(E, 0) + en(I, 0)) / 2, Et = en(E, t) + (m0 - en(E, t)) * u, It = en(I, t) + (m0 - en(I, t)) * u;
    // sin cortes bruscos (cada "si/no" deja una raya a lo ancho): denominador con piso y corrección que se apaga suave
    const sO = Math.min(4, Math.max(0, (Et - f) / Math.max(ET - F0, 1))), sI = Math.min(4, Math.max(0, (It - f) / Math.max(IT - F0, 1)));
    const z = zt.map((v, c) => { const w = sm(0.3, 0.85, c / 60); return f + (v - F0) * (sO * (1 - w) + sI * w); });
    // lo que el molde no alcanza (donde es plano): se suma cerca del borde externo y del lado interno
    const apaga = 1 - sm(0.75, 0.88, t);
    if (apaga > 0) { const rO = Et - z[0], rI = It - Math.max(...z); for (let c = 0; c < 61; c++) z[c] += apaga * (rO * Math.max(0, 1 - c / 20) ** 2 + rI * sm(0.55, 1, c / 60)); }
    // en la punta de los dedos, plano al espesor (el molde trae diferencias de centésimas que en filas tan cortas
    // se ven como pliegue)
    const plano = sm(0.85, 0.95, t);
    est.push({ y: y - y0, xi: xx[0], xd: xx[1], z: z.map(v => Math.max(f, f + (v - f) * (1 - plano))) });
  }
  // alisar a lo largo (columna por columna)
  const s = alisar / 0.5;
  if (s > 0) for (let c = 0; c < 61; c++) {
    const col = est.map(e => e.z[c]), o = [];
    for (let k = 0; k < col.length; k++) { let w = 0, v = 0; for (let m = Math.max(0, Math.floor(k - 3 * s)); m <= Math.min(col.length - 1, Math.ceil(k + 3 * s)); m++) { const q = (m - k) / s, ww = Math.exp(-q * q / 2); w += ww; v += ww * col[m]; } o.push(v / w); }
    est.forEach((e, k) => { e.z[c] = o[k]; });
  }
  // en los primeros mm del talón todo es borde: el centro de esas filas cortas no se hunde (si no, el borde de la punta
  // del talón baja ~1 mm en el medio y se ve un pliegue). Va después del alisado, que si no lo vuelve a bajar.
  for (const e of est) { const wT = 1 - sm(0, 8, e.y); if (wT <= 0) continue;
    for (let c = 0; c < 61; c++) { const borde = e.z[0] + (e.z[60] - e.z[0]) * c / 60; if (borde > e.z[c]) e.z[c] += (borde - e.z[c]) * wT; } }
  for (const e of est) { e.y = +e.y.toFixed(2); e.xi = +e.xi.toFixed(3); e.xd = +e.xd.toFixed(3); e.z = e.z.map(v => +v.toFixed(3)); }
  const pT = cont.reduce((m, p) => p[1] < m[1] ? p : m), pD = cont.reduce((m, p) => p[1] > m[1] ? p : m);
  // las puntas a la altura de la fila vecina (si no, queda un escalón mínimo que en la punta se ve como pliegue)
  const media = e => e.z.reduce((s, v) => s + v, 0) / e.z.length;
  return { columnas: 61, puntaTalon: [pT[0], 0, +media(est[0]).toFixed(3)], puntaDedos: [pD[0], +L.toFixed(2), +media(est[est.length - 1]).toFixed(3)], estaciones: est };
}

// Genera la plantilla con las alturas propias de la horma (sin cambiarlas) y mide: lado interno (lo más alto de cada
// tramo), borde externo (punto más externo), pliegue máximo entre caras vecinas (fuera del 2 % del talón).
export function evaluar(datos, op, largo, p) {
  const h = prepararHorma(datos, { antepie: 1.5, copa: 10 }, op);
  const pp = p ? p(h.ref) : { copa: h.ref.copa, antepie: h.ref.antepie, arco: h.ref.arco };
  // sin capas (2026-11-19): con las alturas propias la conversión vieja deja la horma tal cual; las capas toman como
  // punto de partida la copa aprobada de la horma (10), no la de la captura
  const g = generar({ ...h, partes: undefined }, { largo, canto: 1.2, lado: 'izq', arcoPos: h.ref.arcoPos, ...pp });
  const N = 100, sil = new Array(N + 1).fill(0), ext = new Array(N + 1).fill(null), xm = new Array(N + 1).fill(Infinity);
  for (let q = 0; q < g.x.length; q++) { const k = Math.round(g.y[q] / largo * N); if (k >= 0 && k <= N) sil[k] = Math.max(sil[k], g.z[q]); }
  for (let i = 0; i < g.ns; i++) { const q = i * g.nr, k = Math.round(g.y[q] / largo * N); if (k >= 0 && k <= N && g.x[q] < 0 && g.x[q] < xm[k]) { xm[k] = g.x[q]; ext[k] = g.z[q]; } }
  for (let k = 0; k <= N; k++) if (ext[k] == null) ext[k] = ext[k - 1] ?? sil[k];
  const { ns, nr, x, y, z } = g, nor = (A, B, C) => { const ux = x[B] - x[A], uy = y[B] - y[A], uz = z[B] - z[A], vx = x[C] - x[A], vy = y[C] - y[A], vz = z[C] - z[A]; const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], l = Math.hypot(...n) || 1; return n.map(v => v / l); };
  let pliegue = 0, donde = null;
  for (let i = 0; i < ns; i++) for (let k = 0; k < nr - 2; k++) { const j = (i + 1) % ns, A = i * nr + k; if (y[A] < 0.02 * largo) continue;
    const n1 = nor(A, j * nr + k, j * nr + k + 1), n2 = nor(i * nr + k + 1, j * nr + k + 1, j * nr + k + 2), an = Math.acos(Math.min(1, Math.abs(n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]))) * 180 / Math.PI;
    if (an > pliegue) { pliegue = an; donde = [+(y[A] / largo).toFixed(3), k]; } }
  return { h, g, sil, ext, pliegue, donde, ref: h.ref, md: medidas(g) };
}

// Corrige I y E hasta que la plantilla generada siga los perfiles de la captura (veces pasadas)
export function ajustar({ cont, I, E, f, molde, op, largo, veces = 4, alisar = 2 }) {
  let Ic = [...I], Ec = [...E], datos, r; const N = I.length - 1, hist = [];
  for (let it = 0; it <= veces; it++) {
    datos = sintetizar({ cont, I: Ic, E: Ec, f, molde, alisar }); r = evaluar(datos, op, largo);
    let eI = 0, eE = 0; const cI = new Array(N + 1).fill(0), cE = new Array(N + 1).fill(0);
    for (let k = 0; k <= N; k++) { const t = k / N; if (t < 0.07 || t > 0.92) continue; const dI = I[k] - en(r.sil, t), dE = E[k] - en(r.ext, t);
      eI = Math.max(eI, Math.abs(dI)); eE = Math.max(eE, Math.abs(dE)); cI[k] = dI; cE[k] = dE; }
    // la corrección se alisa antes de sumarla (corregir punto por punto deja ondas finas a lo ancho)
    if (it < veces) { const sI = gauss(cI, 0.015), sE = gauss(cE, 0.015); for (let k = 0; k <= N; k++) { Ic[k] += 0.8 * sI[k]; Ec[k] += 0.8 * sE[k]; } }
    hist.push({ eI: +eI.toFixed(2), eE: +eE.toFixed(2), pliegue: +r.pliegue.toFixed(1) });
  }
  return { datos, r, hist };
}

// Imagen con luz de la cara de arriba (para ver arrugas)
export function sombra(g) {
  const { ns, nr, x, y, z } = g; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let q = 0; q < x.length; q++) { x0 = Math.min(x0, x[q]); x1 = Math.max(x1, x[q]); y0 = Math.min(y0, y[q]); y1 = Math.max(y1, y[q]); }
  const R = 0.5, NX = Math.ceil((x1 - x0) / R) + 3, NY = Math.ceil((y1 - y0) / R) + 3, H = new Float32Array(NX * NY).fill(-1);
  const tri = (a, b, c) => { const ax = (x[a] - x0) / R + 1, ay = (y[a] - y0) / R + 1, bx = (x[b] - x0) / R + 1, by = (y[b] - y0) / R + 1, cx = (x[c] - x0) / R + 1, cy = (y[c] - y0) / R + 1, d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); if (Math.abs(d) < 1e-9) return;
    for (let jj = Math.floor(Math.min(ay, by, cy)); jj <= Math.ceil(Math.max(ay, by, cy)); jj++) for (let ii = Math.floor(Math.min(ax, bx, cx)); ii <= Math.ceil(Math.max(ax, bx, cx)); ii++) {
      const s = ((ii - ax) * (cy - ay) - (jj - ay) * (cx - ax)) / d, t = ((bx - ax) * (jj - ay) - (by - ay) * (ii - ax)) / d; if (s < -1e-6 || t < -1e-6 || s + t > 1 + 1e-6) continue;
      const zz = z[a] + s * (z[b] - z[a]) + t * (z[c] - z[a]), k = jj * NX + ii; if (ii >= 0 && jj >= 0 && ii < NX && jj < NY && zz > H[k]) H[k] = zz; } };
  for (let i = 0; i < ns; i++) { const j = (i + 1) % ns; for (let k = 0; k < nr - 1; k++) { const a = i * nr + k, b = j * nr + k, c = j * nr + k + 1, d = i * nr + k + 1; tri(a, b, c); tri(a, c, d); } }
  const cv = document.createElement('canvas'); cv.width = NX; cv.height = NY; const c = cv.getContext('2d'), im = c.createImageData(NX, NY), L = [-0.45, 0.55, 0.7], ll = Math.hypot(...L);
  for (let jj = 1; jj < NY - 1; jj++) for (let ii = 1; ii < NX - 1; ii++) { const k = jj * NX + ii, o = ((NY - 1 - jj) * NX + ii) * 4; if (H[k] < 0) continue;
    const g2 = m => H[m] >= 0 ? H[m] : H[k], zx = (g2(k + 1) - g2(k - 1)) / (2 * R), zy = (g2(k + NX) - g2(k - NX)) / (2 * R), nx = -zx * 2.5, ny = -zy * 2.5, nl = Math.hypot(nx, ny, 1);
    const dd = Math.max(0, (nx * L[0] + ny * L[1] + L[2]) / (nl * ll)), v = Math.round(95 + 160 * dd); im.data[o] = v; im.data[o + 1] = v; im.data[o + 2] = v + 3; im.data[o + 3] = 255; }
  c.putImageData(im, 0, 0); return cv;
}
// Todo junto: contorno (archivo de puntos), costado interno y externo (png y si el talón está a la derecha), largo de
// la captura, hasta dónde el borde externo es recto (copa recta) y el alisado a lo largo. Devuelve los datos de la horma.
export async function armarDesdeCapturas({ contorno, interno, externo, largo = 288, copaHasta = 0.4, alisar = 6, op }) {
  const molde = await leerJSON('../biblioteca/hormas/guia_stl.json'), cont = (await leerJSON(contorno)).puntos;
  const pI = await perfilCostado(interno[0], largo, interno[1]), pE = await perfilCostado(externo[0], largo, externo[1]);
  const N = 400, I = gauss(muestrear(pI.silueta, N), 0.008); let E = gauss(muestrear(pE.bordeExt, N), 0.008);
  const plano = E.slice(Math.round(0.15 * N), Math.round((copaHasta - 0.03) * N)).sort((a, b) => a - b), copaE = plano[plano.length >> 1];
  for (let k = 0; k <= N; k++) { if (k / N < copaHasta) E[k] = copaE; else E[k] = Math.min(E[k], E[k - 1]); }
  E = gauss(E, 0.012); for (let k = 0; k < Math.round(0.3 * N); k++) E[k] = copaE;
  const fr = I.slice(Math.round(0.75 * N), Math.round(0.95 * N)).sort((a, b) => a - b), f = fr[fr.length >> 1];
  for (let k = 0; k <= N; k++) E[k] = Math.max(f, k / N > 0.1 ? Math.min(E[k], I[k]) : E[k]);
  const a = ajustar({ cont, I, E, f, molde, op, largo, veces: 4, alisar });
  return { ...a, pI, pE, I, E, f, copaE };
}
export { leerJSON, en };
