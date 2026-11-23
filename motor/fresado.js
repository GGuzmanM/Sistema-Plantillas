// G-code para la fresadora de EVA (Sensor Medica VX1R con EdingCNC 4.03), 2026-11-17.
// Copia el formato de los trabajos que ya fresa la máquina (ejemplo de Ernesto: "... BAROFLEX DEPORTIVAS DYNAMIC.iso"):
// · el par en un solo bloque, cero en el centro del bloque; Z 0 = base del bloque; mm, absolutos (G90)
// · cada plantilla acostada a lo largo de X (talón en X negativo, dedos en X positivo); la izquierda en Y positivo y
//   la derecha en Y negativo, con el arco mirando al centro
// · relieve en zigzag: filas a lo largo cada 0,5 mm a lo ancho, un punto cada 2 mm; después el contorno, una vuelta a
//   Z 15 y otra a Z 1 (queda 1 mm sin cortar para que no se suelten)
// · S24000 M03, G64, todo con G01: F14400 para trasladar, F900 para bajar, F1800 para entrar (primeras filas) y el
//   contorno, F6000 para el resto del relieve (LutraCAD 14400; punto medio, 2026-11-21); al final Z 55, G28, M5
// La fresa es de punta redonda (bola): la altura de cada punto se calcula para que la bola no toque la plantilla en
// ningún lado (no "come" las paredes de la copa ni del arco).

const f2 = v => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);

// Pasa la plantilla generada (pie izquierdo o derecho, talón en y = 0) a coordenadas de la máquina: X a lo largo
// (centrado), Y a lo ancho con el lado interno hacia el centro del bloque. `y0` = Y del borde interno (positivo para
// la izquierda, negativo para la derecha).
function aMaquina(g, lado, y0) {
  const { x, y } = g; let L = 0, xmin = Infinity, xmax = -Infinity;
  for (let q = 0; q < y.length; q++) { L = Math.max(L, y[q]); xmin = Math.min(xmin, x[q]); xmax = Math.max(xmax, x[q]); }
  // izquierda: interno = +x → Y = c - x con el mínimo en y0; derecha: interno = -x → Y = c - x con el máximo en y0
  const c = lado === 'izq' ? y0 + xmax : y0 + xmin;
  return { X: q => y[q] - L / 2, Y: q => c - x[q], largo: L };
}

// Mapa de alturas de la cara de arriba en coordenadas de la máquina (celdas de `R` mm)
function mapa(g, M, R) {
  const { ns, nr, z } = g; let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
  for (let q = 0; q < z.length; q++) { const a = M.X(q), b = M.Y(q); X0 = Math.min(X0, a); X1 = Math.max(X1, a); Y0 = Math.min(Y0, b); Y1 = Math.max(Y1, b); }
  X0 -= 1; Y0 -= 1; const NX = Math.ceil((X1 - X0) / R) + 3, NY = Math.ceil((Y1 - Y0) / R) + 3, H = new Float32Array(NX * NY).fill(-1);
  const tri = (a, b, c) => {
    const ax = (M.X(a) - X0) / R, ay = (M.Y(a) - Y0) / R, bx = (M.X(b) - X0) / R, by = (M.Y(b) - Y0) / R, cx = (M.X(c) - X0) / R, cy = (M.Y(c) - Y0) / R;
    const d = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); if (Math.abs(d) < 1e-12) return;
    for (let j = Math.max(0, Math.floor(Math.min(ay, by, cy))); j <= Math.min(NY - 1, Math.ceil(Math.max(ay, by, cy))); j++)
      for (let i = Math.max(0, Math.floor(Math.min(ax, bx, cx))); i <= Math.min(NX - 1, Math.ceil(Math.max(ax, bx, cx))); i++) {
        const s = ((i - ax) * (cy - ay) - (j - ay) * (cx - ax)) / d, t = ((bx - ax) * (j - ay) - (by - ay) * (i - ax)) / d;
        if (s < -1e-6 || t < -1e-6 || s + t > 1 + 1e-6) continue;
        const zz = z[a] + s * (z[b] - z[a]) + t * (z[c] - z[a]), k = j * NX + i; if (zz > H[k]) H[k] = zz;
      }
  };
  for (let i = 0; i < ns; i++) { const j = (i + 1) % ns; for (let k = 0; k < nr - 1; k++) { const a = i * nr + k, b = j * nr + k, c = j * nr + k + 1, d = i * nr + k + 1; tri(a, b, c); tri(a, c, d); } }
  // 2026-11-21: también cada vértice en el nodo más cercano (la cresta del borde puede quedar entre dos nodos y la
  // fresa bajaba hasta 0,4 mm de más en las paredes empinadas); queda del lado seguro
  for (let q = 0; q < z.length; q++) { const i = Math.round((M.X(q) - X0) / R), j = Math.round((M.Y(q) - Y0) / R), k = j * NX + i; if (i >= 0 && j >= 0 && i < NX && j < NY && z[q] > H[k]) H[k] = z[q]; }
  // borde de la plantilla en coordenadas de la máquina (para las filas y el contorno)
  const borde = []; for (let i = 0; i < ns; i++) borde.push([M.X(i * nr), M.Y(i * nr)]);
  return { H, NX, NY, X0, Y0, R, borde };
}

// Altura de la punta de la bola en (X, Y) sin tocar la plantilla: el máximo, sobre la superficie a menos de r, de
// h + √(r² − d²) − r (nunca menos que 0, la base del bloque)
function alturaBola(m, X, Y, r) {
  const { H, NX, NY, X0, Y0, R } = m, ci = (X - X0) / R, cj = (Y - Y0) / R, n = Math.ceil(r / R);
  let z = 0;
  for (let j = Math.max(0, Math.floor(cj - n)); j <= Math.min(NY - 1, Math.ceil(cj + n)); j++)
    for (let i = Math.max(0, Math.floor(ci - n)); i <= Math.min(NX - 1, Math.ceil(ci + n)); i++) {
      const h = H[j * NX + i]; if (h < 0) continue;
      const dx = (i - ci) * R, dy = (j - cj) * R, d2 = dx * dx + dy * dy; if (d2 > r * r) continue;
      const zz = h + Math.sqrt(r * r - d2) - r; if (zz > z) z = zz;
    }
  return z;
}

// Tramo de X que ocupa la plantilla en la fila Y (del borde)
function tramo(borde, Y) {
  const xs = [];
  for (let i = 0; i < borde.length; i++) { const [ax, ay] = borde[i], [bx, by] = borde[(i + 1) % borde.length]; if ((ay - Y) * (by - Y) <= 0 && ay !== by) xs.push(ax + (Y - ay) / (by - ay) * (bx - ax)); }
  return xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)] : null;
}

// Contorno corrido r hacia afuera (centro de la bola), repartido cada ~0,6 mm, empezando por el punto más cercano al
// centro del bloque en el antepié (como el ejemplo)
function contornoFresa(borde, r) {
  let area = 0; for (let i = 0; i < borde.length; i++) { const [a, b] = borde[i], [c, d] = borde[(i + 1) % borde.length]; area += a * d - c * b; }
  const s = area > 0 ? 1 : -1, n = borde.length, out = [];
  for (let i = 0; i < n; i++) {
    const [ax, ay] = borde[(i - 3 + n) % n], [bx, by] = borde[(i + 3) % n], tx = bx - ax, ty = by - ay, l = Math.hypot(tx, ty) || 1;
    // normal hacia afuera: para un polígono antihorario es (ty, -tx)
    out.push([borde[i][0] + s * (ty / l) * r, borde[i][1] - s * (tx / l) * r]);
  }
  // repartir parejo
  const ac = [0]; for (let i = 1; i <= n; i++) ac.push(ac[i - 1] + Math.hypot(out[i % n][0] - out[i - 1][0], out[i % n][1] - out[i - 1][1]));
  const tot = ac[n], m = Math.max(50, Math.round(tot / 0.6)), P = [];
  for (let k = 0, i = 0; k < m; k++) { const t = (k / m) * tot; while (i < n - 1 && ac[i + 1] < t) i++; const u = (t - ac[i]) / ((ac[i + 1] - ac[i]) || 1), a = out[i], b = out[(i + 1) % n]; P.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]); }
  // empezar en la punta de los dedos (X máximo). Antes empezaba en el antepié interno, junto al arco, como el ejemplo
  // de LutraCAD; 2026-11-21, Ernesto: en el pie derecho la fresa mordió ahí, donde bajaba y volvía en cada vuelta.
  // En la punta la pared es la más baja y lo que sobra es desperdicio.
  let k0 = 0, mejor = -Infinity; P.forEach(([x], k) => { if (x > mejor) { mejor = x; k0 = k; } });
  return [...P.slice(k0), ...P.slice(0, k0)];
}

// izq, der = plantillas generadas (generar); op = { nombre, radio (5), bloque {largo 350, ancho 260, alto 26},
// pasoY (0,5), pasoX (2), separacion (7 = Y del borde interno), zSeguro (55), zContorno ([15, 1]), velocidades }
// Parámetros comunes del G-code (de la mesa de trabajo y el material)
function parametros(op) {
  return {
    r: op.radio ?? 5, bloque: { largo: 350, ancho: 260, alto: 26, ...op.bloque }, pasoY: op.pasoY ?? 0.5, pasoX: op.pasoX ?? 2,
    zSeg: op.zSeguro ?? 55, zCont: op.zContorno ?? [15, 1],
    // mesa de trabajo (2026-11-19): material que queda de más arriba (para pulir) y corte del contorno más afuera
    sobre: op.sobreespesor ?? 0, masAfuera: op.margenContorno ?? 0,
    F: { trasladar: 14400, bajar: 900, cortar: 1800, relieve: 6000, ...op.velocidades }, S: op.husillo ?? 24000,
    // velocidad del relieve (2026-11-21, Ernesto: tardaba 40 min y LutraCAD 15-20): como LutraCAD ("Marketing PLANTILLA
    // T38.5"), solo las primeras filas de cada plantilla (3,5 mm, mientras la fresa entra en el bloque) van a F1800;
    // el resto del relieve más rápido: LutraCAD usa F14400; aquí punto medio F6000 (≈14 min el par) para no forzar la
    // fresa (Ernesto). El contorno sigue a F1800.
    entradaLenta: op.entradaLenta ?? 3.5,
  };
}

export function gcodeEVA(izq, der, op = {}) {
  const { r, bloque, zSeg, sobre, masAfuera } = parametros(op), sep = op.separacion ?? 7;
  const avisos = [];
  const pies = [['izq', izq, sep], ['der', der, -sep]].filter(p => p[1]);
  const datos = pies.map(([lado, g, y0]) => { const M = aMaquina(g, lado, y0); return { lado, M, m: mapa(g, M, 0.5) }; });
  // que entre en el bloque (con la fresa) y no pase su alto
  let zMax = 0;
  for (const { m, lado } of datos) {
    let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity;
    for (const [x, y] of m.borde) { X0 = Math.min(X0, x); X1 = Math.max(X1, x); Y0 = Math.min(Y0, y); Y1 = Math.max(Y1, y); }
    if (X0 - r - masAfuera < -bloque.largo / 2 || X1 + r + masAfuera + 3 > bloque.largo / 2) avisos.push(`La plantilla ${lado === 'izq' ? 'izquierda' : 'derecha'} no entra a lo largo del bloque (${Math.round(X1 - X0 + 2 * r)} mm con la fresa; el bloque mide ${bloque.largo}).`);
    if (Math.min(Math.abs(Y0), Math.abs(Y1)) < 0 || Math.max(Math.abs(Y0), Math.abs(Y1)) + r + masAfuera > bloque.ancho / 2) avisos.push(`La plantilla ${lado === 'izq' ? 'izquierda' : 'derecha'} no entra a lo ancho del bloque.`);
    for (const v of m.H) zMax = Math.max(zMax, v);
  }
  if (zMax + sobre > bloque.alto - 0.5) avisos.push(`La plantilla mide ${zMax.toFixed(1)} mm de alto y el bloque ${bloque.alto} mm: no alcanza.`);
  // auditoría 2026-11-19 (seguridad): con la altura segura por debajo del bloque la fresa se trasladaría a través del EVA
  if (zSeg < bloque.alto + 10) avisos.push(`La altura segura (${zSeg} mm) debe quedar al menos 10 mm sobre el bloque (${bloque.alto} mm): cámbiela en Inicio → Máquinas.`);
  // filas: la izquierda desde Y redondeado hacia abajo y la derecha hacia arriba (así quedaron los G-code de siempre)
  return escribirGcode(datos.map(d => ({ m: d.m, techo: d.lado === 'der' })), op, avisos, zMax);
}

// Escribe el G-code de una o varias plantillas ya puestas en la máquina: datos = [{ m (mapa), techo? }], en orden.
// Relieve de cada plantilla (una después de la otra) y después los contornos.
function escribirGcode(datos, op, avisos, zMax) {
  const { r, bloque, pasoY, pasoX, zSeg, zCont, sobre, masAfuera, F, S, entradaLenta } = parametros(op), L = [];
  L.push(`((${(op.nombre ?? 'plantilla').replace(/[()]/g, '')}))`, '%', 'G90', 'G28', `S${S}`, 'M03', 'G64', `F${F.trasladar}`, `G01 Z${f2(zSeg)}`);
  let puntos = 0, ant = null;
  const altura = (m, X, Y) => Math.min(alturaBola(m, X, Y, r) + sobre, bloque.alto);
  // 2026-11-21: entre dos puntos la fresa va en recta; si a 1/4, 1/2 o 3/4 del tramo la bola tocaría la plantilla
  // (más de 0,03 mm), se agrega el punto del medio con su altura y se revisan las dos mitades (hasta 6 veces)
  const intermedios = (m, a, b, n) => {
    if (n >= 6 || Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.1) return [];
    const en = t => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2])];
    if (![0.25, 0.5, 0.75].some(t => { const p = en(t); return altura(m, p[0], p[1]) - p[2] > 0.03; })) return [];
    const c = en(0.5); c[2] = Math.max(altura(m, c[0], c[1]), c[2]);
    return [...intermedios(m, a, c, n + 1), c, ...intermedios(m, c, b, n + 1)];
  };
  // relieve, una plantilla y después la otra; filas desde el borde externo del bloque hacia el centro
  datos.forEach(({ techo, m }, ip) => {
    let Y0 = Infinity, Y1 = -Infinity; for (const [, y] of m.borde) { Y0 = Math.min(Y0, y); Y1 = Math.max(Y1, y); }
    const filas = [];
    if (!techo) for (let Y = Math.floor(Y1 / pasoY) * pasoY; Y >= Y0; Y -= pasoY) filas.push(Y);
    else for (let Y = Math.ceil(Y1 / pasoY) * pasoY; Y >= Y0; Y -= pasoY) filas.push(Y);
    let primero = true, sentido = 1, yInicio = null, rapido = false;
    for (const Y of filas) {
      const t = tramo(m.borde, Y); if (!t) continue;
      const xs = []; for (let X = Math.ceil((t[0] + 1) / pasoX) * pasoX - 1; X <= t[1]; X += pasoX) xs.push(X);
      if (!xs.length) continue;
      if (sentido < 0) xs.reverse();
      if (yInicio === null) yInicio = Y;
      else if (!rapido && Math.abs(Y - yInicio) > entradaLenta && F.relieve !== F.cortar) { L.push(`F${F.relieve}`); rapido = true; }
      xs.forEach((X, k) => {
        const z = altura(m, X, Y);
        if (primero) { if (ip > 0) L.push(`F${F.trasladar}`, `G01 Z${f2(zSeg)}`); L.push(`G01 X${f2(X)} Y${f2(Y)}`, `F${F.bajar}`, `G01 Z${f2(z)}`, `F${F.cortar}`); primero = false; }
        else {
          // puntos intermedios donde la recta desde el punto anterior pasaría por dentro de la plantilla
          for (const p of intermedios(m, ant, [X, Y, z], 0)) L.push(`G01 X${f2(p[0])} Y${f2(p[1])} Z${f2(p[2])}`);
          L.push(k === 0 ? `G01 X${f2(X)} Y${f2(Y)} Z${f2(z)}` : `G01 X${f2(X)} Z${f2(z)}`);
        }
        ant = [X, Y, z];
        puntos++;
      });
      sentido = -sentido;
    }
  });
  const inicioContorno = L.length;
  // contornos: una vuelta a Z 15 y otra a Z 1
  if (zCont.length) for (const { m } of datos) {
    const P = contornoFresa(m.borde, r + masAfuera);
    // entrada (2026-11-21): baja ENTRE 3 mm más afuera de la punta, en el EVA que sobra, y de ahí entra al contorno;
    // al terminar cada vuelta sale otra vez ahí. Así la fresa nunca baja ni se detiene pegada a la plantilla.
    const n = P.length, tx = P[1][0] - P[n - 1][0], ty = P[1][1] - P[n - 1][1], tl = Math.hypot(tx, ty) || 1;
    let cx = 0, cy = 0; for (const [x, y] of P) { cx += x / n; cy += y / n; }
    let nx = ty / tl, ny = -tx / tl; if (nx * (P[0][0] - cx) + ny * (P[0][1] - cy) < 0) { nx = -nx; ny = -ny; }
    const E = [P[0][0] + 3 * nx, P[0][1] + 3 * ny];
    L.push(`F${F.trasladar}`, `G01 Z${f2(zSeg)}`, `G01 X${f2(E[0])} Y${f2(E[1])}`);
    for (const zc of zCont) {
      L.push(`F${F.bajar}`, `G01 Z${f2(zc)}`, `F${F.cortar}`);
      for (const [x, y] of [...P, P[0], E]) L.push(`G01 X${f2(x)} Y${f2(y)}`);
    }
  }
  L.push(`G01 Z${f2(zSeg)}`, 'G28', 'M5', '%');
  const texto = L.join('\n') + '\n';
  return { texto, avisos, lineas: L.length, puntos, alturaMax: zMax, inicioContorno, minutos: minutosGcode(texto) };
}

// Tiempo teórico del G-code en minutos (largo de cada tramo / su velocidad, sin aceleraciones)
export function minutosGcode(texto) {
  let x = 0, y = 0, z = 0, f = 1, s = 0;
  for (const l of texto.split('\n')) {
    const g = l.match(/^F([\d.]+)/); if (g) { f = +g[1]; continue; }
    if (!l.startsWith('G01')) continue;
    const a = l.match(/X(-?[\d.]+)/), b = l.match(/Y(-?[\d.]+)/), c = l.match(/Z(-?[\d.]+)/);
    const nx = a ? +a[1] : x, ny = b ? +b[1] : y, nz = c ? +c[1] : z; s += Math.hypot(nx - x, ny - y, nz - z) / f; x = nx; y = ny; z = nz;
  }
  return s;
}

// ---- Varias plantillas en un taco (módulo Fresado, beta; Ernesto 2026-11-23) ----
// Cada pieza = { g (plantilla generada), x, y (centro en la máquina, mm), giro (grados, antihorario), nombre }.
// Giro 0 = como en el par de siempre: acostada a lo largo de X con el talón en X negativo; en el pie izquierdo el lado
// interno mira a Y negativo y en el derecho a Y positivo (si la izquierda va arriba, los arcos se miran).
export function colocarPieza(g, { x = 0, y = 0, giro = 0 } = {}) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let q = 0; q < g.x.length; q++) { x0 = Math.min(x0, g.x[q]); x1 = Math.max(x1, g.x[q]); y0 = Math.min(y0, g.y[q]); y1 = Math.max(y1, g.y[q]); }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, a = (giro * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  // primero acostada (X = a lo largo, Y = -ancho: es un giro, no un espejo), después el giro y el lugar
  const X = q => { const u = g.y[q] - cy, v = -(g.x[q] - cx); return x + u * c - v * s; };
  const Y = q => { const u = g.y[q] - cy, v = -(g.x[q] - cx); return y + u * s + v * c; };
  return { X, Y, largo: y1 - y0, ancho: x1 - x0 };
}

// distancia de un punto a un polígono cerrado (0 si está adentro)
function distPoligono(P, X, Y) {
  let d = Infinity, dentro = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, ay] = P[j], [bx, by] = P[i];
    if ((ay > Y) !== (by > Y) && X < ax + ((Y - ay) / (by - ay)) * (bx - ax)) dentro = !dentro;
    const ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey, t = l2 ? Math.min(1, Math.max(0, ((X - ax) * ex + (Y - ay) * ey) / l2)) : 0;
    d = Math.min(d, Math.hypot(X - ax - t * ex, Y - ay - t * ey));
  }
  return dentro ? 0 : d;
}

// G-code de un taco con varias plantillas. op = lo mismo que gcodeEVA más: margen (mm libres desde el corte de la
// fresa hasta el borde del taco, 5 por defecto; Ernesto 2026-11-23) y altoEn(X, Y) (alto del taco en ese punto, para
// el preformado; sin él, el taco es recto de bloque.alto).
// Revisa antes de escribir: que cada plantilla con su corte quede dentro del taco con el margen, que la fresa de una no
// toque a otra (contorno y entrada del contorno a más de un radio de la otra), y que el taco alcance de alto.
export function gcodeTaco(piezas, op = {}) {
  const { r, bloque, zSeg, sobre, masAfuera } = parametros(op), margen = op.margen ?? 5, altoEn = op.altoEn ?? (() => bloque.alto);
  const avisos = [];
  if (!piezas.length) avisos.push('No hay plantillas en el taco.');
  const datos = piezas.map((p, i) => { const M = colocarPieza(p.g, p); return { nombre: p.nombre ?? `plantilla ${i + 1}`, M, g: p.g, m: mapa(p.g, M, 0.5) }; });
  let zMax = 0;
  for (const d of datos) {
    // dentro del taco con el corte de la fresa y el margen: el corte llega a 2 radios (más el corte más afuera) del
    // borde de la plantilla, y de ahí al borde del taco quedan `margen` mm
    let fuera = 0;
    for (const [x, y] of d.m.borde) fuera = Math.max(fuera, Math.abs(x) + 2 * r + masAfuera + margen - bloque.largo / 2, Math.abs(y) + 2 * r + masAfuera + margen - bloque.ancho / 2);
    if (fuera > 0.05) avisos.push(`${d.nombre}: se sale del taco o no deja ${margen} mm de margen al borde (faltan ${fuera.toFixed(1)} mm).`);
    // alto del taco en cada punto
    let falta = 0;
    for (let q = 0; q < d.g.z.length; q++) { const z = d.g.z[q] + sobre; zMax = Math.max(zMax, d.g.z[q]); falta = Math.max(falta, z - (altoEn(d.M.X(q), d.M.Y(q)) - 0.5)); }
    if (falta > 0) avisos.push(`${d.nombre}: el taco no alcanza de alto (faltan ${falta.toFixed(1)} mm).`);
  }
  // la fresa de una plantilla (contorno, con su entrada 3 mm más afuera) no puede tocar a otra
  for (let i = 0; i < datos.length; i++) {
    const P = contornoFresa(datos[i].m.borde, r + masAfuera), n = P.length;
    let cx = 0, cy = 0; for (const [x, y] of P) { cx += x / n; cy += y / n; }
    const tx = P[1][0] - P[n - 1][0], ty = P[1][1] - P[n - 1][1], tl = Math.hypot(tx, ty) || 1;
    let nx = ty / tl, ny = -tx / tl; if (nx * (P[0][0] - cx) + ny * (P[0][1] - cy) < 0) { nx = -nx; ny = -ny; }
    const camino = [...P, [P[0][0] + 3 * nx, P[0][1] + 3 * ny]];
    let X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity; for (const [x, y] of camino) { X0 = Math.min(X0, x); X1 = Math.max(X1, x); Y0 = Math.min(Y0, y); Y1 = Math.max(Y1, y); }
    for (let j = 0; j < datos.length; j++) {
      if (j === i) continue;
      const B = datos[j].m.borde;
      if (!B.some(([x, y]) => x > X0 - r && x < X1 + r && y > Y0 - r && y < Y1 + r)) continue;
      let dmin = Infinity; for (let k = 0; k < camino.length; k += 2) dmin = Math.min(dmin, distPoligono(B, camino[k][0], camino[k][1]));
      if (dmin < r + 0.3) avisos.push(`${datos[i].nombre} y ${datos[j].nombre} quedan muy juntas: la fresa de una tocaría la otra (separe un poco más).`);
    }
  }
  if (zMax + sobre > bloque.alto - 0.5) avisos.push(`Las plantillas miden hasta ${zMax.toFixed(1)} mm de alto y el taco ${bloque.alto} mm: no alcanza.`);
  if (zSeg < bloque.alto + 10) avisos.push(`La altura segura (${zSeg} mm) debe quedar al menos 10 mm sobre el bloque (${bloque.alto} mm): cámbiela en Inicio → Máquinas.`);
  const unicos = [...new Set(avisos)];
  return escribirGcode(datos.map(d => ({ m: d.m, techo: false })), op, unicos, zMax);
}

// Revisión del G-code de un taco (como revisarTrayecto): cuánto entraría la bola en cada pieza como máximo, mm.
export function revisarTaco(piezas, texto, op = {}) {
  const r = op.radio ?? 5, mapas = piezas.map(p => mapa(p.g, colocarPieza(p.g, p), 0.5)), peor = piezas.map(() => 0);
  let x = 0, y = 0, z = 0;
  for (const l of texto.split('\n').slice(0, op.hasta ?? Infinity)) {
    if (!l.startsWith('G01')) continue;
    const a = l.match(/X(-?[\d.]+)/), b = l.match(/Y(-?[\d.]+)/), c = l.match(/Z(-?[\d.]+)/);
    const nx = a ? +a[1] : x, ny = b ? +b[1] : y, nz = c ? +c[1] : z;
    const d = Math.hypot(nx - x, ny - y), n = Math.max(1, Math.ceil(d / 0.2));
    if (Math.min(z, nz) < 40) for (let k = 0; k <= n; k++) {
      const t = k / n, X = x + t * (nx - x), Y = y + t * (ny - y), Z = z + t * (nz - z);
      mapas.forEach((m, i) => { const e = alturaBola(m, X, Y, r) - Z; if (e > peor[i]) peor[i] = e; });
    }
    x = nx; y = ny; z = nz;
  }
  return peor;
}

// Revisión (2026-11-21, Ernesto: en el pie derecho la fresa tocó el arco): recorre el G-code cada 0,2 mm, también
// ENTRE los puntos, y devuelve cuánto entraría la bola como máximo en cada plantilla (mm) y dónde.
export function revisarTrayecto(izq, der, texto, op = {}) {
  const r = op.radio ?? 5, sep = op.separacion ?? 7;
  const mapas = [['izq', izq, sep], ['der', der, -sep]].filter(p => p[1]).map(([lado, g, y0]) => ({ lado, m: mapa(g, aMaquina(g, lado, y0), 0.5) }));
  const peor = Object.fromEntries(mapas.map(({ lado }) => [lado, { mm: 0, X: 0, Y: 0 }]));
  let x = 0, y = 0, z = 0;
  for (const l of texto.split('\n').slice(0, op.hasta ?? Infinity)) {
    if (!l.startsWith('G01')) continue;
    const a = l.match(/X(-?[\d.]+)/), b = l.match(/Y(-?[\d.]+)/), c = l.match(/Z(-?[\d.]+)/);
    const nx = a ? +a[1] : x, ny = b ? +b[1] : y, nz = c ? +c[1] : z;
    const d = Math.hypot(nx - x, ny - y), n = Math.max(1, Math.ceil(d / 0.2));
    if (Math.min(z, nz) < 40) for (let k = 0; k <= n; k++) {
      const t = k / n, X = x + t * (nx - x), Y = y + t * (ny - y), Z = z + t * (nz - z);
      for (const { lado, m } of mapas) { const e = alturaBola(m, X, Y, r) - Z; if (e > peor[lado].mm) peor[lado] = { mm: e, X, Y }; }
    }
    x = nx; y = ny; z = nz;
  }
  return peor;
}
