// Motor de geometría de plantillas. No tiene pantalla: recibe una horma y los valores del diseño,
// y devuelve la malla, las medidas y el STL. Unidades en mm. Talón en Y = 0, dedos hacia +Y, base en Z = 0.
//
// La malla se arma en anillos: del contorno hacia una línea central (espina). Así el borde sigue una curva suave
// en todo el contorno, incluido el talón y la punta, y la cara de abajo se define por la distancia al borde.

const suave = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

// Media gaussiana de una lista. `ciclo` = la lista es cerrada (contorno). Si no, en los extremos se refleja;
// con `pendiente` el reflejo conserva la pendiente del borde en vez de aplanarlo.
function gauss(v, sigma, ciclo, pendiente = false) {
  const n = v.length, r = Math.max(1, Math.ceil(3 * sigma)), w = [], out = new Float64Array(n);
  for (let k = -r; k <= r; k++) w.push(Math.exp(-0.5 * (k / sigma) ** 2));
  const en = j => {
    if (ciclo) return v[((j % n) + n) % n];
    if (j < 0) { const q = Math.min(-j, n - 1); return pendiente ? 2 * v[0] - v[q] : v[q]; }
    if (j >= n) { const q = Math.max(2 * n - 2 - j, 0); return pendiente ? 2 * v[n - 1] - v[q] : v[q]; }
    return v[j];
  };
  for (let i = 0; i < n; i++) {
    let s = 0, sw = 0;
    for (let k = -r; k <= r; k++) { s += w[k + r] * en(i + k); sw += w[k + r]; }
    out[i] = s / sw;
  }
  return out;
}

// Curva por puntos [[t, valor], …] (t creciente) con tangentes monótonas (Fritsch–Carlson): pasa por cada punto
// sin pasarse entre ellos. Fuera de los puntos queda en el valor del extremo. Sin puntos = 1.
export function curvaPuntos(P) {
  if (!P?.length) return () => 1;
  const n = P.length, t = P.map(p => p[0]), v = P.map(p => p[1]);
  if (n === 1) return () => v[0];
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((v[i + 1] - v[i]) / (t[i + 1] - t[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i]);
  return x => {
    if (x <= t[0]) return v[0];
    if (x >= t[n - 1]) return v[n - 1];
    let i = 0; while (x > t[i + 1]) i++;
    const h = t[i + 1] - t[i], s = (x - t[i]) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * v[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * v[i + 1] + (s3 - s2) * h * m[i + 1];
  };
}

// Reparte una polilínea en n puntos a distancias iguales. `cerrada` = vuelve al primer punto.
function repartir(px, py, n, cerrada) {
  const m = px.length, tramos = cerrada ? m : m - 1, ac = new Float64Array(tramos + 1);
  for (let i = 0; i < tramos; i++) ac[i + 1] = ac[i] + Math.hypot(px[(i + 1) % m] - px[i], py[(i + 1) % m] - py[i]);
  const total = ac[tramos], x = new Float64Array(n), y = new Float64Array(n);
  let q = 0;
  for (let i = 0; i < n; i++) {
    const s = cerrada ? (total * i) / n : (total * i) / (n - 1);
    while (q < tramos - 1 && ac[q + 1] < s) q++;
    const f = ac[q + 1] > ac[q] ? (s - ac[q]) / (ac[q + 1] - ac[q]) : 0, a = q, b = (q + 1) % m;
    x[i] = px[a] + f * (px[b] - px[a]); y[i] = py[a] + f * (py[b] - py[a]);
  }
  return { x, y, total };
}

// Deja lista una horma de la biblioteca. `ref` = alturas nominales con que viene la horma (antepié y copa).
// De la horma salen dos cosas: el contorno (se suaviza como curva cerrada) y el relieve de la cara de arriba
// (se guarda normalizado, de 0 a 1 a lo largo y a lo ancho, y también suavizado).
export function prepararHorma(datos, ref, op = {}) {
  const nvH = datos.columnas, est = datos.estaciones;
  const [xT, yT, zT] = datos.puntaTalon, [xD, yD, zD] = datos.puntaDedos, largo = yD - yT;
  const filas = [{ y: yT, xi: xT, xd: xT, z: new Array(nvH).fill(zT) }, ...est, { y: yD, xi: xD, xd: xD, z: new Array(nvH).fill(zD) }];
  let ancho = 0;
  for (const f of filas) ancho = Math.max(ancho, f.xd - f.xi);

  // --- Contorno suave: talón, lado externo hacia los dedos, punta, lado interno de vuelta ---
  const bx = [xT], by = [yT];
  for (const f of est) { bx.push(f.xi); by.push(f.y); }
  bx.push(xD); by.push(yD);
  for (let i = est.length - 1; i >= 0; i--) { bx.push(est[i].xd); by.push(est[i].y); }
  const { cont, borde } = contornoSuave(bx, by, largo, ancho, op.suaveContorno ?? 3.5);

  // --- Relieve normalizado y suavizado ---
  const NT = 420, NVG = 121, H = [], rec = op.recorteBorde ?? 0.03;
  for (let i = 0; i < NT; i++) {
    const y = yT + (i / (NT - 1)) * largo;
    let p = 0, q = filas.length - 1;
    while (q - p > 1) { const m = (p + q) >> 1; if (filas[m].y <= y) p = m; else q = m; }
    const A = filas[p], B = filas[q], k = B.y > A.y ? (y - A.y) / (B.y - A.y) : 0, fila = new Float64Array(NVG);
    for (let c = 0; c < NVG; c++) {
      // se descarta una franja fina junto a cada borde: ahí la horma trae un labio plano, y sin él la copa
      // empieza a bajar desde el canto mismo, sin escalón
      const u = (rec + (c / (NVG - 1)) * (1 - 2 * rec)) * (nvH - 1), j = Math.min(Math.floor(u), nvH - 2), g = u - j;
      const za = A.z[j] + g * (A.z[j + 1] - A.z[j]), zb = B.z[j] + g * (B.z[j + 1] - B.z[j]);
      fila[c] = za + k * (zb - za);
    }
    H.push(fila);
  }
  const sv = (op.suaveAncho ?? 0.03) * (NVG - 1), st = (op.suaveLargo ?? 0.008) * (NT - 1);
  for (let i = 0; i < NT; i++) H[i] = gauss(H[i], sv, false, true);
  for (let c = 0; c < NVG; c++) {
    const col = new Float64Array(NT);
    for (let i = 0; i < NT; i++) col[i] = H[i][c];
    const s = gauss(col, st, false);
    for (let i = 0; i < NT; i++) H[i][c] = s[i];
  }
  // Relieve propio de otra horma (biblioteca de hormas, 2026-11-16): el relieve sobre el antepié se multiplica por un
  // factor a lo largo. `todo` = en todo el ancho; `interno` = además, solo hacia el lado interno (para la subida del
  // arco). Factores como [[fracción del largo, factor], …], unidos con una curva sin sobresaltos.
  // Ojo: en la punta del talón el ancho es casi cero y el lado interno y el externo se juntan: un factor `interno`
  // distinto de 1 ahí deja un escalón en el borde (pasó con la Crocs, 2026-11-16).
  if (op.relieve) {
    // `externo` (2026-11-17): igual que `interno` pero hacia el lado externo (para el borde de la copa)
    const fT = curvaPuntos(op.relieve.todo), fI = curvaPuntos(op.relieve.interno), fE = curvaPuntos(op.relieve.externo);
    let a0 = Infinity;
    for (const f of H) for (const z of f) a0 = Math.min(a0, z);
    for (let i = 0; i < NT; i++) {
      const t = i / (NT - 1), gT = fT(t), gI = fI(t), gE = fE(t);
      for (let c = 0; c < NVG; c++) {
        const v = c / (NVG - 1);
        const g = gT * (1 + (gI - 1) * suave((v - 0.35) / 0.5)) * (1 + (gE - 1) * suave((0.65 - v) / 0.5));
        H[i][c] = a0 + g * (H[i][c] - a0);
      }
    }
  }
  // alturas reales de la horma ya suavizada: copa = borde del talón (5 % a 20 % del largo), arco = punto más alto
  let suma = 0, n = 0, arco = 0, arcoPos = 0.4, antepie = Infinity;
  for (let i = 0; i < NT; i++) {
    const t = i / (NT - 1);
    // op.copaLado 'externo' (Crocs, Ernesto 2026-11-16): la copa es el borde externo, recto hasta el arco; el lado
    // interno sube desde el talón y no cuenta
    if (t > 0.05 && t < 0.2) { if (op.copaLado === 'externo') { suma += H[i][0]; n++; } else { suma += H[i][0] + H[i][NVG - 1]; n += 2; } }
    for (let c = 0; c < NVG; c++) { if (H[i][c] > arco) { arco = H[i][c]; arcoPos = t; } antepie = Math.min(antepie, H[i][c]); }
  }
  // Capas del relieve (Ernesto, 2026-11-19; como LutraCAD, comparado en sus vistas de costado): al subir la copa de 10 a
  // 14 el arco no cambia, y el arco sube o baja sin mover el talón. Antes las alturas se reescalaban según qué tan
  // alto estaba cada punto, y en una horma delgada puesta en estándar la subida del arco se levantaba con la copa
  // (quedaba una meseta desde el talón). Ahora, sobre el espesor del antepié:
  //   arco = lo que el lado interno sube por encima del lado externo en la misma fila (el lado externo reflejado);
  //   copa = el resto (bordes del talón, lado externo y antepié).
  // Cada capa se escala por su lado (ver alturasPorCapas).
  // La copa del lado interno es el lado externo reflejado, mezclado parejo en el centro del ancho (±15 %): así la
  // capa de la copa queda lisa (sin lomo en el centro) y copa + arco = horma exacta. Donde el interno es más bajo que
  // el externo (talón de la Crocs) la capa del arco queda negativa: es parte de la forma y se escala con ella.
  // (Probado 2026-11-19: apagar la capa del arco en el talón dejaba una loma al 10–15 % al subir la copa.)
  const RA = H.map(() => new Float64Array(NVG));
  for (let i = 0; i < NT; i++) for (let c = 0; c < NVG; c++) {
    const s = suave((c / (NVG - 1) - 0.35) / 0.3), copa = (1 - s) * H[i][c] + s * H[i][NVG - 1 - c];
    RA[i][c] = H[i][c] - copa;
  }
  // medidas de cada capa: copa (promedio del borde del 5 % al 20 %, como ref.copa) y en la cima del arco
  let cC = 0, cA = 0, iS = 0, jS = 0;
  const vC = [], vA = [], vT = [], vV = [];
  for (let i = 0; i < NT; i++) for (let c = 0; c < NVG; c++) if (H[i][c] > H[iS][jS]) { iS = i; jS = c; }
  for (let i = 0; i < NT; i++) {
    const t = i / (NT - 1); if (!(t > 0.05 && t < 0.2)) continue;
    for (const c of op.copaLado === 'externo' ? [0] : [0, NVG - 1]) {
      cA += RA[i][c]; cC += H[i][c] - antepie - RA[i][c];
      vC.push(H[i][c] - antepie - RA[i][c]); vA.push(RA[i][c]); vT.push(t); vV.push(c / (NVG - 1));
    }
  }
  cC /= n; cA /= n;
  // muestras de la zona del arco (del 10 % al 75 % del largo) para llevar el punto más alto justo al arco pedido
  const mC = [], mA = [], mT = [], mV = [];
  for (let i = Math.round(0.1 * (NT - 1)); i <= 0.75 * (NT - 1); i += 2) for (let c = 0; c < NVG; c += 2) {
    mC.push(H[i][c] - antepie - RA[i][c]); mA.push(RA[i][c]); mT.push(i / (NT - 1)); mV.push(c / (NVG - 1));
  }
  const capas = { copaC: cC, copaA: cA, cimaC: H[iS][jS] - antepie - RA[iS][jS], cimaA: RA[iS][jS], cimaT: iS / (NT - 1),
                  muestras: { c: Float64Array.from(mC), a: Float64Array.from(mA), t: Float64Array.from(mT), v: Float64Array.from(mV) },
                  copaMuestras: { c: Float64Array.from(vC), a: Float64Array.from(vA), t: Float64Array.from(vT), v: Float64Array.from(vV) } };
  // altura de la horma en un punto (x, y) del contorno suave. `yH` (opcional) = fila de la horma de donde se toma
  // el relieve, para correr el arco sin cambiar el contorno
  const leer = (G, x, y, yH) => {
    const [xi, xd] = borde(y), v = xd > xi ? Math.min(Math.max((x - xi) / (xd - xi), 0), 1) : 0.5;
    const qa = Math.min(Math.max(yH / largo, 0), 1) * (NT - 1), i = Math.min(Math.floor(qa), NT - 2), fa = qa - i;
    const qb = v * (NVG - 1), j = Math.min(Math.floor(qb), NVG - 2), fb = qb - j;
    const z0 = G[i][j] + fb * (G[i][j + 1] - G[i][j]), z1 = G[i + 1][j] + fb * (G[i + 1][j + 1] - G[i + 1][j]);
    return z0 + fa * (z1 - z0);
  };
  const altura = (x, y, yH = y) => leer(H, x, y, yH);
  // [capa copa, capa arco] en mm sobre el antepié de la horma, y la fracción del ancho (0 externo, 1 interno)
  const partes = (x, y, yH = y) => {
    const a = leer(RA, x, y, yH), [xi, xd] = borde(y), v = xd > xi ? Math.min(Math.max((x - xi) / (xd - xi), 0), 1) : 0.5;
    return [leer(H, x, y, yH) - antepie - a, a, v];
  };
  return { largo, ancho, cont, borde, altura, partes,
           ref: { antepie, copa: suma / n, copaNominal: ref.copa, antepieNominal: ref.antepie, arco, arcoPos, copaLado: op.copaLado, capas } };
}

// Copa y arco por capas (2026-11-19). La capa de la copa se escala para llegar a la copa pedida y la del arco para
// que la cima quede en el arco pedido, conservando su forma. El arco puede quedar más bajo que la copa; lo más bajo
// posible es sin capa de arco (ahí `arcoMin` dice hasta dónde llegó).
// Punto de partida: la horma con su copa aprobada (biblioteca: 10 en Crocs y Chimpunes, 13 en la Guía; Chimpunes y
// Crocs vienen guardadas más bajas, copa 6,6 y 7, y se aprobaron así escaladas). Sobre esa forma:
//  - copa: el cambio de copa es entero en el talón y se apaga hacia adelante. Lado externo: entero hasta el 40 % y
//    nada desde el 70 % (la copa recta de la Crocs llega al 38 %). Lado interno: nada desde el 40 %, antes de la cima.
//  - arco: del lado interno, todo lo que sube del 15 % al 65 % (la capa del arco y la parte de la copa que ya no es
//    talón) se escala junto para llegar al arco pedido. El talón, el lado externo y el antepié no cambian.
// Entre los dos lados se mezcla parejo en el centro del ancho, igual que las capas. Como LutraCAD: al subir la copa de
// 10 a 14 el arco no cambia ni se corre, y al cambiar el arco el talón queda igual.
// (Probado 2026-11-19: escalar la copa pareja en todo el largo bajaba antes el arco de la Guía en estándar, 2,6 mm;
// dejar la parte de la copa del medio pie fuera del arco corría la cima hasta 4 % al bajar la copa.)
const lado = v => suave((v - 0.35) / 0.3);
const antepieF = t => 1 - suave((t - 0.6) / 0.15);   // talon(t) va dentro de alturasPorCapas (depende de la horma)
const apagaExt = t => 1 - suave((t - 0.4) / 0.3);
export function alturasPorCapas(ref, p) {
  // 2026-11-19 (Ernesto, Chimpunes: "cuando aumento la copa el arco se va para atrás"): el cambio de copa del lado
  // interno se apagaba al 40 % del largo, pero en Chimpunes (cima al 35 %) y Crocs (38 %) eso es dentro del arco:
  // subía la parte de atrás de la subida y la cima se corría hasta 40 mm hacia el talón. Ahora se apaga 14 % del largo
  // antes de la cima de la horma (nunca después del 40 %); con copa 10, 14 y 18 la cima queda en su lugar.
  const N = ref.arcoPos ?? 0.4, fin = Math.min(0.40, N - 0.14), ini = Math.min(0.15, fin - 0.12);
  const talon = t => 1 - suave((t - ini) / (fin - ini));
  const K = ref.capas, S = K.muestras, V = K.copaMuestras, rc = ref.copa - ref.antepie, Rc = p.copa - p.antepie;
  const Ra = (p.arco ?? p.antepie + (ref.arco - ref.antepie) * (Rc / rc)) - p.antepie;
  const nom = (ref.copaNominal ?? ref.copa) - (ref.antepieNominal ?? ref.antepie);
  const kn = K.copaC > 0 ? Math.max(nom - K.copaA, 0.1) / K.copaC : 1;
  // altura sobre el antepié en un punto (capa copa c, capa arco a, largo t, ancho v):
  // forma aprobada + cambio de copa (kc) + cambio de arco (ka)
  const pesoCopa = (t, v) => { const s = lado(v); return (1 - s) * apagaExt(t) + s * talon(t); };
  const arcoDe = (c, a, t, v) => a + kn * c * (1 - talon(t)) * lado(v) * antepieF(t);
  const val = (c, a, t, v, kc, ka) => kn * c + a + (kc - kn) * c * pesoCopa(t, v) + (ka - 1) * arcoDe(c, a, t, v);
  // kc tal que la copa medida (borde del 5 % al 20 %) quede en la pedida: es lineal en kc
  let cw = 0; for (let s = 0; s < V.c.length; s++) cw += V.c[s] * pesoCopa(V.t[s], V.v[s]); cw /= V.c.length || 1;
  const kcDe = ka => {
    let m = 0; for (let s = 0; s < V.c.length; s++) m += val(V.c[s], V.a[s], V.t[s], V.v[s], kn, ka); m /= V.c.length || 1;
    return cw > 1e-6 ? kn + (Rc - m) / cw : kn;
  };
  const alto = ka => { const kc = kcDe(ka); let m = 0; for (let s = 0; s < S.c.length; s++) m = Math.max(m, val(S.c[s], S.a[s], S.t[s], S.v[s], kc, ka)); return m; };
  // ka: la capa del arco escalada para que el punto más alto de la zona del arco quede en el arco pedido
  let ka = 0, minimo = false;
  if (alto(0) >= Ra) minimo = true;
  else {
    let lo = 0, hi = 2; while (alto(hi) < Ra && hi < 64) hi *= 2;
    for (let it = 0; it < 40; it++) { const mid = (lo + hi) / 2; if (alto(mid) < Ra) lo = mid; else hi = mid; }
    ka = (lo + hi) / 2;
  }
  const kc = kcDe(ka);
  const fn = (c, a, t, v) => p.antepie + val(c, a, t, v, kc, ka);
  fn.arco = p.antepie + alto(ka);
  fn.arcoMin = minimo ? fn.arco : null;
  return fn;
}

// Horma con el contorno de una muestra: el borde es el de la muestra y el relieve (copa, arco, antepié) es el de
// la horma `h`, repartido en proporción (mismo % del largo y del ancho de cada fila). `puntos` = [[x, y], …] en mm,
// como pie izquierdo (talón en Y = 0, dedos hacia +Y, lado interno hacia +X). `suave` = mm de suavizado del borde
// (solo para quitar el temblor del trazo).
export function hormaConContorno(h, puntos, op = {}) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of puntos) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const largo = y1 - y0, ancho = x1 - x0;
  // empezar en el talón y recorrer primero el lado externo (-X): sentido horario visto desde arriba
  let area = 0;
  for (let i = 0; i < puntos.length; i++) { const [a, b] = puntos[i], [c, d] = puntos[(i + 1) % puntos.length]; area += a * d - c * b; }
  const P = area > 0 ? [...puntos].reverse() : puntos;
  const { cont, borde } = contornoSuave(P.map(p => p[0]), P.map(p => p[1]), largo, ancho, op.suave ?? 1.5);
  const altura = (x, y, yH = y) => {
    const [xi, xd] = borde(y), v = xd > xi ? Math.min(Math.max((x - xi) / (xd - xi), 0), 1) : 0.5;
    const yh = (y / largo) * h.largo, [a, b] = h.borde(yh);
    return h.altura(a + v * (b - a), yh, (yH / largo) * h.largo);
  };
  const partes = (x, y, yH = y) => {
    const [xi, xd] = borde(y), v = xd > xi ? Math.min(Math.max((x - xi) / (xd - xi), 0), 1) : 0.5;
    const yh = (y / largo) * h.largo, [a, b] = h.borde(yh);
    return h.partes(a + v * (b - a), yh, (yH / largo) * h.largo);
  };
  return { largo, ancho, cont, borde, altura, partes, ref: h.ref, base: h, deMuestra: true };
}

// Contorno cerrado suave a partir de una polilínea (talón → lado externo → punta → lado interno). Se reparte en
// puntos iguales, se suaviza `sigmaMM` y se devuelve al largo y ancho pedidos, con el talón en Y = 0 y centrado en X.
// Da el contorno empezando en el talón y una tabla de bordes por altura Y (externo xi, interno xd).
function contornoSuave(bx, by, largo, ancho, sigmaMM) {
  const N = 2048, c0 = repartir(bx, by, N, true), sig = Math.max(sigmaMM, 0.01) / (c0.total / N);
  let cx = gauss(c0.x, sig, true), cy = gauss(c0.y, sig, true);
  // el suavizado encoge un poco la curva: se devuelve al largo y al ancho de la horma, con talón en Y = 0 y centrada
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < N; i++) { x0 = Math.min(x0, cx[i]); x1 = Math.max(x1, cx[i]); y0 = Math.min(y0, cy[i]); y1 = Math.max(y1, cy[i]); }
  for (let i = 0; i < N; i++) { cx[i] = (cx[i] - (x0 + x1) / 2) * (ancho / (x1 - x0)); cy[i] = (cy[i] - y0) * (largo / (y1 - y0)); }
  // empezar en la punta del talón
  let iT = 0; for (let i = 1; i < N; i++) if (cy[i] < cy[iT]) iT = i;
  const rx = new Float64Array(N), ry = new Float64Array(N);
  for (let i = 0; i < N; i++) { rx[i] = cx[(i + iT) % N]; ry[i] = cy[(i + iT) % N]; }
  let iD = 0; for (let i = 1; i < N; i++) if (ry[i] > ry[iD]) iD = i;

  // tabla de bordes por altura Y: externo (xi) e interno (xd)
  const NY = 2400, tabXi = new Float64Array(NY + 1), tabXd = new Float64Array(NY + 1);
  let a = 0, b = N;
  const RX = i => rx[i % N], RY = i => (i === N ? ry[0] : ry[i % N]);
  for (let k = 0; k <= NY; k++) {
    const y = (largo * k) / NY;
    while (a < iD - 1 && ry[a + 1] < y) a++;
    const fa = ry[a + 1] > ry[a] ? Math.min(Math.max((y - ry[a]) / (ry[a + 1] - ry[a]), 0), 1) : 0;
    tabXi[k] = rx[a] + fa * (rx[a + 1] - rx[a]);
    while (b > iD + 1 && RY(b - 1) < y) b--;
    const fb = RY(b - 1) > RY(b) ? Math.min(Math.max((y - RY(b)) / (RY(b - 1) - RY(b)), 0), 1) : 0;
    tabXd[k] = RX(b) + fb * (RX(b - 1) - RX(b));
  }
  const borde = y => {
    const q = Math.min(Math.max(y / largo, 0), 1) * NY, k = Math.min(Math.floor(q), NY - 1), f = q - k;
    return [tabXi[k] + f * (tabXi[k + 1] - tabXi[k]), tabXd[k] + f * (tabXd[k + 1] - tabXd[k])];
  };
  return { cont: { x: rx, y: ry, n: N, iD }, borde };
}

// Convierte una altura de la horma en la altura del diseño. El relieve sobre el antepié se reparte en dos
// tramos: hasta la copa y de la copa al arco, cada uno con su escala, unidos sin quiebre (±2 mm alrededor
// de la copa). Así el antepié, la copa y el arco quedan exactamente en los valores pedidos.
export function curvaAlturas(ref, p) {
  const rc = ref.copa - ref.antepie, ra = ref.arco - ref.antepie;
  const Rc = p.copa - p.antepie;
  const Ra = (p.arco ?? p.antepie + ra * (Rc / rc)) - p.antepie;
  const m = 2, paso = 0.01, n = Math.ceil((ra + 6) / paso) + 1;
  const A = new Float64Array(n), B = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const s = suave(((i - 0.5) * paso - (rc - m)) / (2 * m));
    A[i] = A[i - 1] + (1 - s) * paso;
    B[i] = B[i - 1] + s * paso;
  }
  const en = (T, r) => {
    const q = Math.min(Math.max(r, 0), (n - 1) * paso) / paso, i = Math.min(Math.floor(q), n - 2);
    return T[i] + (q - i) * (T[i + 1] - T[i]);
  };
  const det = en(A, rc) * en(B, ra) - en(A, ra) * en(B, rc);
  const k1 = (Rc * en(B, ra) - Ra * en(B, rc)) / det;
  const k2 = (Ra * en(A, rc) - Rc * en(A, ra)) / det;
  const fn = zh => {
    const r = Math.max(zh - ref.antepie, 0);
    return p.antepie + k1 * en(A, r) + k2 * en(B, r);
  };
  fn.arco = p.antepie + Ra;
  return fn;
}

// Acabado de la cara de abajo: proporción lambda(s, d) = altura de abajo / altura de arriba, según la posición en
// el contorno (s = 0 punta del talón, por el lado externo hasta los dedos y de vuelta por el interno, pie izquierdo)
// y la distancia al borde d (fracción del ancho). 0 = base plana; cerca de 1 = la base sube casi hasta arriba.
// Se suaviza a lo largo del contorno y hacia adentro para que la cara de abajo no copie el ruido de la referencia.
export function prepararAcabado(datos, op = {}) {
  const { ns, nd, dMax } = datos, L = datos.lambda.map(f => Float64Array.from(f));
  const sd = op.suaveDistancia ?? 2.5, ss = op.suaveContorno ?? 3;
  for (let i = 0; i < ns; i++) L[i] = gauss(L[i], sd, false);
  for (let k = 0; k < nd; k++) {
    const col = new Float64Array(ns);
    for (let i = 0; i < ns; i++) col[i] = L[i][k];
    const s = gauss(col, ss, true);
    for (let i = 0; i < ns; i++) L[i][k] = s[i];
  }
  const fn = (s, d) => {
    if (d >= dMax) return 0;
    const a = (((s % 1) + 1) % 1) * ns, k = (Math.max(d, 0) / dMax) * (nd - 1);
    const i = Math.floor(a) % ns, i2 = (i + 1) % ns, ta = a - Math.floor(a), j = Math.min(Math.floor(k), nd - 2), tk = k - j;
    const f0 = L[i][j] + tk * (L[i][j + 1] - L[i][j]), f1 = L[i2][j] + tk * (L[i2][j + 1] - L[i2][j]);
    // se apaga del todo antes de dMax para que la base llegue plana sin escalón
    return (f0 + ta * (f1 - f0)) * (1 - suave((d / dMax - 0.8) / 0.2));
  };
  fn.dMax = dMax;
  return fn;
}

// Caja de un elemento (2026-11-14, como el "Editar 2D" de la biblioteca de LutraCAD): cuadro de nf × nc puntos sobre
// el elemento, en (u, v) (u = largo de la plantilla, v = ancho de la fila). c = { u0, u1, v0, v1, nf, nc, d } con
// d[j * nc + k] = [du, dv] cuánto se movió cada punto. El desplazamiento entre puntos se interpola suave (Catmull-Rom
// en las dos direcciones); fuera del cuadro sigue el del borde (así correr todo el cuadro corre el elemento).
export function desplazCajaElemento(c, u, v) {
  const fu = Math.min(Math.max((u - c.u0) / (c.u1 - c.u0), 0), 1) * (c.nf - 1), fv = Math.min(Math.max((v - c.v0) / (c.v1 - c.v0), 0), 1) * (c.nc - 1);
  const cr = t => { const t2 = t * t, t3 = t2 * t; return [-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1, -1.5 * t3 + 2 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2]; };
  const j = Math.min(Math.floor(fu), c.nf - 2), k = Math.min(Math.floor(fv), c.nc - 2), wu = cr(fu - j), wv = cr(fv - k);
  let du = 0, dv = 0;
  for (let a = 0; a < 4; a++) {
    const jj = Math.min(Math.max(j - 1 + a, 0), c.nf - 1);
    for (let b = 0; b < 4; b++) {
      const kk = Math.min(Math.max(k - 1 + b, 0), c.nc - 1), w = wu[a] * wv[b], d = c.d[jj * c.nc + kk];
      du += w * d[0]; dv += w * d[1];
    }
  }
  return [du, dv];
}
// Caja de costado de un elemento (2026-11-14, como LutraCAD en la vista de costado): p = { u0, u1, f } con f = alto
// relativo (1 = igual) en puntos parejos a lo largo de [u0, u1]; entre puntos, Catmull-Rom; fuera, el del borde.
// Nunca negativo.
export function factorPerfil(p, u) {
  const n = p.f.length; if (n < 2) return p.f[0] ?? 1;
  const t = Math.min(Math.max((u - p.u0) / (p.u1 - p.u0), 0), 1) * (n - 1), j = Math.min(Math.floor(t), n - 2), s = t - j;
  const F = k => p.f[Math.min(Math.max(k, 0), n - 1)], s2 = s * s, s3 = s2 * s;
  const v = (-0.5 * s3 + s2 - 0.5 * s) * F(j - 1) + (1.5 * s3 - 2.5 * s2 + 1) * F(j) + (-1.5 * s3 + 2 * s2 + 0.5 * s) * F(j + 1) + (0.5 * s3 - 0.5 * s2) * F(j + 2);
  return Math.max(v, 0);
}
// punto de la forma original que la caja lleva a (u, v): se busca q con q + D(q) = (u, v), por aproximaciones
function desdeCaja(c, u, v) {
  let qu = u, qv = v;
  for (let it = 0; it < 12; it++) {
    const [du, dv] = desplazCajaElemento(c, qu, qv), nu = u - du, nv = v - dv;
    // mitad del paso: converge aunque la caja esté bastante deformada
    qu = 0.5 * qu + 0.5 * nu; qv = 0.5 * qv + 0.5 * nv;
  }
  return [qu, qv];
}

// Elemento (cuña, barra, oliva): devuelve la forma como fracción de 0 a 1 en cada punto (u, v), con u = 0 punta del
// talón .. 1 punta de los dedos y v = 0 borde externo .. 1 borde interno (pie izquierdo). Todas las transiciones
// son suaves, así el elemento se une con la plantilla sin escalón y no hay que suavizarlo después.
export function prepararElemento(def) {
  const L = def.largo, A = def.ancho;
  // curva en S de segundo orden: además de la pendiente, también la curvatura es cero en los dos extremos,
  // así el elemento nace y termina sin que se note dónde
  const s5 = x => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * x * (x * (6 * x - 15) + 10));
  const lente = (u, a, b, meseta) => {
    const t = (u - a) / (b - a); if (t <= 0 || t >= 1) return 0;
    const r = (1 - meseta) / 2;
    return t < r ? s5(t / r) : t > 1 - r ? s5((1 - t) / r) : 1;
  };
  const rampa = (u, a, p, b) => (u <= a || u >= b ? 0 : u < p ? s5((u - a) / (p - a)) : s5((b - u) / (b - p)));
  // distancia relativa desde el borde donde la cuña es más alta (0 = en el borde, 1 = donde termina)
  const desdeBorde = v => (A.lado === 'interno' ? 1 - v : v) / A.hasta;
  // degradado de cuña: baja parejo (en línea recta) desde el borde y llega a cero sin quiebre; `finSuave` es la
  // parte final (fracción) donde la recta se redondea para llegar a cero
  const degradado = r => {
    if (r >= 1) return 0;
    const t = 1 - Math.max(r, 0), w = A.finSuave ?? 0.3;
    return (t >= w ? t - w / 2 : (t * t) / (2 * w)) / (1 - w / 2);
  };
  // Pieza con contorno propio (oliva): planta en forma de gota, ancha adelante y en punta hacia el talón.
  // t = 0 punta de atrás .. 1 frente; b = distancia al eje dividida por el ancho de la pieza (con signo).
  // Alto = perfil a lo largo (sube en línea casi recta desde atrás hasta el pico y cae redondeado al frente)
  // × perfil a lo ancho (bóveda casi circular). Medidas de la oliva de la biblioteca de LutraCAD (2026-11-11).
  const PZ = def.pieza;
  const kPlanta = PZ ? Math.log(0.5) / Math.log(PZ.anchoMax ?? 0.72) : 1;
  // Barra metatarsal (planta "campana", foto de Ernesto 2026-11-14, pad 7904): placa casi cuadrada con el borde de
  // atrás cóncavo, los costados casi rectos (un poco más angosta atrás) y adelante dos hombros con una cúpula al
  // medio que avanza hacia los dedos. Alto: sube desde atrás hasta `pico` y baja redondeado al frente; a lo ancho,
  // bóveda. Las esquinas las redondea el suavizado.
  const campana = (t, b) => {
    if (t <= 0 || t >= 1) return 0;
    const lado = 1 - (PZ.angosta ?? 0.07) * (1 - t), r = Math.abs(b) / 0.5 / lado;
    if (r >= 1) return 0;
    const hb = PZ.hombro ?? 0.78, tb = (PZ.concavo ?? 0.08) * (1 - r * r);
    const tf = hb + (1 - hb) * Math.exp(-((b / (PZ.cupula ?? 0.2)) ** 2));
    if (t <= tb || t >= tf) return 0;
    const s = (t - tb) / (tf - tb), tp = PZ.pico ?? 0.6;
    const largo = s < tp ? 1 - (1 - s / tp) ** (PZ.cola ?? 1.6) : 1 - ((s - tp) / (1 - tp)) ** (PZ.caida ?? 2.2);
    return largo * (1 - r ** (PZ.boveda ?? 3));
  };
  const pieza = (t, b) => {
    if (PZ.planta === 'campana') return campana(t, b);
    if (t <= 0 || t >= 1) return 0;
    const s = t ** kPlanta, medio = Math.sqrt(s * (1 - s));   // medio ancho, 0,5 en la parte más ancha
    const r = Math.abs(b) / medio; if (r >= 1) return 0;
    const tp = PZ.pico ?? 0.73;
    const largo = t < tp ? 1 - (1 - t / tp) ** (PZ.cola ?? 1.6) : 1 - ((t - tp) / (1 - tp)) ** (PZ.caida ?? 2.2);
    return largo * (1 - r ** (PZ.boveda ?? 3.5));
  };
  // pasa (u, v) a coordenadas de la pieza; `fila` = ancho de la plantilla en ese punto y `x` = posición de 0 a 1
  // medida en mm cuando se conoce la horma (con L y W en mm), o en fracciones si no
  const enPieza = (y, x, Lr, Wr) => {
    const g = ((PZ.giro ?? 0) * Math.PI) / 180, cy = (PZ.frente - PZ.largo / 2) * Lr;
    const dy = y - cy, dx = x, a = dy * Math.cos(g) + dx * Math.sin(g), b = -dy * Math.sin(g) + dx * Math.cos(g);
    return pieza(a / (PZ.largo * Lr) + 0.5, b / (PZ.ancho * Wr));
  };
  const forma = (u, v) => {
    if (PZ) return enPieza(u, v - PZ.centro, 1, 1);
    // Arco lateral (captura de LutraCAD de Ernesto, 2026-11-14): media luna pegada al borde del lado de la cuña.
    // A lo largo va de `desde` a `hasta`; lo que entra hacia el centro crece hasta `ancho.hasta` en el `pico` y se
    // afina a punta en los dos extremos (`punta`: más = más en punta). Alto: lo más alto en el borde y baja parejo
    // hacia adentro (degradado); a lo largo, más alto en el pico (`subida`).
    if (L?.tipo === 'arco') {
      const t = (u - L.desde) / (L.hasta - L.desde); if (t <= 0 || t >= 1) return 0;
      const p = L.pico ?? 0.5, s = t < p ? t / (2 * p) : 0.5 + (t - p) / (2 * (1 - p)), w = Math.sin(Math.PI * s);
      const alcance = A.hasta * w ** (L.punta ?? 0.7), dv = A.lado === 'interno' ? 1 - v : v;
      if (dv >= alcance) return 0;
      return degradado(dv / alcance) * w ** (L.subida ?? 0.5);
    }
    let fa = 0, fl = 0;
    if (A.tipo === 'cuna') fa = A.perfil === 'degradado' ? degradado(desdeBorde(v)) : (() => { const r = desdeBorde(v); return r >= 1 ? 0 : 1 - s5(r); })();
    else if (A.tipo === 'plano') fa = A.borde > 0 ? s5(v / A.borde) * s5((1 - v) / A.borde) : 1;
    else if (A.tipo === 'domo') {
      // más ancha adelante (en el pico) y angosta hacia atrás, como una gota
      const t = Math.min(Math.max((u - L.desde) / (L.pico - L.desde), 0), 1), w = A.medioCola + (A.medio - A.medioCola) * t;
      const d = Math.abs(v - A.centro) / w;
      fa = d >= 1 ? 0 : 1 - s5(d);
    }
    if (fa === 0) return 0;
    if (L.tipo === 'lente') fl = lente(u, L.desde, L.hasta, L.meseta ?? 0.2);
    else if (L.tipo === 'rampa') fl = rampa(u, L.desde, L.pico, L.hasta);
    else if (L.tipo === 'frente') {
      // sube en rampa detrás de una línea curva y sigue pareja hasta la punta de los dedos; la línea empieza
      // más atrás junto al borde de la cuña y se adelanta hacia el centro
      const ini = L.desde + (L.diagonal ?? 0) * Math.min(desdeBorde(v), 1) ** 3;
      fl = u <= ini ? 0 : u >= ini + L.rampa ? 1 : s5((u - ini) / L.rampa);
    }
    else if (L.tipo === 'talon') {
      // pareja desde la punta del talón; el frente baja en rampa y es más largo junto al borde de la cuña
      const fin = L.hasta - (L.diagonal ?? 0) * Math.min(desdeBorde(v), 1);
      fl = u >= fin ? 0 : u <= fin - L.rampa ? 1 : s5((fin - u) / L.rampa);
    }
    let total = fa * fl;
    // puente: una franja angosta por el mismo borde que lleva la cuña hacia atrás hasta unirse con la copa,
    // para que el borde suba parejo desde la cuña hasta el talón en vez de bajar entre los dos
    const P = def.puente;
    if (P) {
      const r = ((A.lado === 'interno' ? 1 - v : v)) / P.ancho;
      if (r < 1) {
        const fu = u <= P.desde || u >= P.hasta ? 0
          : Math.min(s5((u - P.desde) / P.rampa), s5((P.hasta - u) / (P.salida ?? 0.05)));
        total = Math.max(total, (A.perfil === 'degradado' ? degradado(r) : 1 - s5(r)) * fu);
      }
    }
    return total;
  };
  // Versión difuminada para una horma: la forma se pasa a una grilla, se suaviza con una gaussiana de
  // `suavizado` mm (5 por defecto) y se vuelve a llevar a su altura máxima. El relieve queda orgánico: sin
  // aristas en el contorno del elemento y con la cima redondeada. Se calcula una vez por horma.
  const cache = new WeakMap();
  forma.para = h => {
    if (cache.has(h)) return cache.get(h);
    const NU = 300, NV = 120, sigma = def.suavizado ?? 5, G = [];
    // la pieza se mide en mm de la horma: así no se estira con el ancho de cada fila. Su eje es recto, a la
    // altura del centro de la pieza
    let xEje = 0;
    if (PZ) { const [a, b] = h.borde((PZ.frente - PZ.largo / 2) * h.largo); xEje = a + PZ.centro * (b - a); }
    const valor = (u0, v0) => {
      // caja (forma editada con los puntos del cuadro, como LutraCAD): se busca de qué punto de la forma original
      // viene (u0, v0) y se lee ahí
      const [u, v] = def.caja ? desdeCaja(def.caja, u0, v0) : [u0, v0];
      // perfil de alto (caja de costado): cuánto más alto o bajo es el elemento a lo largo
      const fp = def.perfil ? factorPerfil(def.perfil, u0) : 1;
      if (!PZ) return forma(u, v) * fp;
      const y = u * h.largo, [a, b] = h.borde(Math.min(Math.max(y, 0.1 * h.largo), 0.9 * h.largo));
      return enPieza(y, a + v * (b - a) - xEje, h.largo, h.ancho) * fp;
    };
    let max0 = 0;
    for (let i = 0; i < NU; i++) {
      const fila = new Float64Array(NV);
      for (let j = 0; j < NV; j++) { fila[j] = valor(i / (NU - 1), j / (NV - 1)); max0 = Math.max(max0, fila[j]); }
      G.push(fila);
    }
    // el ancho de la plantilla cambia a lo largo; se usa el del antepié como referencia para pasar mm a celdas
    const su = (sigma / h.largo) * (NU - 1), sv = (sigma / (h.ancho * 0.85)) * (NV - 1);
    for (let i = 0; i < NU; i++) G[i] = gauss(G[i], sv, false);
    for (let j = 0; j < NV; j++) {
      const col = new Float64Array(NU);
      for (let i = 0; i < NU; i++) col[i] = G[i][j];
      const s = gauss(col, su, false);
      for (let i = 0; i < NU; i++) G[i][j] = s[i];
    }
    let max1 = 0, sw = 0, su0 = 0, sv0 = 0;
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const v = G[i][j]; max1 = Math.max(max1, v);
      // centro del elemento (promedio pesado por su altura): ahí se gira y se agranda
      sw += v; su0 += v * i / (NU - 1); sv0 += v * j / (NV - 1);
    }
    const k = max1 > 0 ? max0 / max1 : 0;
    const f = (u, v) => {
      const a = Math.min(Math.max(u, 0), 1) * (NU - 1), b = Math.min(Math.max(v, 0), 1) * (NV - 1);
      const i = Math.min(Math.floor(a), NU - 2), j = Math.min(Math.floor(b), NV - 2), ta = a - i, tb = b - j;
      const f0 = G[i][j] + tb * (G[i][j + 1] - G[i][j]), f1 = G[i + 1][j] + tb * (G[i + 1][j + 1] - G[i + 1][j]);
      return (f0 + ta * (f1 - f0)) * k;
    };
    f.centro = sw > 0 ? [su0 / sw, sv0 / sw] : [0.5, 0.5];
    cache.set(h, f);
    return f;
  };
  // relleno: el elemento no se suma encima de la plantilla; la sube hasta su nivel (espesor del antepié + su
  // altura) solo donde está más baja. Donde la plantilla ya es más alta (copa, arco) no la toca.
  forma.relleno = !!def.relleno;
  // pieza con forma propia (oliva): al moverla no se adapta al ancho de la plantilla, se corre entera en mm
  // (Ernesto, 2026-11-13). Las cuñas y la barra sí siguen el borde: para eso están.
  forma.rigida = !!PZ;
  // descarga (Ernesto, 2026-11-16): la misma forma, pero hunde la cara de arriba en vez de subirla; `altura` es la
  // profundidad. Nunca deja la plantilla más fina que p.espesorDescarga (1 mm por defecto) sobre la cara de abajo.
  forma.descarga = !!def.descarga;
  return forma;
}

// Genera la malla de la plantilla. p = { largo, ancho?, antepie, copa, arco?, lado: 'izq' | 'der', acabado?, canto?,
// elementos?: [{ forma, altura }], lados?, arcos?, anillos? }. Los elementos suben la cara de arriba; la de abajo
// no cambia. Sin `ancho`, el ancho crece en proporción al largo. La horma es de pie izquierdo;
// 'der' la espeja. Con `acabado` (de prepararAcabado) la cara de abajo sube cerca del borde y deja un canto de al
// menos `canto` mm (1,2 por defecto) de espesor; sin acabado, la base es plana.
export function generar(h, p) {
  const ny = p.lados ?? 300, na = p.arcos ?? 72, nr = p.anillos ?? 44, canto = p.canto ?? 1.2;
  const sL = p.largo / h.largo, sW = p.ancho ? p.ancho / h.ancho : sL, W = h.ancho * sW;
  const L = h.largo, C = h.cont;
  // por capas si la horma las trae (todas las de la biblioteca); curvaAlturas queda para hormas sin capas
  const fc = h.partes && h.ref.capas ? alturasPorCapas(h.ref, p) : null, f = fc ?? curvaAlturas(h.ref, p);
  const alturaEn = (px, py) => {
    const yH = correrArco(py);
    if (!fc) return f(h.altura(px, py, yH));
    const [c, a, v] = h.partes(px, py, yH); return fc(c, a, yH / L, v);
  };
  // la espina va de A (centro del talón) a B (centro de la punta); los lados se cortan en las mismas alturas Y
  const yA = 0.11 * L, yB = 0.9 * L, centro = y => { const [a, b] = h.borde(y); return (a + b) / 2; };
  const ys = Array.from({ length: ny }, (_, j) => yA + ((yB - yA) * j) / (ny - 1));
  const A = [centro(yA), yA], B = [centro(yB), yB];
  // puntos del contorno (cx, cy) con su punto de espina (ex, ey), en orden: lado externo, punta, lado interno, talón
  const cx = [], cy = [], ex = [], ey = [];
  const pone = (x, y, sx, sy) => { cx.push(x); cy.push(y); ex.push(sx); ey.push(sy); };
  const arco = (desde, hasta, ini, fin, S) => {
    const px = [ini[0]], py = [ini[1]];
    for (let i = desde; i !== hasta; i = (i + 1) % C.n) { px.push(C.x[i]); py.push(C.y[i]); }
    px.push(fin[0]); py.push(fin[1]);
    const r = repartir(px, py, na + 2, false);
    for (let i = 1; i <= na; i++) pone(r.x[i], r.y[i], S[0], S[1]);
  };
  // índices del contorno donde cruza yA e yB
  let lA = 0; while (C.y[lA] < yA) lA++;
  let lB = lA; while (C.y[lB] <= yB) lB++;
  let mB = C.iD; while (C.y[mB] > yB) mB++;
  let mA = mB; while (mA < C.n && C.y[mA] >= yA) mA++;
  for (let j = 0; j < ny; j++) pone(h.borde(ys[j])[0], ys[j], centro(ys[j]), ys[j]);
  arco(lB, mB, [h.borde(yB)[0], yB], [h.borde(yB)[1], yB], B);
  for (let j = ny - 1; j >= 0; j--) pone(h.borde(ys[j])[1], ys[j], centro(ys[j]), ys[j]);
  arco(mA % C.n, lA, [h.borde(yA)[1], yA], [h.borde(yA)[0], yA], A);
  const ns = cx.length;
  // posición en el contorno (0 = punta del talón, hacia el lado externo), para el acabado
  const ac = new Float64Array(ns + 1);
  for (let i = 0; i < ns; i++) ac[i + 1] = ac[i] + Math.hypot((cx[(i + 1) % ns] - cx[i]) * sW, (cy[(i + 1) % ns] - cy[i]) * sL);
  let iT = 0; for (let i = 1; i < ns; i++) if (cy[i] < cy[iT]) iT = i;
  const sFrac = i => (((ac[i] - ac[iT]) / ac[ns]) % 1 + 1) % 1;

  // Ubicación del arco (p.arcoPos, fracción del largo desde el talón): el relieve de la horma entre el 15 % y el
  // 65 % del largo se estira o se encoge para que su punto más alto quede donde se pide. Fuera de ese tramo
  // (copa del talón y antepié) no cambia. Curva de Hermite monótona: sin quiebres ni pliegues.
  const correrArco = (() => {
    const N = h.ref.arcoPos ?? 0.4;
    const herm = (t, y0, y1, v0, v1, m0, m1) => {
      const d = y1 - y0, u = (t - y0) / d, u2 = u * u, u3 = u2 * u;
      return (2 * u3 - 3 * u2 + 1) * v0 + (u3 - 2 * u2 + u) * d * m0 + (-2 * u3 + 3 * u2) * v1 + (u3 - u2) * d * m1;
    };
    // ubicación pedida (p.arcoPos): la cima va a T; el comienzo (15 %) y el final (65 %) quedan donde estaban
    let T = N, ubicar = t => t, cambia = false;
    if (p.arcoPos != null && Math.abs(p.arcoPos - N) >= 1e-4) {
      cambia = true;
      const a = 0.15, b = 0.65; T = Math.min(Math.max(p.arcoPos, 0.28), 0.52);
      const s1 = (N - a) / (T - a), s2 = (b - N) / (b - T), mT = 2 / (1 / s1 + 1 / s2);
      ubicar = t => (t <= a || t >= b ? t : t < T ? herm(t, a, T, a, N, 1, mT) : herm(t, T, b, N, b, mT, 1));
    }
    // "Mover ápice" como LutraCAD (2026-11-17; 2026-11-19, Ernesto: también el comienzo del arco, "a la par"): el arco
    // entero, desde su comienzo (12 % del largo antes de la cima) hasta la cima, se corre p.moverApice mm hacia los
    // dedos sin cambiar su forma. Atrás, entre la copa del talón (12 %) y el comienzo del arco, se estira o se encoge;
    // adelante, entre la cima y el 65 %, también. La copa y el antepié no cambian. Pendiente 1 en todos los nudos y
    // tramos con pendiente media entre 0,5 y 2: monótona, sin pliegues.
    let correr = t => t;
    const d0 = (p.moverApice ?? 0) / (p.largo || L);
    if (Math.abs(d0) > 1e-5) {
      cambia = true;
      const a = 0.12, b = 0.65, S = Math.max(T - 0.12, a + 0.02);
      const d = Math.min(Math.max(d0, -0.5 * (S - a)), Math.min(S - a, 0.6 * (b - T)));
      // de la plantilla nueva (t) a la de antes: nudos (a, a), (S + d, S), (T + d, T), (b, b)
      correr = t => (t <= a || t >= b ? t : t < S + d ? herm(t, a, S + d, a, S, 1, 1) : t <= T + d ? t - d : herm(t, T + d, b, T, b, 1, 1));
    }
    if (!cambia) return y => y;
    return y => L * ubicar(correr(y / L));
  })();
  const espejo = p.lado === 'der';
  // Ancho del talón propio (Ernesto, 2026-11-16): p.escalaTalon agranda o achica a lo ancho solo el talón, alrededor
  // del centro de cada fila; del 22 % al 50 % del largo pasa suave a 1 (el antepié no cambia).
  const kT = p.escalaTalon && Math.abs(p.escalaTalon - 1) > 1e-4 ? p.escalaTalon : 1;
  const anchoX = kT === 1 ? px => px : (px, py) => {
    const c = centro(Math.min(Math.max(py, yA), yB)), w = 1 - suave((py / L - 0.22) / 0.28);
    return c + (px - c) * (1 + (kT - 1) * w);
  };
  const x = new Float32Array(ns * nr), y = new Float32Array(ns * nr), z = new Float32Array(ns * nr), zb = new Float32Array(ns * nr);
  // cada elemento en su versión difuminada para esta horma
  // mover = [adelante, hacia interno] en mm: corre el elemento sobre la plantilla sin cambiar su forma.
  // giro = grados (positivo: el frente del elemento va hacia el lado interno); escala = [largo, ancho] (1 = igual).
  // Giro y escala son alrededor del centro del elemento.
  const he = new Float32Array(ns * nr), elementos = (p.elementos ?? []).map(e => {
    const forma = e.forma.para ? e.forma.para(h) : e.forma, g = ((e.giro ?? 0) * Math.PI) / 180;
    const sl = Math.max(e.escala?.[0] ?? 1, 0.2), sa = Math.max(e.escala?.[1] ?? 1, 0.2), centro = forma.centro ?? [0.5, 0.5];
    const r = { altura: e.altura, relleno: !!e.forma.relleno, descarga: !!e.forma.descarga, forma, du: (e.mover?.[0] ?? 0) / p.largo, dmm: e.mover?.[1] ?? 0,
                transf: g !== 0 || sl !== 1 || sa !== 1, cg: Math.cos(g), sg: Math.sin(g), sl, sa, centro,
                rigida: !!e.forma.rigida, aporte: new Float32Array(ns * nr),
                // caja del elemento en el diseño (2026-11-19): de qué punto (u, v) del elemento viene cada punto de la malla
                uv: e.conUV ? new Float32Array(ns * nr * 2) : null };
    if (r.rigida) {
      // centro del elemento en su lugar de la biblioteca (mm de esta plantilla) y adonde se corrió
      const [a, b] = h.borde(Math.min(Math.max(centro[0] * L, 0.1 * L), 0.9 * L));
      r.yh0 = centro[0] * p.largo; r.xh0 = (a + centro[1] * (b - a)) * sW;
      r.yc = r.yh0 + (e.mover?.[0] ?? 0); r.xc = r.xh0 + (e.mover?.[1] ?? 0);
    }
    return r;
  });
  // sube de 0 a la diferencia sin quiebre (en ±1 mm alrededor de cero)
  const rampaSuave = (d, k = 1) => (d <= -k ? 0 : d >= k ? d : ((d + k) * (d + k)) / (4 * k));
  const rk = Array.from({ length: nr }, (_, k) => (k / (nr - 1)) ** 1.7);
  const d0 = (p.radioCanto ?? 2) / W;
  // Margen para pulir a los costados (Ernesto, 2026-11-19): p.margenLados mm de más a cada lado del antepié (interno y
  // externo). Nada hasta el 50 % del largo, entero desde el 65 % hasta la punta. Se abre alrededor del centro de cada
  // fila (el medio no se mueve, el borde sale esos mm); en la punta se usa el ancho de la fila del 90 %.
  // p.margenTalon (2026-11-19): lo mismo en el retropié, a cada costado (entero hasta el 25 %, nada desde el 40 %) y
  // atrás (paso 4). En el talón se usa el ancho de la fila del 10 %.
  const mL = p.margenLados > 0 ? p.margenLados : 0, mT = p.margenTalon > 0 ? p.margenTalon : 0;
  const abreLados = !mL && !mT ? null : (px, py, xa) => {
    // 2026-11-19 (Ernesto: "se ve raro"): antes cada margen se apagaba antes del arco y el borde se angostaba ahí. Ahora
    // es una banda seguida: la del retropié hasta el 35 %, pasa suave a la del antepié entre el 35 % y el 65 %
    const w = suave((py / L - 0.35) / 0.3), m = mT * (1 - w) + mL * w; if (!m) return xa;
    const yc = Math.min(Math.max(py, yA), yB), c = centro(yc), [a, b] = h.borde(Math.min(Math.max(py, 0.1 * L), 0.9 * L)), medio = Math.max((b - a) / 2, 1);
    return c + (xa - c) * (1 + m / (medio * sW));
  };
  // 1) cara de arriba de la horma
  for (let i = 0; i < ns; i++) for (let k = 0; k < nr; k++) {
    const px = cx[i] + rk[k] * (ex[i] - cx[i]), py = cy[i] + rk[k] * (ey[i] - cy[i]), q = i * nr + k;
    let xa = anchoX(px, py);
    if (abreLados) xa = abreLados(px, py, xa);
    x[q] = (espejo ? -xa : xa) * sW; y[q] = py * sL; z[q] = alturaEn(px, py);
  }
  // 2) contacto total en el arco: la cara de arriba copia la planta del pie del escaneo
  if (p.contacto?.altura && p.contacto.pct > 0) aplicarContacto(x, y, z, p.contacto, p.largo, p.antepie);
  // 2b) altura del borde editada en la vista de costado (Editar línea de corte, como LutraCAD; 2026-11-13).
  // p.alturaBorde = { interno, externo }: mm que sube (o baja) el borde de ese lado, muestreado parejo a lo largo
  // (fracción del largo desde el talón). Sube del todo en el borde y se apaga suave hasta el 40 % del ancho, así la
  // cara de arriba acompaña sin escalón. Nunca baja del espesor del antepié.
  if (p.alturaBorde?.interno || p.alturaBorde?.externo) {
    const ab = p.alturaBorde, perf = (arr, u) => {
      if (!arr?.length) return 0;
      const n = arr.length - 1, t = Math.min(Math.max(u, 0), 1) * n, i = Math.min(Math.floor(t), n - 1), fr = t - i;
      return arr[i] + fr * (arr[i + 1] - arr[i]);
    };
    for (let i = 0; i < ns; i++) for (let k = 0; k < nr; k++) {
      const px = cx[i] + rk[k] * (ex[i] - cx[i]), py = cy[i] + rk[k] * (ey[i] - cy[i]), q = i * nr + k, u = py / L;
      const [xi, xd] = h.borde(Math.min(Math.max(py, 0.06 * L), 0.94 * L));
      const v = xd > xi ? Math.min(Math.max((px - xi) / (xd - xi), 0), 1) : 0.5;
      // en la horma el lado interno es el de x alta (en el pie derecho se espeja después)
      const dz = perf(ab.interno, u) * suave((v - 0.4) / 0.6) + perf(ab.externo, u) * suave((0.6 - v) / 0.6);
      if (dz) z[q] = Math.max(z[q] + dz, Math.min(z[q], p.antepie));
    }
  }
  // 2c) "Corrección del arco medial" como LutraCAD (medida en sus vistas de costado, 2026-11-17): suma p.arcoMedial mm
  // en la cima del arco con una campana pareja a lo largo (sigma 12 % del largo: va del ~10 % al ~59 %) y solo hacia el
  // lado interno. No reescala nada: talón, copa y antepié quedan igual. Negativo baja (nunca del espesor del antepié).
  if (p.arcoMedial) {
    const ap = Math.min(Math.max((p.arcoPos ?? h.ref.arcoPos ?? 0.4) + (p.moverApice ?? 0) / (p.largo || L), 0.2), 0.6), sg = 0.12;
    for (let i = 0; i < ns; i++) for (let k = 0; k < nr; k++) {
      const px = cx[i] + rk[k] * (ex[i] - cx[i]), py = cy[i] + rk[k] * (ey[i] - cy[i]), q = i * nr + k, u = py / L;
      const [xi, xd] = h.borde(Math.min(Math.max(py, 0.06 * L), 0.94 * L));
      const v = xd > xi ? Math.min(Math.max((px - xi) / (xd - xi), 0), 1) : 0.5;
      const dz = p.arcoMedial * Math.exp(-((u - ap) ** 2) / (2 * sg * sg)) * suave((v - 0.3) / 0.6);
      if (dz) z[q] = Math.max(z[q] + dz, Math.min(z[q], p.antepie));
    }
  }
  // 2d) Alza (Ernesto, 2026-11-19): p.alza mm que sube toda la cara de arriba (talón, copa y arco juntos, sin cambiar
  // su forma). En EVA la base queda plana; en resina la base curva acompaña y el canto sigue fino.
  // p.alzaTipo 'talon' (talonera: entera hasta el 30 % del largo y baja suave a 0 en el 60 %, antes de las cabezas
  // de los metatarsianos) o 'completa' (pareja del talón a la punta).
  const alza = p.alza > 0 ? p.alza : 0;
  const alzaEn = !alza ? () => 0 : p.alzaTipo === 'completa' ? () => alza : u => alza * (1 - suave((u - 0.3) / 0.3));
  // 3) cara de abajo y elementos
  for (let i = 0; i < ns; i++) {
    const s = sFrac(i);
    // donde la base sube (copa y arco), en los últimos mm la cara de abajo llega hasta el canto: queda un borde
    // fino y redondeado en vez de una pared vertical alta. Donde la base es plana (antepié) no se toca.
    const peso = p.acabado ? suave(p.acabado(s, 0.004) / 0.3) : 0;
    for (let k = 0; k < nr; k++) {
      const px = cx[i] + rk[k] * (ex[i] - cx[i]), py = cy[i] + rk[k] * (ey[i] - cy[i]), q = i * nr + k;
      // el alza sube la cara de arriba antes de calcular la de abajo: en resina la base curva la sigue hasta el canto
      // fino (2026-11-19: calculada sin el alza quedaba una pared recta del alto del alza con una línea en el borde);
      // en EVA la base sigue plana
      const dzA = alzaEn(py / L);
      if (dzA) z[q] += dzA;
      if (p.acabado && k < nr - 1) {
        const d = Math.hypot((px - cx[i]) * sW, (py - cy[i]) * sL) / W;
        let lam = p.acabado(s, d);
        if (d < d0) lam += peso * (1 - lam) * (1 - d / d0) ** 2;
        // mínimo redondeado entre la base curva y el tope que deja el canto: sin arista donde se cruzan,
        // y nunca más fino que el canto
        const a = lam * z[q], b = z[q] - canto, r = 0.35;
        zb[q] = Math.max(0, -r * Math.log(Math.exp(-(a - b) / r) + 1) + b);
      }
      // elementos: se suman arriba después de calcular la base, así la cara de abajo no cambia
      if (elementos.length) {
        // en las puntas el ancho se va a cero y el lado se vuelve inestable: ahí el lado se mide con el ancho
        // de la fila más cercana que todavía es ancha (10 % del largo desde cada punta)
        const [xi, xd] = h.borde(Math.min(Math.max(py, 0.1 * L), 0.9 * L)), u = py / L;
        const v = xd > xi ? Math.min(Math.max((px - xi) / (xd - xi), 0), 1) : 0.5, anchoFila = Math.max((xd - xi) * sW, 1);
        let suma = 0, relleno = 0, hunde = 0;
        for (const e of elementos) if (e.altura) {
          let uu = u - e.du, vv = v - e.dmm / anchoFila;
          if (e.rigida) {
            // en mm desde el centro corrido, se gira y agranda, y se lee en su lugar de la biblioteca: la forma no
            // cambia aunque la plantilla sea más angosta o más ancha donde se la puso
            let dY = py * sL - e.yc, dX = px * sW - e.xc;
            if (e.transf) { const a = (dY * e.cg + dX * e.sg) / e.sl, b = (-dY * e.sg + dX * e.cg) / e.sa; dY = a; dX = b; }
            uu = (e.yh0 + dY) / p.largo;
            const [hi, hd] = h.borde(Math.min(Math.max(uu * L, 0.1 * L), 0.9 * L));
            vv = hd > hi ? ((e.xh0 + dX) / sW - hi) / (hd - hi) : 0.5;
          } else if (e.transf) {
            // del punto de la plantilla al punto del elemento sin girar ni agrandar (en mm, alrededor del centro)
            const dY = (uu - e.centro[0]) * p.largo, dX = (vv - e.centro[1]) * anchoFila;
            uu = e.centro[0] + (dY * e.cg + dX * e.sg) / e.sl / p.largo;
            vv = e.centro[1] + (-dY * e.sg + dX * e.cg) / e.sa / anchoFila;
          }
          const a = e.altura * e.forma(uu, vv);
          e.aporte[q] = a;
          if (e.uv) { e.uv[2 * q] = uu; e.uv[2 * q + 1] = vv; }
          if (e.descarga) hunde += a; else if (e.relleno) relleno += a; else suma += a;
        }
        // la zona de suavizado es como mucho la altura del relleno: así en el antepié plano sube exactamente su
        // altura y en el contorno del elemento arranca en cero, sin escalón
        if (relleno > 0) suma += rampaSuave(p.antepie + dzA + relleno - z[q], Math.min(1, relleno));
        let zt = z[q] + suma;
        // descargas: bajan la cara de arriba; el piso (cara de abajo + espesor mínimo) se toca con un mínimo suave,
        // sin arista. Donde la plantilla ya es más fina que ese piso, no baja.
        if (hunde > 0) {
          const piso = Math.min(zt, zb[q] + (p.espesorDescarga ?? 1)), obj = zt - hunde, r = 0.25;
          zt = obj >= piso + 4 * r ? obj : piso + r * Math.log(1 + Math.exp((obj - piso) / r));
          zt = Math.max(zt, piso);
        }
        he[q] = zt - z[q]; z[q] = zt;
      }
    }
  }
  // 4) Margen para pulir (Ernesto, 2026-11-19): p.margenPunta mm de más en la punta, para pulir al armar (muestras en
  // EVA o impresas). Solo se alarga la punta: hasta el 75 % del largo nada se mueve (talón, arco, metatarsianos y sus
  // elementos quedan donde estaban); del 75 % al 95 % se estira suave y la punta entera se corre esos mm sin cambiar su
  // forma. El relieve no cambia (la punta es plana).
  const mP = p.margenPunta > 0 ? p.margenPunta : 0;
  if (mP) for (let q = 0; q < y.length; q++) { const t = y[q] / p.largo; if (t > 0.75) y[q] += mP * suave((t - 0.75) / 0.2); }
  // atrás del talón (p.margenTalon): la punta del talón se corre esos mm hacia atrás sin cambiar su forma (queda en
  // Y negativo); del 3 % al 23 % se estira suave y desde ahí nada se mueve
  if (mT) for (let q = 0; q < y.length; q++) { const t = y[q] / p.largo; if (t < 0.23) y[q] -= mT * (1 - suave((t - 0.03) / 0.2)); }
  // aportes: cuánto sube cada elemento en cada punto (en el orden de p.elementos), para saber cuál se toca con el ratón
  return { ns, nr, x, y, z, zb, he, rk, aportes: elementos.map(e => e.aporte), uvs: elementos.map(e => e.uv), p: { ...p, arco: f.arco, arcoMin: f.arcoMin ?? null, copaLado: h.ref.copaLado } };
}

// Contacto total en el arco (como el "Full Contact" de LutraCAD). c = { altura(x, y) → z de la planta del pie o null,
// pct (0 a 1), desde?, hasta? }. En la zona del arco (por defecto del 17 % al 68 % del largo, con transición suave
// de 10 % en cada punta) la cara de arriba se lleva hacia la planta del pie. La diferencia se calcula en una grilla
// de 2 mm y se suaviza (5 mm) para no copiar el ruido del escaneo; donde el escaneo no llega (fuera del pie) la
// diferencia se extiende desde el borde y se apaga de a poco, así las paredes acompañan sin escalón. Nunca baja
// del espesor del antepié.
function aplicarContacto(x, y, z, c, largo, antepie) {
  const n = z.length, a0 = c.desde ?? 0.17, a1 = c.hasta ?? 0.68, tr = c.transicion ?? 0.1;
  // c.largoPie: la zona se mide sobre el largo del PIE (el escaneo va alineado talón con talón). Si se mide sobre la
  // plantilla y esta es más larga que el pie, la zona llega a las cabezas de los metatarsianos y copia el costado
  // del juanete: queda un escalón a lo largo del borde interno del antepié (lo que vio Ernesto el 2026-11-13).
  const base = c.largoPie ?? largo;
  const zona = yy => { const u = yy / base; return suave((u - a0) / tr) * (1 - suave((u - (a1 - tr)) / tr)); };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let q = 0; q < n; q++) { x0 = Math.min(x0, x[q]); x1 = Math.max(x1, x[q]); y0 = Math.min(y0, y[q]); y1 = Math.max(y1, y[q]); }
  const paso = 2, nx = Math.ceil((x1 - x0) / paso) + 1, ny = Math.ceil((y1 - y0) / paso) + 1;
  // peso de cada punto: zona del arco a lo largo y, si c.interno (1 = pie izquierdo, -1 = derecho), solo del lado
  // interno a lo ancho (desde el 30 % del ancho de la fila, del todo desde el 60 %): el lado externo y las paredes
  // de la copa quedan como la horma
  const fx0 = new Float64Array(ny).fill(Infinity), fx1 = new Float64Array(ny).fill(-Infinity);
  for (let q = 0; q < n; q++) { const j = Math.round((y[q] - y0) / paso); fx0[j] = Math.min(fx0[j], x[q]); fx1[j] = Math.max(fx1[j], x[q]); }
  const peso = new Float64Array(n);
  for (let q = 0; q < n; q++) {
    let w = zona(y[q]);
    if (w > 0 && c.interno) {
      const j = Math.round((y[q] - y0) / paso), a = fx0[j], b = fx1[j], v = b > a ? (x[q] - a) / (b - a) : 0.5;
      w *= suave(((c.interno > 0 ? v : 1 - v) - 0.3) / 0.3);
    }
    peso[q] = w;
  }
  const suma = new Float64Array(nx * ny), cuenta = new Float64Array(nx * ny);
  for (let q = 0; q < n; q++) {
    if (zona(y[q]) <= 0) continue;
    const zp = c.altura(x[q], y[q]); if (zp == null) continue;
    // solo la planta del pie: donde el escaneo sube casi vertical (más de 45°) ya es el costado del pie y no se copia;
    // ahí la diferencia se toma de lo de adentro. (Con 25° se perdía el arco de los pies cavos, que es empinado.)
    const ax = c.altura(x[q] + 1.5, y[q]), bx = c.altura(x[q] - 1.5, y[q]), ay = c.altura(x[q], y[q] + 1.5), by = c.altura(x[q], y[q] - 1.5);
    if (ax == null || bx == null || ay == null || by == null) continue;
    if (Math.hypot(ax - bx, ay - by) / 3 > (c.pendienteMax ?? 1)) continue;
    const s = Math.round((y[q] - y0) / paso) * nx + Math.round((x[q] - x0) / paso);
    // c.soloSubir (Ernesto, 2026-11-12): donde el pie queda más bajo que la horma (pie plano o escaneo cargando peso)
    // no se baja el arco; solo se sube donde el pie es más alto (pie cavo)
    suma[s] += c.soloSubir ? Math.max(zp - z[q], 0) : zp - z[q]; cuenta[s]++;
  }
  const z0 = c.soloSubir ? Float32Array.from(z) : null;
  // promedio por celda, y suavizado gaussiano normalizado (solo con las celdas que tienen dato)
  const val = new Float64Array(nx * ny), hay = new Float64Array(nx * ny);
  for (let s = 0; s < val.length; s++) if (cuenta[s]) { val[s] = suma[s] / cuenta[s]; hay[s] = 1; }
  // suavizado distinto a lo ancho (sx) y a lo largo (sy): a lo largo más fuerte, así el perfil del arco queda como
  // una curva continua (sube desde la copa, meseta, baja al antepié) y no copia las ondas del escaneo
  const nucleo = sigmm => { const sig = sigmm / paso, r = Math.ceil(3 * sig), w = []; for (let k = -r; k <= r; k++) w.push(Math.exp(-0.5 * (k / sig) ** 2)); return { r, w }; };
  const kx = nucleo(c.sx ?? 5), ky = nucleo(c.sy ?? 5);
  const borrar = (v, ancho, alto, paso1, paso2, { r, w }) => {   // gaussiana en una dirección
    const out = new Float64Array(v.length);
    for (let b = 0; b < alto; b++) for (let a = 0; a < ancho; a++) {
      let acc = 0; for (let k = -r; k <= r; k++) { const aa = a + k; if (aa >= 0 && aa < ancho) acc += w[k + r] * v[b * paso2 + aa * paso1]; }
      out[b * paso2 + a * paso1] = acc;
    }
    return out;
  };
  const blur = v => borrar(borrar(v, nx, ny, 1, nx, kx), ny, nx, nx, 1, ky);
  const num = blur(Float64Array.from(val, (v, s) => v * hay[s])), den = blur(hay);
  let denMax = 0; for (const d of den) denMax = Math.max(denMax, d);
  // la diferencia que se extiende afuera del pie se apaga: lejos de los datos queda la horma
  const amplio = blur(blur(hay)); let ampMax = 0; for (const d of amplio) ampMax = Math.max(ampMax, d);
  const en = (arr, xx, yy) => {
    const fi = (xx - x0) / paso, fj = (yy - y0) / paso, i = Math.min(Math.max(Math.floor(fi), 0), nx - 2), j = Math.min(Math.max(Math.floor(fj), 0), ny - 2);
    const tx = Math.min(Math.max(fi - i, 0), 1), ty = Math.min(Math.max(fj - j, 0), 1);
    return (1 - ty) * ((1 - tx) * arr[j * nx + i] + tx * arr[j * nx + i + 1]) + ty * ((1 - tx) * arr[(j + 1) * nx + i] + tx * arr[(j + 1) * nx + i + 1]);
  };
  if (!denMax) return;
  for (let q = 0; q < n; q++) {
    const wz = peso[q]; if (wz <= 0) continue;
    const d = en(den, x[q], y[q]); if (d < 1e-6 * denMax) continue;
    // c.extender: entre el borde del pie y el borde de la plantilla la diferencia sigue igual (no se apaga); si se
    // apaga, en un arco alto el borde vuelve a bajar y queda una cresta
    const delta = en(num, x[q], y[q]) / d, apaga = c.extender ? 1 : suave(en(amplio, x[q], y[q]) / ampMax / 0.35);
    z[q] = Math.max(z[q] + c.pct * wz * apaga * delta, Math.min(z[q], antepie));
  }
  // Arco natural: la superficie ya llevada al pie se alisa a lo largo (c.alisar mm, 0 = no) dentro de la zona del
  // arco. Quita las ondas del escaneo y el quiebre donde termina el pie, y deja una sola curva: sube desde la copa,
  // meseta y baja de a poco al antepié (como el arco de LutraCAD). Es como el borde "prolijo" de la muestra.
  const al = c.alisar ?? 0;
  if (al > 0) {
    const sz = new Float64Array(nx * ny), cz = new Float64Array(nx * ny);
    for (let q = 0; q < n; q++) { const s = Math.round((y[q] - y0) / paso) * nx + Math.round((x[q] - x0) / paso); sz[s] += z[q]; cz[s]++; }
    const hz = Float64Array.from(cz, v => (v ? 1 : 0)), vz = Float64Array.from(sz, (v, s) => (cz[s] ? v / cz[s] : 0));
    // también a lo ancho (6 mm en la pantalla): con poco, junto al borde interno quedaba una arruga a lo largo del arco
    const ka = nucleo(al), kb = nucleo(c.alisarAncho ?? 3);
    const bl = v => borrar(borrar(v, nx, ny, 1, nx, kb), ny, nx, nx, 1, ka);
    const nz = bl(vz), dz = bl(hz);
    for (let q = 0; q < n; q++) {
      const wz = peso[q]; if (wz <= 0) continue;
      const d = en(dz, x[q], y[q]); if (d < 1e-6) continue;
      // máximo suave entre la superficie y su versión alisada: rellena los pozos y el escalón donde termina el pie,
      // sin bajar la cima del arco (alisar sola la achata y el pie deja de tocar)
      const zs = en(nz, x[q], y[q]) / d, e = 0.4, zm = (z[q] + zs + Math.sqrt((z[q] - zs) ** 2 + e * e)) / 2;
      const obj = (c.alisarModo ?? 'relleno') === 'relleno' ? zm : zs;
      // solo subir: el alisado actúa solo donde el pie subió la plantilla (lo que quedó como la horma no se toca)
      const w2 = z0 ? wz * suave((z[q] - z0[q]) / 1.0) : wz;
      z[q] = Math.max(z[q] + w2 * (obj - z[q]), Math.min(z[q], antepie));
    }
  }
  if (z0) for (let q = 0; q < n; q++) if (z[q] < z0[q]) z[q] = z0[q];
}

// Medidas de control de una malla generada.
export function medidas(g) {
  const { ns, nr, x, y, z, zb, rk } = g;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < ns; i++) { y0 = Math.min(y0, y[i * nr]); y1 = Math.max(y1, y[i * nr]); }
  const largo = y1 - y0, banda = (a, b) => {
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < ns; i++) { const t = (y[i * nr] - y0) / largo; if (t > a && t < b) { mn = Math.min(mn, x[i * nr]); mx = Math.max(mx, x[i * nr]); } }
    return mx - mn;
  };
  let arco = 0, arcoY = 0, antepie = Infinity, copaMin = Infinity, copaMax = 0, suma = 0, n = 0, canto = Infinity, espesor = Infinity;
  let apoyo = 0, total = 0;
  // copa medida solo en el borde externo cuando la horma lo pide (Crocs): en el pie izquierdo es el de x baja
  let xc = 0, nc = 0;
  for (let i = 0; i < ns; i++) { const t = (y[i * nr] - y0) / largo; if (t > 0.05 && t < 0.2) { xc += x[i * nr]; nc++; } }
  xc /= nc || 1;
  const soloExt = g.p?.copaLado === 'externo', esExt = q => (g.p?.lado === 'der' ? x[q] > xc : x[q] < xc);
  for (let i = 0; i < ns; i++) {
    const t = (y[i * nr] - y0) / largo, e0 = z[i * nr] - zb[i * nr];
    // (las descargas pueden bajar el antepié: "antepie" se sigue midiendo como el punto más bajo de arriba)
    canto = Math.min(canto, e0);
    if (t > 0.05 && t < 0.2 && (!soloExt || esExt(i * nr))) { const a = z[i * nr]; suma += a; n++; copaMin = Math.min(copaMin, a); copaMax = Math.max(copaMax, a); }
    for (let k = 0; k < nr; k++) {
      const q = i * nr + k, v = z[q];
      if (v > arco) { arco = v; arcoY = y[q]; }
      antepie = Math.min(antepie, v); espesor = Math.min(espesor, v - zb[q]);
      // peso = tramo del rayo que representa el punto, por su largo
      const w = (rk[Math.min(k + 1, nr - 1)] - rk[Math.max(k - 1, 0)]) * Math.hypot(x[i * nr + nr - 1] - x[i * nr], y[i * nr + nr - 1] - y[i * nr]);
      total += w; if (zb[q] < 0.05) apoyo += w;
    }
  }
  return { largo, anchoAntepie: banda(0.55, 0.9), anchoTalon: banda(0.03, 0.25), copa: suma / n, copaMin, copaMax,
           arco, arcoDesdeTalon: (arcoY - y0) / largo, antepie, canto, espesor, apoyo: apoyo / total };
}

// Qué tan lisa es la malla: mayor quiebre del contorno (grados) y mayor salto de pendiente entre caras vecinas
// de arriba y de abajo (grados). Sirve para vigilar el acabado con números.
export function lisura(g) {
  const { ns, nr, x, y, z, zb } = g;
  let quiebre = 0;
  for (let i = 0; i < ns; i++) {
    const a = ((i - 1 + ns) % ns) * nr, b = i * nr, c = ((i + 1) % ns) * nr;
    const ux = x[b] - x[a], uy = y[b] - y[a], vx = x[c] - x[b], vy = y[c] - y[b];
    const l = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    if (l > 1e-9) quiebre = Math.max(quiebre, Math.abs(Math.asin(Math.max(-1, Math.min(1, (ux * vy - uy * vx) / l)))));
  }
  const pliegue = h => {
    let m = 0;
    const normal = (a, b, c) => {
      const ux = x[b] - x[a], uy = y[b] - y[a], uz = h[b] - h[a], vx = x[c] - x[a], vy = y[c] - y[a], vz = h[c] - h[a];
      const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx], l = Math.hypot(...n);
      return l > 1e-9 ? n.map(t => t / l) : null;
    };
    for (let i = 0; i < ns; i++) for (let k = 0; k < nr - 3; k++) {
      // los anillos pegados al canto miden centésimas de mm: ahí una diferencia de 0,1 mm da un ángulo grande
      // que no se ve ni se imprime, así que no se cuentan
      if (Math.hypot(x[i * nr + k + 1] - x[i * nr + k], y[i * nr + k + 1] - y[i * nr + k]) < 0.15) continue;
      const i2 = (i + 1) % ns, n1 = normal(i * nr + k, i2 * nr + k, i2 * nr + k + 1), n2 = normal(i * nr + k + 1, i2 * nr + k + 1, i2 * nr + k + 2);
      if (n1 && n2) m = Math.max(m, Math.acos(Math.min(1, Math.abs(n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]))));
    }
    return (m * 180) / Math.PI;
  };
  return { quiebreContorno: (quiebre * 180) / Math.PI, pliegueArriba: pliegue(z), pliegueAbajo: pliegue(zb) };
}

// Cierra la malla en un sólido: cara de arriba, cara de abajo y pared alrededor.
// Devuelve los triángulos como números seguidos (9 por triángulo), con la normal hacia afuera.
export function solido(g) {
  const { ns, nr, x, y, z, zb } = g, tri = [];
  const P = (i, k, arriba) => [x[i * nr + k], y[i * nr + k], arriba ? z[i * nr + k] : zb[i * nr + k]];
  const igual = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
  // sentido del contorno: positivo = antihorario visto desde arriba
  let area = 0;
  for (let i = 0; i < ns; i++) { const j = ((i + 1) % ns) * nr; area += x[i * nr] * y[j] - x[j] * y[i * nr]; }
  const cara = (a, b, c) => {
    // en la espina y en los abanicos del talón y la punta varios puntos coinciden: los triángulos sin área no se escriben
    if (igual(a, b) || igual(b, c) || igual(a, c)) return;
    if (area > 0) tri.push(...a, ...b, ...c); else tri.push(...a, ...c, ...b);
  };
  for (let i = 0; i < ns; i++) {
    const j = (i + 1) % ns;
    for (let k = 0; k < nr - 1; k++) {
      cara(P(i, k, 1), P(j, k, 1), P(j, k + 1, 1));
      cara(P(i, k, 1), P(j, k + 1, 1), P(i, k + 1, 1));
      cara(P(i, k, 0), P(j, k + 1, 0), P(j, k, 0));
      cara(P(i, k, 0), P(i, k + 1, 0), P(j, k + 1, 0));
    }
    cara(P(i, 0, 1), P(i, 0, 0), P(j, 0, 0));
    cara(P(i, 0, 1), P(j, 0, 0), P(j, 0, 1));
  }
  return new Float32Array(tri);
}

// Revisa que el sólido esté cerrado: cada arista debe estar en dos triángulos, una vez en cada sentido.
export function revisarSolido(tri) {
  const id = new Map(), aristas = new Map();
  const vert = k => {
    const s = tri[k] + ',' + tri[k + 1] + ',' + tri[k + 2];
    if (!id.has(s)) id.set(s, id.size);
    return id.get(s);
  };
  for (let t = 0; t < tri.length; t += 9) {
    const v = [vert(t), vert(t + 3), vert(t + 6)];
    for (let e = 0; e < 3; e++) {
      const a = v[e], b = v[(e + 1) % 3], k = a < b ? a + '_' + b : b + '_' + a;
      const r = aristas.get(k) ?? [0, 0];
      r[a < b ? 0 : 1]++;
      aristas.set(k, r);
    }
  }
  let malas = 0;
  for (const r of aristas.values()) if (r[0] !== 1 || r[1] !== 1) malas++;
  return { triangulos: tri.length / 9, vertices: id.size, aristas: aristas.size, aristasMalas: malas, cerrado: malas === 0 };
}

// Volumen del sólido en cm3 (sirve para estimar material).
export function volumen(tri) {
  let v = 0;
  for (let t = 0; t < tri.length; t += 9) {
    v += tri[t] * (tri[t + 4] * tri[t + 8] - tri[t + 5] * tri[t + 7])
       - tri[t + 1] * (tri[t + 3] * tri[t + 8] - tri[t + 5] * tri[t + 6])
       + tri[t + 2] * (tri[t + 3] * tri[t + 7] - tri[t + 4] * tri[t + 6]);
  }
  return v / 6 / 1000;
}

// STL binario listo para el laminador.
export function aSTL(tri, nombre = 'plantilla') {
  const n = tri.length / 9, buf = new ArrayBuffer(84 + 50 * n), dv = new DataView(buf);
  for (let i = 0; i < Math.min(nombre.length, 79); i++) dv.setUint8(i, nombre.charCodeAt(i) & 0x7f);
  dv.setUint32(80, n, true);
  for (let t = 0; t < n; t++) {
    const k = t * 9, o = 84 + 50 * t;
    const ax = tri[k + 3] - tri[k], ay = tri[k + 4] - tri[k + 1], az = tri[k + 5] - tri[k + 2];
    const bx = tri[k + 6] - tri[k], by = tri[k + 7] - tri[k + 1], bz = tri[k + 8] - tri[k + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    dv.setFloat32(o, nx / l, true); dv.setFloat32(o + 4, ny / l, true); dv.setFloat32(o + 8, nz / l, true);
    for (let j = 0; j < 9; j++) dv.setFloat32(o + 12 + 4 * j, tri[k + j], true);
  }
  return buf;
}
