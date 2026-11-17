// Muestra 2D (PNG que sale de muestra_a_png.ps1, con regla de 100 mm, o el escaneo de una plantilla): busca el
// contorno cerrado, lo mide y da cómo ponerlo debajo de la plantilla o usarlo como borde. Ejes como la plantilla:
// Y a lo largo (talón → dedos), X a lo ancho (en el pie izquierdo el lado interno hacia +X), en mm.

// Píxeles por mm: del nombre del archivo ("_200dpi") o de la resolución guardada en el PNG (bloque pHYs).
export function escalaPNG(buf, nombre = '') {
  const m = /_(\d{2,4})dpi/i.exec(nombre);
  if (m) return +m[1] / 25.4;
  const dv = new DataView(buf);
  for (let p = 8; p + 12 <= buf.byteLength;) {
    const largo = dv.getUint32(p), tipo = String.fromCharCode(dv.getUint8(p + 4), dv.getUint8(p + 5), dv.getUint8(p + 6), dv.getUint8(p + 7));
    if (tipo === 'pHYs' && dv.getUint8(p + 16) === 1) return dv.getUint32(p + 8) / 1000;   // píxeles por metro → por mm
    if (tipo === 'IDAT' || tipo === 'IEND') break;
    p += 12 + largo;
  }
  return null;
}

// Analiza la imagen (ImageData) con `ppmm` píxeles por mm.
// 1) Tinta en celdas de ~0,5 mm: de color (lapicero, aunque sea muy tenue), oscura (lápiz, lapicero negro) o, si
//    es la foto de una plantilla, la zona llena de color. La regla de 100 mm se borra.
// 2) Se cierran los huecos del trazo con un radio que crece de a poco (0,5 a 8 mm) hasta que el trazo encierra
//    una zona del tamaño de un pie. Las notas escritas adentro quedan dentro de la zona; las de afuera, no.
// 3) Se vuelve a achicar lo que se engordó: el borde queda en el trazo.
// Devuelve medidas, el lado del pie, el contorno (como pie izquierdo) y cómo pasar un píxel a mm orientados.
export function analizarMuestra(img, ppmm, op = {}) {
  const { width: W, height: H, data } = img, paso = Math.max(1, Math.round(ppmm / 2)), cel = paso / ppmm;
  const nx = Math.ceil(W / paso), ny = Math.ceil(H / paso);
  // gris = lápiz o lapicero gastado (más claro que la tinta oscura, sin color)
  const color = new Uint8Array(nx * ny), oscuro = new Uint8Array(nx * ny), foto = new Uint8Array(nx * ny), gris = new Uint8Array(nx * ny);
  let nFoto = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    let c = 0, o = 0, gr = 0, sSat = 0, n = 0;
    for (let b = 0; b < paso; b++) for (let a = 0; a < paso; a++) {
      const x = i * paso + a, y = j * paso + b; if (x >= W || y >= H) continue;
      const k = 4 * (y * W + x), r = data[k], g = data[k + 1], bl = data[k + 2];
      const lum = 0.3 * r + 0.59 * g + 0.11 * bl, sat = Math.max(r, g, bl) - Math.min(r, g, bl);
      if (sat > 7 && lum < 248) c = 1; if (lum < 150) o = 1; if (lum < 205) gr = 1; sSat += sat; n++;
    }
    const s = j * nx + i; color[s] = c; oscuro[s] = o; gris[s] = gr;
    if (n && sSat / n > 28) { foto[s] = 1; nFoto++; }
  }
  quitarRegla(oscuro, color, nx, ny, cel, gris);
  const intentos = nFoto > 0.05 * nx * ny ? [['foto', foto]] : [['color', color], ['oscura', oscuro], ['gris', gris]];
  let zona = null, rmm = 0, tipo = '', tintaUsada = null, mejor = null;
  for (const radio of [0.5, 1, 1.5, 2.5, 4, 6, 8, 10, 12]) {
    for (const [nombre, tinta] of intentos) {
      const r = Math.max(1, Math.round(radio / cel)), t = dilatar(tinta, nx, ny, r);
      const grande = mayorEncerrada(t, nx, ny);
      if (!grande) continue;
      const area = grande.length * cel * cel;
      let nTinta = 0; for (const c of grande) nTinta += t[c];
      // tamaño de pie (8000 a 60000 mm²) y con interior: no solo el trazo engordado (salvo la foto, toda llena)
      const libre = (grande.length - nTinta) * cel * cel;   // mm² de interior sin tinta
      if (op.depurar) op.depurar.push(`${radio} mm ${nombre}: ${Math.round(area)} mm², libre ${Math.round(libre)} mm²`);
      if (!(area > 8000 && area < 60000 && (nombre === 'foto' || libre > 2000))) continue;
      mejor = { grande, r, radio, nombre, tinta }; break;
    }
    if (mejor) break;
  }
  if (!mejor) throw new Error('no se encontró el contorno cerrado de la muestra en la imagen');
  {
    const z = new Uint8Array(nx * ny); for (const c of mejor.grande) z[c] = 1;
    // se achica lo que se engordó: queda en el borde de afuera del trazo (en los huecos del trazo queda una
    // entrada redonda, que se arregla más abajo)
    zona = erosionar(z, nx, ny, mejor.r); rmm = mejor.radio; tipo = mejor.nombre; tintaUsada = mejor.tinta;
  }
  // limpieza: primero se quitan puntas finas de 2 mm (manchitas o la cola del trazo que sale del contorno) y
  // después se tapan muescas de hasta 3 mm de radio (no toca curvas grandes como la del arco)
  const rc = Math.max(1, Math.round(3 / cel)), rl = Math.max(1, Math.round(2 / cel));
  zona = dilatar(erosionar(zona, nx, ny, rl), nx, ny, rl);
  zona = erosionar(dilatar(zona, nx, ny, rc), nx, ny, rc);
  // si quedó algún pedacito suelto (un número de la regla, una nota pegada), se queda solo la mancha más grande
  zona = mayorMancha(zona, nx, ny);

  // orientación por el eje largo de la zona (PCA)
  const P = []; for (let s = 0; s < zona.length; s++) if (zona[s]) { const i = s % nx, j = (s - i) / nx; P.push([(i + 0.5) * cel, -(j + 0.5) * cel]); }
  let mx = 0, my = 0; for (const [x, y] of P) { mx += x; my += y; } mx /= P.length; my /= P.length;
  let sxx = 0, syy = 0, sxy = 0; for (const [x, y] of P) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  let g = Math.PI / 2 - 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const girar = (L, ang) => L.map(([x, y]) => { const a = x - mx, b = y - my; return [a * Math.cos(ang) - b * Math.sin(ang), a * Math.sin(ang) + b * Math.cos(ang)]; });
  let Q = girar(P, g);
  const franja = (Q, f0, f1) => {
    let y0 = Infinity, y1 = -Infinity; for (const [, y] of Q) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    let lo = Infinity, hi = -Infinity;
    for (const [x, y] of Q) { const f = (y - y0) / (y1 - y0); if (f >= f0 && f <= f1) { lo = Math.min(lo, x); hi = Math.max(hi, x); } }
    return [lo, hi];
  };
  const ancho = (Q, f0, f1) => { const [a, b] = franja(Q, f0, f1); return b - a; };
  // los dedos son el extremo más ancho
  if (ancho(Q, 0.1, 0.3) > ancho(Q, 0.6, 0.8)) { g += Math.PI; Q = girar(P, g); }
  let y0 = Infinity, y1 = -Infinity; for (const [, y] of Q) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const centro = f => { const [a, b] = franja(Q, f - 0.03, f + 0.03); return (a + b) / 2; };
  // lado interno: el que más se mete en la parte media (la curva del arco) respecto del antepié
  const [mI, mD] = franja(Q, 0.35, 0.5), [aI, aD] = franja(Q, 0.65, 0.8), cm = centro(0.15);
  const entraIzq = (mI - aI) / Math.max(cm - aI, 1), entraDer = (aD - mD) / Math.max(aD - cm, 1);
  // punta: la parte más adelantada de la muestra queda corrida hacia el dedo gordo (lado interno)
  let sx = 0, n = 0; for (const [x, y] of Q) if ((y - y0) / (y1 - y0) > 0.97) { sx += x; n++; }
  const [pI, pD] = franja(Q, 0.75, 0.9), punta = ((n ? sx / n : 0) - (pI + pD) / 2) / Math.max(pD - pI, 1);
  // las dos pistas juntas (en 13 muestras coinciden siempre que las dos son claras; en botines o muestras rectas
  // el arco casi no se nota y decide la punta). Pie izquierdo: interno hacia +X (derecha).
  const arco = entraDer - entraIzq, voto = arco + 2 * punta;
  const lado = voto > 0 ? 'izq' : 'der', ladoDudoso = Math.abs(voto) < 0.08;
  const [fI, fD] = franja(Q, 0.6, 0.8), [tI, tD] = franja(Q, 0.08, 0.2);

  // contorno: borde de la zona recorrido en orden, orientado (talón en y = 0) y como pie izquierdo
  const espejo = lado === 'der' ? -1 : 1;
  let borde = bordeOrdenado(zona, nx, ny);
  if (tipo !== 'foto') borde = puentes(borde, distancia(tintaUsada, nx, ny), nx, 1.5 / cel);
  let contorno = girar(borde.map(([i, j]) => [(i + 0.5) * cel, -(j + 0.5) * cel]), g)
    .map(([x, y]) => [espejo * x, y - y0]);
  // Al centro del trazo (Ernesto, 2026-11-17; antes quedaba en el borde de afuera): se mide el grosor del trazo en la
  // imagen, cruzándolo en muchos puntos del borde, y el contorno se corre medio grosor hacia adentro. En la foto de
  // una plantilla (sin trazo) queda donde está.
  const grosor = tipo === 'foto' ? 0 : grosorTrazo(img, ppmm, borde, zona, nx, paso, tipo);
  if (grosor > 0) contorno = correrAdentro(contorno, grosor / 2);
  return {
    largo: y1 - y0 - grosor, ancho: fD - fI - grosor, anchoTalon: tD - tI - grosor, grosorTrazo: grosor,
    lado, ladoDudoso, pistas: { arco, punta }, ppmm, tinta: tipo, cierre: rmm, contorno,
    // de un píxel de la imagen a mm orientados (talón en y = 0); el centro de giro es (mx, my)
    aOrientado: (px, py) => {
      const x = px / ppmm - mx, y = -py / ppmm - my;
      return [x * Math.cos(g) - y * Math.sin(g), x * Math.sin(g) + y * Math.cos(g) - y0];
    },
    centro: f => centro(f), y0,
  };
}

// Grosor del trazo en mm (mediana): en uno de cada 4 puntos del borde de la zona se cruza el trazo en la imagen, a
// lo largo de la normal y de afuera hacia adentro, y se mide el tramo seguido con tinta (del mismo tipo con que se
// encontró el contorno). Los cruces que no encuentran tinta (huecos del trazo) o muy largos (una nota pegada) no cuentan.
function grosorTrazo(img, ppmm, borde, zona, nx, paso, tipo) {
  const { width: W, height: H, data } = img;
  const esTinta = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const k = 4 * (Math.round(y) * W + Math.round(x)), r = data[k], g = data[k + 1], b = data[k + 2];
    const lum = 0.3 * r + 0.59 * g + 0.11 * b, sat = Math.max(r, g, b) - Math.min(r, g, b);
    return tipo === 'color' ? sat > 7 && lum < 248 : tipo === 'oscura' ? lum < 150 : lum < 205;
  };
  const enZona = (i, j) => { const a = Math.round(i), b = Math.round(j); return a >= 0 && b >= 0 && a < nx && zona[b * nx + a] === 1; };
  const n = borde.length, medidas = [], maxPx = 4 * ppmm;
  for (let k = 0; k < n; k += 4) {
    const [i0, j0] = borde[(k - 3 + n) % n], [i1, j1] = borde[(k + 3) % n], [ic, jc] = borde[k];
    let tx = i1 - i0, ty = j1 - j0; const l = Math.hypot(tx, ty); if (!l) continue; tx /= l; ty /= l;
    let nxv = -ty, nyv = tx;
    if (!enZona(ic + 2 * nxv, jc + 2 * nyv)) { nxv = -nxv; nyv = -nyv; }   // normal hacia adentro de la zona
    // de 2 celdas afuera hacia adentro, medio píxel por paso
    const cx = (ic + 0.5) * paso, cy = (jc + 0.5) * paso;
    let dentro = false, ini = 0, fin = 0, ok = false;
    for (let s = -2 * paso; s <= 2 * paso + maxPx; s += 0.5) {
      const t = esTinta(cx + nxv * s, cy + nyv * s);
      if (t && !dentro) { dentro = true; ini = s; }
      if (!t && dentro) { fin = s; ok = true; break; }
    }
    if (ok && fin - ini >= 0.5 && fin - ini <= maxPx) medidas.push((fin - ini) / ppmm);
  }
  if (medidas.length < 20) return 0;
  medidas.sort((a, b) => a - b);
  return Math.min(medidas[medidas.length >> 1], 3);
}
// Corre un contorno cerrado (puntos en mm) `d` mm hacia adentro, por la normal de cada punto (contornos suaves).
function correrAdentro(P, d) {
  const n = P.length; let area = 0;
  for (let i = 0; i < n; i++) { const [a, b] = P[i], [c, e] = P[(i + 1) % n]; area += a * e - c * b; }
  const s = area > 0 ? 1 : -1;   // antihorario: la izquierda de la marcha es adentro
  return P.map((p, i) => {
    const [x0, y0] = P[(i - 2 + n) % n], [x1, y1] = P[(i + 2) % n];
    let tx = x1 - x0, ty = y1 - y0; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
    return [p[0] - s * ty * d, p[1] + s * tx * d];
  });
}

// Contorno prolijo: quita los defectos del trazo (doble línea, una curva que se fue, un pedazo que entra o sale) sin
// cambiar la forma general de la muestra. Se compara el contorno con una versión suavizada; la diferencia (cuánto
// sale o entra en cada punto) se filtra con una mediana: lo que sale o entra en un tramo corto se borra y lo que
// dura (la curva del arco, la punta, el talón) se queda. Niveles: 'fiel' (sin cambios), 'prolijo', 'muy'.
export const NIVELES_BORDE = {
  fiel: null,
  prolijo: { base: 6, ventana: 24, suave: 3, pasadas: 2 },   // mm
  muy: { base: 9, ventana: 40, suave: 5, pasadas: 3 },
};
export function contornoProlijo(contorno, nivel = 'prolijo') {
  const k = NIVELES_BORDE[nivel]; if (!k) return contorno;
  let c = contorno; for (let i = 0; i < k.pasadas; i++) c = pasadaProlija(c, k);
  return c;
}
function pasadaProlija(contorno, k) {
  const N = 1024, P = repartirCerrado(contorno, N), ds = P.total / N;
  const gauss = (v, sig) => {
    const r = Math.ceil(3 * sig), w = []; for (let q = -r; q <= r; q++) w.push(Math.exp(-0.5 * (q / sig) ** 2));
    const sw = w.reduce((a, b) => a + b, 0);
    return v.map((_, i) => { let s = 0; for (let q = -r; q <= r; q++) s += w[q + r] * v[(i + q + N * 4) % N]; return s / sw; });
  };
  const X = P.pts.map(p => p[0]), Y = P.pts.map(p => p[1]);
  const SX = gauss(X, k.base / ds), SY = gauss(Y, k.base / ds);
  // normal hacia afuera o adentro (el signo da igual: se usa la misma para ir y volver)
  const nor = SX.map((_, i) => { const tx = SX[(i + 1) % N] - SX[(i - 1 + N) % N], ty = SY[(i + 1) % N] - SY[(i - 1 + N) % N], l = Math.hypot(tx, ty) || 1; return [ty / l, -tx / l]; });
  const d = X.map((x, i) => (x - SX[i]) * nor[i][0] + (Y[i] - SY[i]) * nor[i][1]);
  const m = Math.max(1, Math.round(k.ventana / ds / 2)), dm = d.map((_, i) => {
    const v = []; for (let q = -m; q <= m; q++) v.push(d[(i + q + N * 4) % N]); v.sort((a, b) => a - b); return v[m];
  });
  const df = gauss(dm, k.suave / ds);
  return SX.map((x, i) => [x + df[i] * nor[i][0], SY[i] + df[i] * nor[i][1]]);
}
function repartirCerrado(c, n) {
  const m = c.length, ac = [0];
  for (let i = 0; i < m; i++) { const [a, b] = c[i], [e, f] = c[(i + 1) % m]; ac.push(ac[i] + Math.hypot(e - a, f - b)); }
  const total = ac[m], pts = []; let q = 0;
  for (let k = 0; k < n; k++) {
    const s = (total * k) / n; while (q < m - 1 && ac[q + 1] < s) q++;
    const t = ac[q + 1] > ac[q] ? (s - ac[q]) / (ac[q + 1] - ac[q]) : 0, [a, b] = c[q], [e, f] = c[(q + 1) % m];
    pts.push([a + t * (e - a), b + t * (f - b)]);
  }
  return { pts, total };
}

// Contorno reducido para guardar en la receta: `n` puntos repartidos a lo largo del borde, con 0,1 mm.
export function contornoParaReceta(contorno, n = 360) {
  const m = contorno.length, ac = [0];
  for (let i = 0; i < m; i++) { const [a, b] = contorno[i], [c, d] = contorno[(i + 1) % m]; ac.push(ac[i] + Math.hypot(c - a, d - b)); }
  const total = ac[m], out = [];
  let q = 0;
  for (let k = 0; k < n; k++) {
    const s = (total * k) / n; while (q < m - 1 && ac[q + 1] < s) q++;
    const f = ac[q + 1] > ac[q] ? (s - ac[q]) / (ac[q + 1] - ac[q]) : 0, [a, b] = contorno[q], [c, d] = contorno[(q + 1) % m];
    out.push([Math.round((a + f * (c - a)) * 10) / 10, Math.round((b + f * (d - b)) * 10) / 10]);
  }
  return out;
}

function mayorMancha(m, nx, ny) {
  const visto = new Uint8Array(nx * ny), pila = []; let grande = [];
  for (let s = 0; s < m.length; s++) {
    if (!m[s] || visto[s]) continue;
    const celdas = []; pila.push(s); visto[s] = 1;
    while (pila.length) {
      const c = pila.pop(); celdas.push(c); const i = c % nx, j = (c - i) / nx;
      for (const n of [i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1, j > 0 ? c - nx : -1, j < ny - 1 ? c + nx : -1])
        if (n >= 0 && m[n] && !visto[n]) { visto[n] = 1; pila.push(n); }
    }
    if (celdas.length > grande.length) grande = celdas;
  }
  const out = new Uint8Array(nx * ny); for (const c of grande) out[c] = 1; return out;
}

// La zona más grande que no se alcanza desde el borde de la hoja sin cruzar tinta (interior + trazo).
function mayorEncerrada(t, nx, ny) {
  const fuera = new Uint8Array(nx * ny), pila = [];
  for (let i = 0; i < nx; i++) pila.push(i, (ny - 1) * nx + i);
  for (let j = 0; j < ny; j++) pila.push(j * nx, j * nx + nx - 1);
  while (pila.length) {
    const s = pila.pop(); if (fuera[s] || t[s]) continue; fuera[s] = 1; const i = s % nx, j = (s - i) / nx;
    if (i > 0) pila.push(s - 1); if (i < nx - 1) pila.push(s + 1); if (j > 0) pila.push(s - nx); if (j < ny - 1) pila.push(s + nx);
  }
  const visto = new Uint8Array(nx * ny); let grande = null;
  for (let s = 0; s < nx * ny; s++) {
    if (fuera[s] || visto[s]) continue;
    const celdas = []; pila.push(s); visto[s] = 1;
    while (pila.length) {
      const c = pila.pop(); celdas.push(c); const i = c % nx, j = (c - i) / nx;
      for (const n of [i > 0 ? c - 1 : -1, i < nx - 1 ? c + 1 : -1, j > 0 ? c - nx : -1, j < ny - 1 ? c + nx : -1])
        if (n >= 0 && !fuera[n] && !visto[n]) { visto[n] = 1; pila.push(n); }
    }
    if (!grande || celdas.length > grande.length) grande = celdas;
  }
  return grande;
}

// Huecos del trazo: los puntos del borde que no tienen tinta cerca (a más de `lejos` celdas) son el cierre
// automático, que entra redondo hacia adentro. Cada tramo así se cambia por una curva suave (Hermite) entre los
// puntos con tinta de cada lado, siguiendo la dirección que traía el trazo.
function puentes(borde, dT, nx, lejos) {
  const n = borde.length, con = borde.map(([i, j]) => dT[j * nx + i] <= lejos);
  if (con.every(Boolean) || !con.some(Boolean)) return borde;
  const out = borde.map(p => [...p]);
  let k0 = con.indexOf(true);
  // recorrer desde un punto con tinta, buscando tramos sin tinta
  for (let paso = 0; paso < n;) {
    const k = (k0 + paso) % n;
    if (con[k]) { paso++; continue; }
    let largo = 0; while (largo < n && !con[(k + largo) % n]) largo++;
    const a = (k - 1 + n) % n, b = (k + largo) % n;
    if (largo < n / 4) {
      // dirección del trazo a cada lado (de 6 puntos atrás / adelante)
      const atras = borde[(a - 6 + n) % n], adel = borde[(b + 6) % n], A = borde[a], B = borde[b];
      const cuerda = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const ta = [A[0] - atras[0], A[1] - atras[1]], tb = [adel[0] - B[0], adel[1] - B[1]];
      const la = Math.hypot(...ta) || 1, lb = Math.hypot(...tb) || 1;
      const m0 = [ta[0] / la * cuerda, ta[1] / la * cuerda], m1 = [tb[0] / lb * cuerda, tb[1] / lb * cuerda];
      for (let q = 1; q <= largo; q++) {
        const u = q / (largo + 1), u2 = u * u, u3 = u2 * u;
        const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
        out[(k + q - 1) % n] = [h00 * A[0] + h10 * m0[0] + h01 * B[0] + h11 * m1[0], h00 * A[1] + h10 * m0[1] + h01 * B[1] + h11 * m1[1]];
      }
    }
    paso += largo;
  }
  return out;
}

// Borde de una zona (una sola mancha) recorrido en orden, celda por celda (vecinos de 8). Se queda con la mancha
// más grande por si la zona quedó con algún pedacito suelto.
function bordeOrdenado(zona, nx, ny) {
  const en = (i, j) => i >= 0 && j >= 0 && i < nx && j < ny && zona[j * nx + i] === 1;
  let s0 = -1; for (let s = 0; s < zona.length && s0 < 0; s++) if (zona[s]) s0 = s;
  const i0 = s0 % nx, j0 = (s0 - i0) / nx;
  // vecinos en sentido horario empezando por el oeste
  const D = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
  const out = [[i0, j0]];
  let ci = i0, cj = j0, dir = 0;   // se entró desde el oeste (la celda de la izquierda está vacía)
  for (let pasos = 0; pasos < 4 * nx * ny; pasos++) {
    let hallado = false;
    for (let k = 0; k < 8; k++) {
      const d = (dir + k) % 8, ni = ci + D[d][0], nj = cj + D[d][1];
      if (en(ni, nj)) { ci = ni; cj = nj; dir = (d + 5) % 8; hallado = true; break; }
    }
    if (!hallado || (ci === i0 && cj === j0)) break;
    out.push([ci, cj]);
  }
  return out;
}

// La regla de 100 mm que pone muestra_a_png.ps1: una recta negra de ~100 mm con marcas y números. Se borra lo negro
// de su franja en todas las máscaras, para que no se pegue al contorno (el trazo del lapicero que pase cerca queda).
function quitarRegla(oscuro, color, nx, ny, cel, gris) {
  const visto = new Uint8Array(nx * ny);
  for (let s = 0; s < nx * ny; s++) {
    if (!oscuro[s] || visto[s]) continue;
    const pila = [s], celdas = []; visto[s] = 1;
    while (pila.length) {
      const c = pila.pop(); celdas.push(c); const i = c % nx, j = (c - i) / nx;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
        const n = jj * nx + ii; if (oscuro[n] && !visto[n]) { visto[n] = 1; pila.push(n); }
      }
    }
    let i0 = 1e9, i1 = -1, j0 = 1e9, j1 = -1;
    for (const c of celdas) { const i = c % nx, j = (c - i) / nx; i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
    const lx = (i1 - i0 + 1) * cel, ly = (j1 - j0 + 1) * cel, largo = Math.max(lx, ly), corto = Math.min(lx, ly);
    if (!(largo > 95 && largo < 106 && corto < 7)) continue;
    const m = Math.round(12 / cel), mc = Math.round(7 / cel), horiz = lx > ly;
    const a0 = Math.max(0, i0 - (horiz ? m : mc)), a1 = Math.min(nx - 1, i1 + (horiz ? m : mc + Math.round(14 / cel)));
    const b0 = Math.max(0, j0 - (horiz ? mc : m)), b1 = Math.min(ny - 1, j1 + (horiz ? mc : m));
    const borrar = [];
    for (let j = b0; j <= b1; j++) for (let i = a0; i <= a1; i++) {
      let cerca = 0;
      for (let dj = -1; dj <= 1 && !cerca; dj++) for (let di = -1; di <= 1; di++) {
        const ii = i + di, jj = j + dj;
        if (ii >= 0 && jj >= 0 && ii < nx && jj < ny && oscuro[jj * nx + ii]) { cerca = 1; break; }
      }
      if (cerca) borrar.push(j * nx + i);
    }
    // los números ("0" y "100 mm") tienen bordes de color (letra suavizada): en la máscara de color se borran solo
    // ahí, para no perder el trazo del lapicero que pase cerca de las rayas de la regla
    const mm = v => Math.round(v / cel), cajas = horiz
      ? [[i0 - mm(3), i0 + mm(3), j1 - mm(1), j1 + mm(6)], [i1 - mm(14), i1 + mm(3), j1 - mm(1), j1 + mm(6)]]
      : [[i0 + mm(3), i0 + mm(20), j0 - mm(3), j0 + mm(3)], [i0 + mm(3), i0 + mm(20), j1 - mm(3), j1 + mm(3)]];
    const enCaja = c => { const i = c % nx, j = (c - i) / nx; return cajas.some(([a, b, p, q]) => i >= a && i <= b && j >= p && j <= q); };
    for (const c of borrar) { oscuro[c] = 0; gris[c] = 0; if (enCaja(c)) color[c] = 0; }
  }
}

// Engordar y achicar con un círculo de radio r celdas (no un cuadrado: así los huecos del trazo se cierran con una
// curva suave y no dejan escalones). Usa la distancia de cada celda a la celda marcada más cercana.
function dilatar(m, nx, ny, r) {
  const d = distancia(m, nx, ny), out = new Uint8Array(nx * ny);
  for (let s = 0; s < out.length; s++) out[s] = d[s] <= r + 0.01 ? 1 : 0;
  return out;
}
function erosionar(m, nx, ny, r) {
  const inv = new Uint8Array(nx * ny); for (let s = 0; s < inv.length; s++) inv[s] = m[s] ? 0 : 1;
  const d = dilatar(inv, nx, ny, r); for (let s = 0; s < d.length; s++) d[s] = d[s] ? 0 : 1; return d;
}
// distancia euclídea exacta (en celdas) a la celda marcada más cercana: dos pasadas de Felzenszwalb
function distancia(m, nx, ny) {
  const INF = 1e12, f = new Float64Array(nx * ny);
  for (let s = 0; s < f.length; s++) f[s] = m[s] ? 0 : INF;
  const N = Math.max(nx, ny), z = new Float64Array(N + 1), v = new Int32Array(N), col = new Float64Array(N), res = new Float64Array(N);
  const pasada = (n) => {
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    const corte = (q, p) => ((col[q] + q * q) - (col[p] + p * p)) / (2 * q - 2 * p);
    for (let q = 1; q < n; q++) {
      let s = corte(q, v[k]);
      while (s <= z[k]) { k--; s = corte(q, v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
    }
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; const p = v[k]; res[q] = (q - p) * (q - p) + col[p]; }
  };
  for (let i = 0; i < nx; i++) { for (let j = 0; j < ny; j++) col[j] = f[j * nx + i]; pasada(ny); for (let j = 0; j < ny; j++) f[j * nx + i] = res[j]; }
  for (let j = 0; j < ny; j++) { for (let i = 0; i < nx; i++) col[i] = f[j * nx + i]; pasada(nx); for (let i = 0; i < nx; i++) f[j * nx + i] = res[i]; }
  for (let s = 0; s < f.length; s++) f[s] = Math.sqrt(f[s]);
  return f;
}
