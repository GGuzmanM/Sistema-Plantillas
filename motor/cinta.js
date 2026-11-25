// Laminador propio para la impresora de cinta sin fin PodoTec3D Model 1 — BETA (Ernesto, 2026-11-23).
//
// Copia lo que hace ideaMaker 5.3 con el perfil "PLANTAR3D- 08- OCT25" (G-code de referencia de Ernesto,
// "PRUEBA ERNESTO PT2.gcode", 2026-11-19):
// · RepRapFirmware. X = a lo ancho de la cinta (0–210), Y = distancia sobre el plano inclinado del cabezal (30°)
//   desde la cinta (Y = alto / sen 30°), Z = avance de la cinta. Cada capa avanza 0,9 mm de cinta = 0,45 mm de
//   espesor; la primera, el doble.
// · Cada plantilla acostada sobre la cinta, a lo largo de ella, la punta primero y el talón al final; centradas en
//   X 105, una detrás de la otra. El lado interno del pie derecho queda en X menor (comprobado en la referencia).
// · Por capa: pared interior, pared exterior (0,8 mm; 0,88 en la primera capa) y relleno al 60 %.
// · E (absoluto) = ancho × espesor × largo ÷ área del filamento de 1,75 mm (× flujo del relleno); el flujo global
//   70 % lo pone M221 en el inicio, igual que el perfil.
// · Inicio y final copiados del perfil; retracción 0,8 mm (F1800 / F1500), limpieza de 1 mm a F3600 al cerrar la
//   pared exterior, viajes a F6000, Z a F1200, ventilador 30–60 % según lo que dura la capa.
//
// Cómo corta: para cada capa, el plano inclinado se muestrea en una grilla (X, Y) de `celda` mm; cada celda está
// dentro si ese punto cae dentro de alguna plantilla (entre su cara de abajo y la de arriba). Con la distancia de cada
// celda al borde (transformada de distancia exacta) se sacan las curvas a 0,4 mm (pared exterior), 1,2 mm (interior)
// y cada 0,8 mm más adentro (relleno concéntrico). ideaMaker rellena el centro con una línea de ancho variable; aquí,
// por ser beta, el relleno es concéntrico (puede quedar una franja angosta sin rellenar en el medio).

export const CINTA_FABRICA = {
  nombre: 'PodoTec3D Model 1 (perfil PLANTAR3D 08-OCT25)',
  angulo: 30, ancho: 210, alto: 180, centroX: 105, separacion: 10,
  paso: 0.9,               // avance de cinta por capa (espesor 0,45 mm); la primera capa avanza 1,8
  linea: 0.8, primera: 0.88, flujoRelleno: 0.6, pasoRelleno: 0.8, paredes: 2,   // boquilla de 0,8 (Ernesto)
  // relleno (2026-11-24): 'concentrico' (el de siempre: líneas cada pasoRelleno con flujo = flujoRelleno),
  // 'giroide' o 'cubico' (líneas a flujo completo, separadas para que llenen flujoRelleno del interior). De fábrica
  // giroide desde el módulo Impresión (2026-11-24), igual que el perfil de Máquinas.
  tipoRelleno: 'giroide',
  temp: 250, flujo: 70, filamento: 1.75,
  F: { primera: 600, exterior: 1500, interior: 3000, relleno: 1800, viaje: 6000, z: 1200, retraer: 1800, volver: 1500, limpiar: 3600 },
  retraccion: 0.8, limpieza: 1,
  densidad: 710,           // kg/m³ (TPU espumado PLANTAR3D), para el peso en gramos
  celda: 0.15,
};

const f3 = v => (Math.abs(v) < 0.0005 ? 0 : v).toFixed(3), f4 = v => v.toFixed(4);

// ---- Mapa de una plantilla: alturas de arriba y de abajo en una grilla, y dónde hay plantilla ----
function mapaPieza(g, R = 0.25, Rm = 0.1) {
  const { ns, nr, x, y, z, zb } = g;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, hmax = 0;
  for (let q = 0; q < x.length; q++) { x0 = Math.min(x0, x[q]); x1 = Math.max(x1, x[q]); y0 = Math.min(y0, y[q]); y1 = Math.max(y1, y[q]); hmax = Math.max(hmax, z[q]); }
  x0 -= 1; y0 -= 1; x1 += 1; y1 += 1;
  const NX = Math.ceil((x1 - x0) / R) + 2, NY = Math.ceil((y1 - y0) / R) + 2;
  const T = new Float32Array(NX * NY).fill(NaN), B = new Float32Array(NX * NY).fill(NaN);
  const MX = Math.ceil((x1 - x0) / Rm) + 2, MY = Math.ceil((y1 - y0) / Rm) + 2, M = new Uint8Array(MX * MY);
  // triángulo (a, b, c) en las dos grillas: arriba el máximo, abajo el mínimo, y la marca de "hay plantilla"
  const tri = (a, b, c) => {
    for (const [G, NXg, NYg, r, modo] of [[T, NX, NY, R, 0], [B, NX, NY, R, 1], [M, MX, MY, Rm, 2]]) {
      const ax = (x[a] - x0) / r, ay = (y[a] - y0) / r, bx = (x[b] - x0) / r, by = (y[b] - y0) / r, cx = (x[c] - x0) / r, cy = (y[c] - y0) / r;
      const d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); if (Math.abs(d) < 1e-12) continue;
      for (let j = Math.max(0, Math.floor(Math.min(ay, by, cy))); j <= Math.min(NYg - 1, Math.ceil(Math.max(ay, by, cy))); j++)
        for (let i = Math.max(0, Math.floor(Math.min(ax, bx, cx))); i <= Math.min(NXg - 1, Math.ceil(Math.max(ax, bx, cx))); i++) {
          const s = ((i - ax) * (cy - ay) - (j - ay) * (cx - ax)) / d, t = ((bx - ax) * (j - ay) - (by - ay) * (i - ax)) / d;
          if (s < -1e-6 || t < -1e-6 || s + t > 1 + 1e-6) continue;
          const k = j * NXg + i;
          if (modo === 2) { G[k] = 1; continue; }
          const v = modo === 0 ? z[a] + s * (z[b] - z[a]) + t * (z[c] - z[a]) : zb[a] + s * (zb[b] - zb[a]) + t * (zb[c] - zb[a]);
          if (Number.isNaN(G[k]) || (modo === 0 ? v > G[k] : v < G[k])) G[k] = v;
        }
    }
  };
  for (let i = 0; i < ns; i++) { const j = (i + 1) % ns; for (let k = 0; k < nr - 1; k++) { const a = i * nr + k, b = j * nr + k, c = j * nr + k + 1, d = i * nr + k + 1; tri(a, b, c); tri(a, c, d); } }
  // las celdas del borde sin valor toman el del vecino (así la interpolación no se corta antes del borde)
  for (let pasada = 0; pasada < 3; pasada++) for (const G of [T, B]) {
    const C = G.slice();
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i; if (!Number.isNaN(C[k])) continue;
      let s = 0, n = 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= NX || jj >= NY) continue; const v = C[jj * NX + ii]; if (!Number.isNaN(v)) { s += v; n++; } }
      if (n) G[k] = s / n;
    }
  }
  return { T, B, M, NX, NY, MX, MY, R, Rm, x0, y0, x1, y1, hmax, xmid: (x0 + x1) / 2, largo: y1 - y0 - 2, ancho: x1 - x0 - 2, ytoe: y1 - 1 };
}
// ¿hay plantilla en (x, y) a la altura h?
function adentro(m, x, y, h) {
  const mi = Math.round((x - m.x0) / m.Rm), mj = Math.round((y - m.y0) / m.Rm);
  if (mi < 0 || mj < 0 || mi >= m.MX || mj >= m.MY || !m.M[mj * m.MX + mi]) return false;
  const fx = (x - m.x0) / m.R, fy = (y - m.y0) / m.R, i = Math.min(Math.max(Math.floor(fx), 0), m.NX - 2), j = Math.min(Math.max(Math.floor(fy), 0), m.NY - 2), u = fx - i, v = fy - j;
  const bil = G => { const a = G[j * m.NX + i], b = G[j * m.NX + i + 1], c = G[(j + 1) * m.NX + i], d = G[(j + 1) * m.NX + i + 1];
    if (Number.isNaN(a + b + c + d)) { const vs = [a, b, c, d].filter(t => !Number.isNaN(t)); return vs.length ? vs.reduce((p, q) => p + q, 0) / vs.length : NaN; }
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v; };
  const zt = bil(m.T), zb = bil(m.B);
  return h >= zb - 1e-6 && h <= zt + 1e-6;
}

// ---- Transformada de distancia exacta (Felzenszwalb) ----
function edt1(f, n, d, v, zz) {
  let k = 0; v[0] = 0; zz[0] = -Infinity; zz[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s;
    while (true) { s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); if (s <= zz[k]) { k--; continue; } break; }
    k++; v[k] = q; zz[k] = s; zz[k + 1] = Infinity;
  }
  k = 0; for (let q = 0; q < n; q++) { while (zz[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
}
// dentro (Uint8, nx × ny) → distancia al borde en celdas (positiva adentro)
function distancia(dentro, nx, ny) {
  const INF = 1e20, D = new Float64Array(nx * ny), n = Math.max(nx, ny), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), zz = new Float64Array(n + 1);
  for (let k = 0; k < nx * ny; k++) D[k] = dentro[k] ? INF : 0;
  for (let i = 0; i < nx; i++) { for (let j = 0; j < ny; j++) f[j] = D[j * nx + i]; edt1(f, ny, d, v, zz); for (let j = 0; j < ny; j++) D[j * nx + i] = d[j]; }
  for (let j = 0; j < ny; j++) { for (let i = 0; i < nx; i++) f[i] = D[j * nx + i]; edt1(f, nx, d, v, zz); for (let i = 0; i < nx; i++) D[j * nx + i] = d[i]; }
  for (let k = 0; k < nx * ny; k++) D[k] = Math.sqrt(D[k]) - 0.5;   // al borde, no al centro de la celda de afuera
  return D;
}

// ---- Curvas de nivel (marching squares) → lazos cerrados en celdas ----
function lazos(D, nx, ny, nivel) {
  const punto = new Map(), segs = [];   // clave de arista → [x, y]; segmentos como pares de claves
  const val = (i, j) => D[j * nx + i] - nivel;
  const arista = (i, j, lado) => {   // lado: 0 abajo (i,j)-(i+1,j), 1 derecha, 2 arriba, 3 izquierda
    const [a, b, c, d] = lado === 0 ? [i, j, i + 1, j] : lado === 1 ? [i + 1, j, i + 1, j + 1] : lado === 2 ? [i, j + 1, i + 1, j + 1] : [i, j, i, j + 1];
    const k = (lado === 0 || lado === 2) ? `h${b},${a}` : `v${b},${a}`;
    if (!punto.has(k)) { const va = val(a, b), vb = val(c, d), t = va / (va - vb); punto.set(k, [a + t * (c - a), b + t * (d - b)]); }
    return k;
  };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = val(i, j) > 0, b = val(i + 1, j) > 0, c = val(i + 1, j + 1) > 0, d = val(i, j + 1) > 0;
    const caso = (a ? 1 : 0) | (b ? 2 : 0) | (c ? 4 : 0) | (d ? 8 : 0);
    if (caso === 0 || caso === 15) continue;
    const s = (p, q) => segs.push([arista(i, j, p), arista(i, j, q)]);
    switch (caso) {
      case 1: case 14: s(3, 0); break;
      case 2: case 13: s(0, 1); break;
      case 3: case 12: s(3, 1); break;
      case 4: case 11: s(1, 2); break;
      case 6: case 9: s(0, 2); break;
      case 7: case 8: s(3, 2); break;
      case 5: s(3, 0); s(1, 2); break;
      case 10: s(0, 1); s(2, 3); break;
    }
  }
  const vecinos = new Map();
  for (const [p, q] of segs) { (vecinos.get(p) ?? vecinos.set(p, []).get(p)).push(q); (vecinos.get(q) ?? vecinos.set(q, []).get(q)).push(p); }
  const usado = new Set(), out = [];
  for (const [p0] of vecinos) {
    if (usado.has(p0)) continue;
    const L = [p0]; usado.add(p0); let ant = null, act = p0;
    while (true) {
      const sig = (vecinos.get(act) ?? []).find(q => q !== ant && !usado.has(q));
      if (!sig) break;
      L.push(sig); usado.add(sig); ant = act; act = sig;
    }
    if (L.length >= 4) out.push(L.map(k => punto.get(k)));
  }
  return out;
}
// Curvas de nivel abiertas (relleno giroide o cúbico): las celdas con alguna esquina NaN (fuera del interior) no se
// trazan, así las líneas terminan en el borde de las paredes. Devuelve trazos [[x, y], …] en celdas.
const CASOS = [[], [3, 0], [0, 1], [3, 1], [1, 2], [3, 0, 1, 2], [0, 2], [3, 2], [2, 3], [0, 2], [0, 1, 2, 3], [1, 2], [1, 3], [0, 1], [3, 0], []];
function trazos(V, nx, ny, nivel) {
  const punto = new Map(), vec = new Map();
  const unir = (p, q) => { (vec.get(p) ?? vec.set(p, []).get(p)).push(q); (vec.get(q) ?? vec.set(q, []).get(q)).push(p); };
  for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = V[j * nx + i] - nivel, b = V[j * nx + i + 1] - nivel, c = V[(j + 1) * nx + i + 1] - nivel, d = V[(j + 1) * nx + i] - nivel;
    if (Number.isNaN(a + b + c + d)) continue;
    const L = CASOS[(a > 0) | ((b > 0) << 1) | ((c > 0) << 2) | ((d > 0) << 3)];
    if (!L.length) continue;
    const arista = q => {
      const k = q === 0 ? `h${j},${i}` : q === 2 ? `h${j + 1},${i}` : q === 3 ? `v${j},${i}` : `v${j},${i + 1}`;
      if (!punto.has(k)) punto.set(k, q === 0 ? [i + a / (a - b), j] : q === 2 ? [i + d / (d - c), j + 1] : q === 3 ? [i, j + a / (a - d)] : [i + 1, j + b / (b - c)]);
      return k;
    };
    for (let q = 0; q < L.length; q += 2) unir(arista(L[q]), arista(L[q + 1]));
  }
  const usado = new Set(), out = [];
  const seguir = p0 => {
    const L = [p0]; usado.add(p0); let act = p0;
    while (true) { const sig = vec.get(act).find(q => !usado.has(q)); if (!sig) break; L.push(sig); usado.add(sig); act = sig; }
    return L.map(k => punto.get(k));
  };
  for (const [p, v] of vec) if (v.length === 1 && !usado.has(p)) out.push(seguir(p));   // primero los abiertos, desde una punta
  for (const [p] of vec) if (!usado.has(p)) { const L = seguir(p); L.push(L[0]); out.push(L); }   // después los cerrados
  return out.filter(L => L.length >= 2);
}
// Campo del relleno en un punto de la plantilla (X a lo ancho, u a lo largo de la cinta, h alto); su curva 0 son las
// líneas. Giroide: la superficie de siempre; cúbico: tres familias de planos (sale un cubo apoyado en una punta).
const CUB = [[0.8165, 0, 0.5774], [-0.4082, 0.7071, 0.5774], [-0.4082, -0.7071, 0.5774]];
function campoRelleno(tipo, fam, per, X, u, h) {
  if (tipo === 'giroide') { const q = (2 * Math.PI) / per; return Math.sin(q * X) * Math.cos(q * u) + Math.sin(q * u) * Math.cos(q * h) + Math.sin(q * h) * Math.cos(q * X); }
  const n = CUB[fam]; return Math.sin((Math.PI * (n[0] * X + n[1] * u + n[2] * h)) / per);
}
// simplificación (Douglas-Peucker) de un trazo abierto en mm
function simple(P, tol = 0.02) {
  if (P.length < 3) return P;
  const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
  const dp = (i0, i1) => {
    let dmax = 0, im = -1; const [ax, ay] = P[i0], [bx, by] = P[i1], ex = bx - ax, ey = by - ay, l = Math.hypot(ex, ey) || 1e-9;
    for (let i = i0 + 1; i < i1; i++) { const d = Math.abs((P[i][0] - ax) * ey - (P[i][1] - ay) * ex) / l; if (d > dmax) { dmax = d; im = i; } }
    if (dmax > tol) { keep[im] = 1; dp(i0, im); dp(im, i1); }
  };
  dp(0, P.length - 1);
  return P.filter((_, i) => keep[i]);
}
const largoTrazo = P => P.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]) : 0), 0);

// suavizado leve y simplificación (Douglas-Peucker) de un lazo cerrado en mm
function prolijo(P, tol = 0.02) {
  const n = P.length; if (n < 4) return P;
  const S = P.map((p, i) => { const a = P[(i - 1 + n) % n], b = P[(i + 1) % n]; return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4]; });
  const dp = (A, i0, i1, keep) => {
    let dmax = 0, im = -1; const [ax, ay] = A[i0], [bx, by] = A[i1], ex = bx - ax, ey = by - ay, l = Math.hypot(ex, ey) || 1e-9;
    for (let i = i0 + 1; i < i1; i++) { const d = Math.abs((A[i][0] - ax) * ey - (A[i][1] - ay) * ex) / l; if (d > dmax) { dmax = d; im = i; } }
    if (dmax > tol) { keep[im] = 1; dp(A, i0, im, keep); dp(A, im, i1, keep); }
  };
  const A = [...S, S[0]], keep = new Uint8Array(A.length); keep[0] = keep[A.length - 1] = 1;
  const mid = Math.floor(A.length / 2); keep[mid] = 1; dp(A, 0, mid, keep); dp(A, mid, A.length - 1, keep);
  return A.filter((_, i) => keep[i]).slice(0, -1);
}
const largoLazo = P => P.reduce((s, p, i) => s + Math.hypot(P[(i + 1) % P.length][0] - p[0], P[(i + 1) % P.length][1] - p[1]), 0);

// ---- G-code ----
// piezas = [{ g (plantilla generada: x, y, z, zb, ns, nr; talón en y menor, dedos en y mayor), nombre }], en el orden
// en que salen en la cinta. op = valores de CINTA_FABRICA a cambiar, más { capas: true } para devolver los recorridos
// (vista previa), { hastaCapa } para cortar antes (pruebas), { hastaMm } para imprimir solo los primeros mm de cinta
// (pieza chica de prueba, 2026-11-23).
export function gcodeCinta(piezas, op = {}) {
  const C = { ...CINTA_FABRICA, ...op, F: { ...CINTA_FABRICA.F, ...op.F } };
  const sn = Math.sin((C.angulo * Math.PI) / 180), cs = Math.cos((C.angulo * Math.PI) / 180), A = Math.PI * (C.filamento / 2) ** 2;
  const avisos = [];
  // lugar en la cinta: una detrás de otra, la punta primero, con `separacion` mm entre el talón de una y la punta de la otra
  let b = 0; const P = [];
  for (const [n, p] of piezas.entries()) {
    const m = mapaPieza(p.g);
    if (m.ancho + 2 * C.linea > C.ancho - 10) avisos.push(`${p.nombre ?? 'Plantilla ' + (n + 1)}: mide ${m.ancho.toFixed(0)} mm de ancho y la cinta imprime ${C.ancho} mm.`);
    if (m.hmax / sn > C.alto - 5) avisos.push(`${p.nombre ?? 'Plantilla ' + (n + 1)}: es demasiado alta para el cabezal inclinado.`);
    P.push({ m, b0: b, nombre: p.nombre ?? `plantilla ${n + 1}`, id: n }); b += m.largo + C.separacion;
  }
  // de la cinta (X, s) a la plantilla: x = medio − (X − centro); y = punta − (b − b0). Es un giro de 180° (no un
  // espejo): la punta sale primero y el lado interno del pie derecho queda en X menor, como en la referencia.
  const L = [], capas = [];
  let e = 0, x = 0, y = 0, z = 0, t = 0, largoTotal = 0;   // t = segundos
  const mover = (X, Y, F) => { t += Math.hypot(X - x, Y - y) / (F / 60); x = X; y = Y; };
  const retraer = () => L.push(`G1 F${C.F.retraer} E${f4(e - C.retraccion)}`);
  const volver = () => L.push(`G1 F${C.F.volver} E${f4(e)}`);
  // inicio del perfil (sin cama caliente: así viene la configuración final)
  // cabecera como la de ideaMaker (2026-11-23: sin "Dimension" ni los datos de la cinta, la vista previa de ideaMaker
  // dibujaba las plantillas fuera de la máquina). Los valores de la cinta son los del G-code de referencia; la
  // impresora no los usa (son comentarios). Base Y y Offset Z en 0: con los del G-code de referencia (17194 / 8597, que
  // dependen de dónde estaba la pieza en ideaMaker) la vista previa la dibujaba lejos del inicio de la cinta.
  L.push(`;Sliced by Programa Plantillas Lima Blue (laminador de cinta BETA) ${new Date().toISOString()}`,
    `;Dimension: ${C.ancho.toFixed(3)} 30000.000 ${C.alto.toFixed(3)} ${C.linea.toFixed(3)}`, ';Plate Shape: 0', ';Origin Center: 0', ';Belt Printer: 1',
    ';Belt Base Y: 0.000', ';Belt Base Z: 0.010', ';Belt Offset Y: 0.000', ';Belt Offset Z: 0.000', `;Belt Gantry Angle: ${C.angulo}`,
    ';Belt Remove Z: 0.000', ';Belt Repetition: 1', ';Extruder Offset #1: 25.000 0.000', `;Filament Diameter #1: ${C.filamento.toFixed(3)}`,
    `;Filament Compensation #1: ${C.flujo.toFixed(3)}`, ';Filament Type #1: TPU FOAM', `;Printer Type: ${C.nombre}`, ';Firmware: RepRapFirmware',
    ';Bounding Box: @CAJA@', ';Model Gap: 0.000', `;TOTAL_NUM: ${P.length}`,
    `M221 T0 S${C.flujo.toFixed(2)}`, `M104 T0 S${C.temp.toFixed(2)}`, `M109 T0 S${C.temp.toFixed(2)}`, 'T0', 'G28 X Y ; Home X and Y axis',
    'G92 Z0.000 ; Reset Z axes to zero', 'G92 E0 ; Reset E axes to zero', 'G1 E10 F800 ; Extruder 10 mm material',
    'G1 X10.00 Y1.000 F5000 ;Position to prepare the nozzle', 'G92 E0 ; Reset E axes to zero', 'G1 Z5 E5 F100 ; Move belt and Extruder 20mm material',
    'G92 Z0.000 E0.000 ; Reset Z and E axes to zero', '//Start', ';end of Start GCode');
  x = 10; y = 1;
  const c = C.celda, total = b - C.separacion;
  const zFin = total + (Math.max(...P.map(p => p.m.hmax)) / sn) * cs + C.paso;
  let k = 0, zk = 2 * C.paso, nCapa = 0;
  // hastaMm: solo los primeros mm de cinta (pieza chica de prueba: la punta de la primera plantilla)
  for (; zk <= zFin && zk <= (op.hastaMm ?? Infinity) && k < (op.hastaCapa ?? Infinity); k++, zk += C.paso) {
    // primera = la primera capa que lleva plástico (si las de antes salen vacías, la punta todavía no llegó a la cinta)
    if (op.progreso && k % 25 === 0) op.progreso(Math.min(1, zk / Math.min(zFin, op.hastaMm ?? Infinity)));
    const primera = nCapa === 0, paso = k === 0 ? 2 * C.paso : C.paso, esp = paso * sn, zm = zk - paso / 2;
    // piezas que toca este plano y franja de Y
    const act = P.filter(p => zm >= p.b0 && zm - (p.m.hmax / sn + 1) * cs <= p.b0 + p.m.largo);
    if (!act.length) continue;
    let s0 = Infinity, s1 = 0, X0 = Infinity, X1 = -Infinity;
    for (const p of act) {
      s0 = Math.min(s0, Math.max(0, (zm - p.b0 - p.m.largo) / cs)); s1 = Math.max(s1, Math.min(p.m.hmax / sn + 1, (zm - p.b0) / cs));
      X0 = Math.min(X0, C.centroX - p.m.ancho / 2 - 2); X1 = Math.max(X1, C.centroX + p.m.ancho / 2 + 2);
    }
    s0 = Math.max(0, s0 - 1);
    // grilla con un borde de afuera alrededor
    const nx = Math.ceil((X1 - X0) / c) + 3, ny = Math.ceil((s1 - s0) / c) + 3, dentro = new Uint8Array(nx * ny);
    const Xc = i => X0 + (i - 1) * c, Sc = j => s0 + (j - 1) * c;
    let alguno = false;
    for (let j = 1; j < ny - 1; j++) {
      const s = Sc(j), h = s * sn, bb = zm - s * cs; if (s < 0) continue;
      for (const p of act) {
        const yy = p.m.ytoe - (bb - p.b0); if (yy < p.m.y0 || yy > p.m.y1) continue;
        for (let i = 1; i < nx - 1; i++) { const k2 = j * nx + i; if (dentro[k2]) continue; if (adentro(p.m, p.m.xmid - (Xc(i) - C.centroX), yy, h)) { dentro[k2] = 1; alguno = true; } }
      }
    }
    if (!alguno) continue;
    const D = distancia(dentro, nx, ny), aMm = ([i, j]) => [Xc(i), Sc(j)];
    const anchoL = primera ? C.primera : C.linea;
    const niveles = [];   // [nivel en celdas, tipo, ancho, flujo]
    // paredes (2026-11-23, Ernesto: la cantidad se elige en Máquinas): de adentro hacia afuera, la exterior al final
    const nParedes = Math.max(1, Math.round(C.paredes ?? 2));
    for (let w = nParedes - 1; w >= 1; w--) niveles.push([(anchoL / 2 + w * anchoL) / c, 'WALL-INNER', anchoL, 1]);
    niveles.push([(anchoL / 2) / c, 'WALL-OUTER', anchoL, 1]);
    // relleno concéntrico: su flujo y su separación también se eligen (flujo 0 = sin relleno)
    const patron = C.tipoRelleno === 'giroide' || C.tipoRelleno === 'cubico';
    if (C.flujoRelleno > 0 && !patron) for (let d = nParedes * anchoL + C.pasoRelleno / 2; d < 200; d += C.pasoRelleno) niveles.push([d / c, 'FILL', C.pasoRelleno, C.flujoRelleno]);
    // giroide / cúbico (2026-11-24): curvas 0 de un campo fijo a la plantilla (u = lugar en la cinta), solo donde hay
    // interior (las líneas pisan un 15 % la última pared, para que se peguen)
    const rellenoPatron = [];
    if (C.flujoRelleno > 0 && patron) {
      // separación medida para que el relleno lleve el mismo plástico que el concéntrico con igual % (plantilla de 240 mm)
      const borde = (nParedes - 0.15) * anchoL / c, per = (C.tipoRelleno === 'giroide' ? 2.4 : 2.3) * anchoL / C.flujoRelleno;
      for (let fam = 0; fam < (C.tipoRelleno === 'giroide' ? 1 : 3); fam++) {
        const V = new Float32Array(nx * ny);
        for (let j = 0; j < ny; j++) { const s = Sc(j), h = s * sn, u = zm - s * cs;
          for (let i = 0; i < nx; i++) { const k2 = j * nx + i; V[k2] = D[k2] >= borde ? campoRelleno(C.tipoRelleno, fam, per, Xc(i), u, h) : NaN; } }
        for (const T of trazos(V, nx, ny, 0)) { const P = simple(T.map(aMm)); if (largoTrazo(P) > 1) rellenoPatron.push(P); }
      }
    }
    let maxD = 0; for (const v of D) if (v > maxD) maxD = v;
    // cabecera de la capa
    const t0 = t, Lc = [], recorridos = [];
    Lc.push(`;LAYER:${nCapa++}`, `;Z:${f3(zk)}`, `;HEIGHT:${f3(paso)}`, `;HEIGHT-BELT:${f3(esp)}`, `;PRINTING: ${act.map(p => p.nombre).join(' + ')}`);
    Lc.push(`G1 F${C.F.retraer} E${f4(e - C.retraccion)}`, `G0 F${C.F.z} Z${f3(zk)}`); z = zk;
    let retraido = true, hubo = false;
    for (const [nivel, tipo, ancho, flujo] of niveles) {
      if (nivel >= maxD) continue;   // (no "break": en una parte angosta igual va la pared exterior)
      let Ls = lazos(D, nx, ny, nivel).map(Q => prolijo(Q.map(aMm))).filter(Q => Q.length >= 3 && largoLazo(Q) > 1.5);
      if (!Ls.length) continue;
      hubo = true;
      Lc.push(`;TYPE:${tipo}`, `;WIDTH:${ancho.toFixed(3)}`, `;FLOW:${(flujo * 100).toFixed(1)}`);
      // el lazo más cercano primero, empezando en su punto más cercano
      while (Ls.length) {
        let mejor = 0, im = 0, dm = Infinity;
        Ls.forEach((Q, qi) => Q.forEach(([qx, qy], ii) => { const dd = Math.hypot(qx - x, qy - y); if (dd < dm) { dm = dd; mejor = qi; im = ii; } }));
        const Q = Ls.splice(mejor, 1)[0], R = [...Q.slice(im), ...Q.slice(0, im)];
        if (!retraido && Math.hypot(R[0][0] - x, R[0][1] - y) > 1) { Lc.push(`G1 F${C.F.retraer} E${f4(e - C.retraccion)}`); retraido = true; }
        Lc.push(`G0 F${C.F.viaje} X${f3(R[0][0])} Y${f3(R[0][1])}`); mover(R[0][0], R[0][1], C.F.viaje);
        if (retraido) { Lc.push(`G1 F${C.F.volver} E${f4(e)}`); retraido = false; }
        const F = primera ? C.F.primera : tipo === 'WALL-OUTER' ? C.F.exterior : tipo === 'WALL-INNER' ? C.F.interior : C.F.relleno;
        const camino = [...R, R[0]];
        for (let q = 1; q < camino.length; q++) {
          const [px, py] = camino[q], l = Math.hypot(px - x, py - y); if (l < 1e-4) continue;
          e += (ancho * esp * l * flujo) / A; largoTotal += l;
          Lc.push(`G1${q === 1 ? ` F${F}` : ''} X${f3(px)} Y${f3(py)} E${f4(e)}`); mover(px, py, F);
        }
        if (op.capas) recorridos.push({ tipo, pts: camino });
        // limpieza: al cerrar la pared exterior, 1 mm más sobre el mismo recorrido sin extruir
        if (tipo === 'WALL-OUTER' && R.length > 1) {
          Lc.push(`G1 F${C.F.retraer} E${f4(e - C.retraccion)}`); retraido = true;
          let resto = C.limpieza;
          for (let q = 1; q < camino.length && resto > 0; q++) {
            const [ax, ay] = camino[q - 1], [bx, by] = camino[q], l = Math.hypot(bx - ax, by - ay), u = Math.min(1, resto / (l || 1));
            const px = ax + u * (bx - ax), py = ay + u * (by - ay); Lc.push(`G0 F${C.F.limpiar} X${f3(px)} Y${f3(py)} ;WIPE`); mover(px, py, C.F.limpiar); resto -= l;
          }
        }
      }
    }
    // relleno giroide / cúbico: trazos abiertos, el más cercano primero (por la punta que quede más cerca); viajes
    // cortos (hasta 3 mm, por adentro) sin retraer
    if (rellenoPatron.length && hubo) {
      Lc.push(';TYPE:FILL', `;WIDTH:${anchoL.toFixed(3)}`, ';FLOW:100.0');
      const F = primera ? C.F.primera : C.F.relleno, Ls = rellenoPatron;
      while (Ls.length) {
        let mejor = 0, alReves = false, dm = Infinity;
        Ls.forEach((Q, qi) => { const a = Math.hypot(Q[0][0] - x, Q[0][1] - y), b = Math.hypot(Q[Q.length - 1][0] - x, Q[Q.length - 1][1] - y);
          if (a < dm) { dm = a; mejor = qi; alReves = false; } if (b < dm) { dm = b; mejor = qi; alReves = true; } });
        const R = Ls.splice(mejor, 1)[0]; if (alReves) R.reverse();
        if (!retraido && dm > 3) { Lc.push(`G1 F${C.F.retraer} E${f4(e - C.retraccion)}`); retraido = true; }
        Lc.push(`G0 F${C.F.viaje} X${f3(R[0][0])} Y${f3(R[0][1])}`); mover(R[0][0], R[0][1], C.F.viaje);
        if (retraido) { Lc.push(`G1 F${C.F.volver} E${f4(e)}`); retraido = false; }
        for (let q = 1; q < R.length; q++) {
          const [px, py] = R[q], l = Math.hypot(px - x, py - y); if (l < 1e-4) continue;
          e += (anchoL * esp * l) / A; largoTotal += l;
          Lc.push(`G1${q === 1 ? ` F${F}` : ''} X${f3(px)} Y${f3(py)} E${f4(e)}`); mover(px, py, F);
        }
        if (op.capas) recorridos.push({ tipo: 'FILL', pts: R });
      }
    }
    if (!hubo) { nCapa--; t = t0; continue; }   // capa sin nada que imprimir: no se escribe
    // ventilador: capas cortas, más aire (30 % a 60 %, como el perfil)
    const dur = t - t0, fan = Math.round(dur <= 8 ? 153 : dur >= 40 ? 77 : 153 - ((dur - 8) / 32) * 76);
    L.push(Lc[0], Lc[1], Lc[2], Lc[3], Lc[4], `M106 S${fan}`, ...Lc.slice(5));
    if (primera) L.splice(L.length - Lc.length + 5 + 1, 0, 'M204 T250.00', 'M566 X300.00 Y300.00');
    if (op.capas) capas.push({ z: zk, esp, recorridos });
  }
  // final del perfil
  L.push('M106 S0', `G1 F${C.F.retraer} E${f4(e - C.retraccion)}`, `G0 F${C.F.z} Z${f3(z + 4.1)}`, 'M221 T0 S100', 'G92 E0', ';End GCode',
    'M104 T0 S0', 'M300 S2000 P1000 ;Emits a beep', '//Stop', 'M104 S60 T0 ; Extruder Temperature to 60', 'M140 S30 ; Bed temperature to 30',
    'G28 X Y ; Home X and Y axis', 'G92 Z0.000 ; Reset Z axes to zero', 'G92 E0 ; Reset E axes to zero', 'G4 S5 ; Pause for 5 seconds',
    'M84 ; Disable motors', 'M106 S127 ; Fan speed half', 'G4 S90 ; Pause for 30 seconds', 'M107 ; Fan Off',
    `;Print Time: ${Math.round(t)}`, `;Material#1 Used: ${(e * C.flujo / 100).toFixed(1)}`);
  // caja de lo impreso (X, Y, Z) para la cabecera
  { let a = Infinity, b2 = -Infinity, c2 = Infinity, d2 = -Infinity, zz = 0, cx = 0, cy = 0;
    for (const l of L) { const m1 = l.match(/^G[01] .*X(-?[\d.]+) Y(-?[\d.]+)/); if (m1) { cx = +m1[1]; cy = +m1[2]; } if (/^G1 .*X.*E/.test(l)) { a = Math.min(a, cx); b2 = Math.max(b2, cx); c2 = Math.min(c2, cy); d2 = Math.max(d2, cy); }
      const m2 = l.match(/^G0 F\d+ Z([\d.]+)/); if (m2) zz = Math.max(zz, +m2[1]); }
    const i = L.indexOf(';Bounding Box: @CAJA@'); if (i >= 0) L[i] = `;Bounding Box: ${f3(a)} ${f3(b2)} ${f3(Math.max(0, c2 - C.linea / 2))} ${f3(d2)} 0.000 ${f3(zz)}`; }
  const texto = L.join('\n') + '\n';
  return { texto, avisos, capas: op.capas ? capas : null, numCapas: nCapa, piezas: P.map(p => ({ nombre: p.nombre, b0: p.b0, largo: p.m.largo, ancho: p.m.ancho, alto: p.m.hmax })),
    segundos: t, filamento: (e * C.flujo) / 100, gramos: ((e * C.flujo) / 100) * A * (C.densidad ?? 710) / 1e6, largoCinta: z, lineas: L.length };   // filamento en mm, con el flujo del 70 % (como ideaMaker)
}
