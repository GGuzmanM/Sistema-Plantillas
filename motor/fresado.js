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
export function gcodeEVA(izq, der, op = {}) {
  const r = op.radio ?? 5, bloque = { largo: 350, ancho: 260, alto: 26, ...op.bloque }, pasoY = op.pasoY ?? 0.5, pasoX = op.pasoX ?? 2;
  const sep = op.separacion ?? 7, zSeg = op.zSeguro ?? 55, zCont = op.zContorno ?? [15, 1];
  // mesa de trabajo (2026-11-19): material que queda de más arriba (para pulir) y corte del contorno más afuera
  const sobre = op.sobreespesor ?? 0, masAfuera = op.margenContorno ?? 0;
  const F = { trasladar: 14400, bajar: 900, cortar: 1800, relieve: 6000, ...op.velocidades }, S = op.husillo ?? 24000;
  // velocidad del relieve (2026-11-21, Ernesto: tardaba 40 min y LutraCAD 15-20): como LutraCAD ("Marketing PLANTILLA
  // T38.5"), solo las primeras filas de cada plantilla (3,5 mm, mientras la fresa entra en el bloque) van a F1800;
  // el resto del relieve más rápido: LutraCAD usa F14400; aquí punto medio F6000 (≈14 min el par) para no forzar la
  // fresa (Ernesto). El contorno sigue a F1800.
  const entradaLenta = op.entradaLenta ?? 3.5;
  const avisos = [], L = [];
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

  L.push(`((${(op.nombre ?? 'plantilla').replace(/[()]/g, '')}))`, '%', 'G90', 'G28', `S${S}`, 'M03', 'G64', `F${F.trasladar}`, `G01 Z${f2(zSeg)}`);
  let puntos = 0;
  // relieve, una plantilla y después la otra; filas desde el borde externo del bloque hacia el centro
  datos.forEach(({ lado, m }, ip) => {
    let Y0 = Infinity, Y1 = -Infinity; for (const [, y] of m.borde) { Y0 = Math.min(Y0, y); Y1 = Math.max(Y1, y); }
    const filas = [];
    if (lado === 'izq') for (let Y = Math.floor(Y1 / pasoY) * pasoY; Y >= Y0; Y -= pasoY) filas.push(Y);
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
        const z = Math.min(alturaBola(m, X, Y, r) + sobre, bloque.alto);
        if (primero) { if (ip > 0) L.push(`F${F.trasladar}`, `G01 Z${f2(zSeg)}`); L.push(`G01 X${f2(X)} Y${f2(Y)}`, `F${F.bajar}`, `G01 Z${f2(z)}`, `F${F.cortar}`); primero = false; }
        else L.push(k === 0 ? `G01 X${f2(X)} Y${f2(Y)} Z${f2(z)}` : `G01 X${f2(X)} Z${f2(z)}`);
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
  return { texto: L.join('\n') + '\n', avisos, lineas: L.length, puntos, alturaMax: zMax, inicioContorno };
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
