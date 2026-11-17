// Escaneo plantar del paciente (STL del Podoscan que llega de Baro): lo lee, lo pone en la misma posición que la
// plantilla y da sus medidas. Ejes de la plantilla: Y a lo largo (talón en 0, dedos hacia +Y), X a lo ancho
// (pie izquierdo con el lado interno hacia +X), Z hacia arriba (apoyo en 0, el arco sube).

// STL binario o de texto → lista de triángulos (9 números por triángulo).
export function leerSTL(buf) {
  const dv = new DataView(buf);
  const n = buf.byteLength >= 84 ? dv.getUint32(80, true) : 0;
  if (n > 0 && 84 + 50 * n === buf.byteLength) {
    const t = new Float32Array(9 * n);
    for (let i = 0; i < n; i++) for (let k = 0; k < 9; k++) t[9 * i + k] = dv.getFloat32(84 + 50 * i + 12 + 4 * k, true);
    return t;
  }
  const texto = new TextDecoder().decode(buf), v = [];
  for (const m of texto.matchAll(/vertex\s+(\S+)\s+(\S+)\s+(\S+)/g)) v.push(+m[1], +m[2], +m[3]);
  if (!v.length || v.length % 9) throw new Error('el archivo no parece un STL');
  return new Float32Array(v);
}

// Lado del pie por el nombre del archivo (Podoscan3D_IZ / Podoscan3D_DC); null si no lo dice.
export function ladoPorNombre(nombre) {
  const s = nombre.toUpperCase().replace(/\.STL$/, '');
  // el Podoscan los nombra IZ / DC o Izda / Dcha
  if (/(^|[^A-Z])(IZ|IZQ|IZDA|IZQUIERDO|SX|L|LEFT)$/.test(s) || /IZQ/.test(s)) return 'izq';
  if (/(^|[^A-Z])(DC|DCHA|DE|DER|DERECHO|DX|R|RIGHT)$/.test(s) || /DERECH/.test(s)) return 'der';
  return null;
}

// Pone el escaneo con los ejes de la plantilla: el largo del pie sobre Y (eje principal de los puntos), los dedos
// hacia +Y (el extremo más ancho), el apoyo abajo (el lado donde se juntan más puntos: talón y antepié apoyados).
// Solo gira, nunca espeja: el pie sigue siendo el mismo.
export function orientar(tri) {
  const n = tri.length / 3, P = new Float64Array(tri.length);
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += tri[3 * i]; my += tri[3 * i + 1]; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { const a = tri[3 * i] - mx, b = tri[3 * i + 1] - my; sxx += a * a; syy += b * b; sxy += a * b; }
  // ángulo del eje largo y giro para llevarlo a +Y
  const ang = 0.5 * Math.atan2(2 * sxy, sxx - syy), g = Math.PI / 2 - ang, c = Math.cos(g), s = Math.sin(g);
  for (let i = 0; i < n; i++) {
    const a = tri[3 * i] - mx, b = tri[3 * i + 1] - my;
    P[3 * i] = a * c - b * s; P[3 * i + 1] = a * s + b * c; P[3 * i + 2] = tri[3 * i + 2];
  }
  const rango = k => { let lo = Infinity, hi = -Infinity; for (let i = k; i < P.length; i += 3) { lo = Math.min(lo, P[i]); hi = Math.max(hi, P[i]); } return [lo, hi]; };
  // apoyo: si hay más puntos cerca del máximo de Z que del mínimo, el pie está boca abajo → girar 180° sobre Y
  let [z0, z1] = rango(2), cerca0 = 0, cerca1 = 0;
  for (let i = 2; i < P.length; i += 3) { if (P[i] < z0 + 3) cerca0++; if (P[i] > z1 - 3) cerca1++; }
  if (cerca1 > cerca0) for (let i = 0; i < n; i++) { P[3 * i] = -P[3 * i]; P[3 * i + 2] = -P[3 * i + 2]; }
  // dedos: el extremo más ancho va hacia +Y; si no, girar 180° sobre Z
  const anchoEn = (f0, f1) => {
    const [y0, y1] = rango(1); let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) { const t = (P[3 * i + 1] - y0) / (y1 - y0); if (t >= f0 && t <= f1) { lo = Math.min(lo, P[3 * i]); hi = Math.max(hi, P[3 * i]); } }
    return hi - lo;
  };
  if (anchoEn(0.1, 0.3) > anchoEn(0.6, 0.8)) for (let i = 0; i < n; i++) { P[3 * i] = -P[3 * i]; P[3 * i + 1] = -P[3 * i + 1]; }
  // talón en y = 0 y apoyo en z = 0 (el 2 % más bajo, para que un punto suelto no lo mueva)
  const [y0] = rango(1), zs = [];
  for (let i = 2; i < P.length; i += 3) zs.push(P[i]);
  zs.sort((a, b) => a - b);
  const zApoyo = zs[Math.floor(zs.length * 0.02)];
  const out = new Float32Array(P.length);
  for (let i = 0; i < n; i++) { out[3 * i] = P[3 * i]; out[3 * i + 1] = P[3 * i + 1] - y0; out[3 * i + 2] = P[3 * i + 2] - zApoyo; }
  return out;
}

// Medidas y referencias del escaneo ya orientado. `centro(f)` = centro a lo ancho en la fracción f del largo.
export function medirEscaneo(t) {
  const n = t.length / 3;
  let y1 = 0; for (let i = 0; i < n; i++) y1 = Math.max(y1, t[3 * i + 1]);
  const franja = (f0, f1) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) { const f = t[3 * i + 1] / y1; if (f >= f0 && f <= f1) { lo = Math.min(lo, t[3 * i]); hi = Math.max(hi, t[3 * i]); } }
    return [lo, hi];
  };
  const centro = f => { const [a, b] = franja(f - 0.03, f + 0.03); return (a + b) / 2; };
  const [a1, b1] = franja(0.6, 0.8), [a2, b2] = franja(0.08, 0.22);
  // arco: lo más alto del lado interno en la parte media del pie (lado interno = el que más sube ahí)
  // perfil del arco: lo más alto de cada lado en franjas de 2,5 % del largo, del 20 % al 65 %
  const cm = centro(0.45), NB = 19, perfI = new Float64Array(NB), perfD = new Float64Array(NB);
  for (let i = 0; i < n; i++) {
    const f = t[3 * i + 1] / y1, b = Math.round((f - 0.2) / 0.025); if (b < 0 || b >= NB) continue;
    const P = t[3 * i] > cm ? perfD : perfI; P[b] = Math.max(P[b], t[3 * i + 2]);
  }
  const zi = Math.max(...perfI), zd = Math.max(...perfD), perf = zd >= zi ? perfD : perfI, zmax = Math.max(zi, zd);
  // arcoPos = centro de la parte alta del arco (lo que pasa del 75 % de su altura), como fracción del largo
  // desde el talón: el arco es casi una meseta y el punto más alto solo salta de un lado a otro
  let sw = 0, sy = 0;
  perf.forEach((z, b) => { const w = Math.max(z - 0.75 * zmax, 0); sw += w; sy += w * (0.2 + 0.025 * b); });
  return { largo: y1, anchoAntepie: b1 - a1, anchoTalon: b2 - a2, arco: zmax, arcoPos: sw > 0 ? sy / sw : 0.4,
           internoHaciaMasX: zd >= zi, centro };
}

// Malla para el visor: une los puntos repetidos para que la superficie se vea suave.
export function mallaEscaneo(t) {
  const mapa = new Map(), pos = [], idx = new Uint32Array(t.length / 3);
  for (let i = 0; i < t.length / 3; i++) {
    const clave = `${Math.round(t[3 * i] * 1000)},${Math.round(t[3 * i + 1] * 1000)},${Math.round(t[3 * i + 2] * 1000)}`;
    let k = mapa.get(clave);
    if (k === undefined) { k = pos.length / 3; mapa.set(clave, k); pos.push(t[3 * i], t[3 * i + 1], t[3 * i + 2]); }
    idx[i] = k;
  }
  const p = new Float32Array(pos), nor = new Float32Array(p.length);
  for (let k = 0; k < idx.length; k += 3) {
    const a = 3 * idx[k], b = 3 * idx[k + 1], c = 3 * idx[k + 2];
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { nor[v] += nx; nor[v + 1] += ny; nor[v + 2] += nz; }
  }
  for (let v = 0; v < nor.length; v += 3) {
    const l = Math.hypot(nor[v], nor[v + 1], nor[v + 2]) || 1; nor[v] /= l; nor[v + 1] /= l; nor[v + 2] /= l;
  }
  return { pos: p, nor, idx };
}
