// Módulo Fresado (beta), Ernesto 2026-11-23: varias plantillas de EVA en un mismo taco y un solo G-code.
//
// · Cola de fresado: cada diseño que se manda desde 4. Exportar ("Enviar a cola de fresado"), con su material EVA.
//   Se filtra por material (Relax, Protection, Dynamic…); se marcan los que van en el taco y de cada uno si va el par,
//   solo el izquierdo o solo el derecho. Ernesto marca a mano cuáles ya se fresaron.
// · Taco: recto o preformado (26 mm del lado del talón, baja a la mitad del largo y queda en 8 mm), con largo, ancho,
//   alto y margen al borde que se pueden cambiar. El margen se cuenta desde el corte de la fresa.
// · Las plantillas se acomodan solas (en los espacios libres: derechas, al revés o atravesadas; en el preformado solo
//   derechas, con el talón al lado alto) y se pueden mover a mano (arrastrar) y girar. Se ve en 3D con el cubo de vistas.
// · El G-code (motor/fresado.js, gcodeTaco) se nombra con todos los pacientes; "(solo derecho)" si va un pie.
//
// Coordenadas = las de la máquina: X a lo largo del taco, Y a lo ancho, Z arriba; cero en el centro, Z 0 en la base.

import { crearVisor, crearCubo } from './visor.js';
import { gcodeTaco, colocarPieza } from '../motor/fresado.js';
import { opcionesGcode } from './maquinas.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n1 = v => (Math.round(v * 10) / 10).toString().replace('.', ',');
const sm = (a, b, v) => { v = Math.min(1, Math.max(0, (v - a) / (b - a))); return v * v * (3 - 2 * v); };
const COLORES = [[0.33, 0.58, 0.93], [0.55, 0.5, 0.92], [0.25, 0.7, 0.55], [0.9, 0.55, 0.3], [0.88, 0.45, 0.6], [0.45, 0.7, 0.3], [0.8, 0.62, 0.25], [0.35, 0.7, 0.8]];
const ROJO = [0.9, 0.25, 0.2], PUENTE = 2;   // mm de EVA que quedan entre los cortes de dos plantillas

// forma guardada en la cola (Float32 en base64) → plantilla como la de generar (ns, nr, x, y, z, zb)
const deB64 = s => { const t = atob(s), b = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i); return new Float32Array(b.buffer); };
const formas = new Map();   // id:lado → g
const forma = (it, lado) => {
  const k = it.id + ':' + lado + ':' + it.enviado;
  if (!formas.has(k)) { const f = it[lado]; formas.set(k, { ns: f.ns, nr: f.nr, x: deB64(f.x), y: deB64(f.y), z: deB64(f.z), zb: deB64(f.zb) }); }
  return formas.get(k);
};

// estado (se mantiene al ir y volver de la pantalla)
const E = { mat: null, sel: new Set(), pre: false, med: null, mesa: null, pos: new Map(), elegida: null, verFresadas: false, ultimo: null };

export async function pintarFresado(cuerpo, ctx) {
  const maq = ctx.maquinas();
  let cola = [];
  try { cola = await ctx.leerCola(); } catch (e) { cuerpo.innerHTML = `<div class="inicio-aviso"><p>No se pudo leer la cola de fresado: ${esc(e.message)}</p></div>`; return; }
  const mesa = () => maq.mesas.find(m => m.id === E.mesa) ?? maq.mesas[0];
  if (!E.med) { const m = mesa(); E.med = { largo: m.largo, ancho: m.ancho, alto: m.alto, bajo: 8, margen: 5 }; }
  const mats = [...maq.materiales.map(m => ({ id: m.id, nombre: m.nombre })), ...cola.map(x => x.material).filter(m => m && !maq.materiales.some(a => a.id === m.id))]
    .filter((m, i, a) => a.findIndex(b => b.id === m.id) === i);
  if (!E.mat || !mats.some(m => m.id === E.mat)) E.mat = (cola.find(x => x.estado !== 'fresado')?.material?.id) ?? mats[0]?.id;
  const porId = new Map(cola.map(x => [x.id, x]));
  for (const id of [...E.sel]) if (!porId.has(id) || porId.get(id).estado === 'fresado') E.sel.delete(id);

  cuerpo.innerHTML = `<div class="inicio-titulo"><h2>Fresado <span class="etq-beta">beta</span></h2>
      <span class="nota-fresado">Varias plantillas en un taco y un solo G-code. Los diseños llegan desde 4. Exportar → "Enviar a cola de fresado".</span></div>
    <div class="fresado">
      <div class="fr-cola">
        <div class="fr-tit" id="frTitCola"></div>
        <div class="fr-chips" id="frMats"></div>
        <div id="frLista"></div>
        <label class="fr-ver"><input type="checkbox" id="frVerFresadas" ${E.verFresadas ? 'checked' : ''}> Ver las ya fresadas</label>
      </div>
      <div class="fr-centro">
        <div class="fr-visor"><canvas id="frLienzo"></canvas><canvas id="frCubo" class="fr-cubo" title="Clic en una cara o esquina para mirar desde ahí; arrastrar para girar"></canvas>
          <div class="fr-ayuda">Arrastre una plantilla para moverla · clic para elegirla y girarla · derecho: girar la vista</div></div>
        <div class="fr-est" id="frEst"></div>
        <div class="fr-avisos" id="frAvisos"></div>
      </div>
      <div class="fr-opciones">
        <div class="fr-tit">Tipo de taco</div>
        <div class="modos-corte fr-tipo"><button data-pre="0">Recto</button><button data-pre="1">Preformado</button></div>
        <div class="fr-tit">Medidas del taco (mm)</div>
        <div class="fr-med">
          <label>Largo<input type="number" id="frLargo" min="150" max="600" step="1"></label>
          <label>Ancho<input type="number" id="frAncho" min="100" max="500" step="1"></label>
          <label>Alto<input type="number" id="frAlto" min="10" max="60" step="0.5"></label>
          <label title="Desde el corte de la fresa hasta el borde del taco">Margen al borde<input type="number" id="frMargen" min="0" max="30" step="0.5"></label>
          <label id="frBajoL">Alto parte baja<input type="number" id="frBajo" min="3" max="60" step="0.5"></label>
        </div>
        <div class="fr-tit">Mesa de trabajo</div>
        <select id="frMesa">${maq.mesas.map(m => `<option value="${esc(m.id)}">${esc(m.nombre)}</option>`).join('')}</select>
        <div class="fr-pieza" id="frPieza"></div>
        <button id="frRecomendar">✦ Recomendar</button>
        <button id="frReacomodar" title="Vuelve a acomodar todas las plantillas marcadas (se pierden los movimientos a mano)">Reacomodar todo</button>
        <button id="frVista">Vista inicial</button>
        <button class="primario" id="frGcode">Generar G-code</button>
        <div class="fr-tit">Nombre del archivo</div>
        <div class="fr-archivo" id="frArchivo">—</div>
        <div id="frDespues"></div>
      </div>
    </div>`;
  const $ = id => cuerpo.querySelector('#' + id);
  $('frMesa').value = mesa().id;

  // ---- visor ----
  const visor = crearVisor($('frLienzo')); crearCubo($('frCubo'), visor);
  const vistaInicial = () => { const { largo: L, ancho: A, alto: H } = E.med; visor.girarA(-30, 40); visor.encuadrar([-L / 2 - 10, -A / 2 - 10, 0, L / 2 + 10, A / 2 + 10, H]); };

  // ---- medidas y forma del taco ----
  const R = () => mesa().diametro / 2, masAfuera = () => mesa().margenContorno ?? 0;
  // desde el borde de la plantilla: el corte llega a 2 radios (más el corte más afuera); después el margen
  const BORDE = () => E.med.margen + 2 * R() + masAfuera();
  // entre dos plantillas: los dos cortes, los 3 mm de la entrada del contorno y PUENTE mm de EVA
  const ENTRE = () => 2 * (R() + masAfuera()) + 3 + PUENTE;
  const altoEn = X => E.pre ? E.med.alto - (E.med.alto - Math.min(E.med.bajo, E.med.alto)) * sm(0.4, 0.62, (X + E.med.largo / 2) / E.med.largo) : E.med.alto;

  // ---- piezas: un pie de un diseño marcado ----
  const visibles = () => cola.filter(x => (x.material?.id ?? '') === E.mat && (E.verFresadas || x.estado !== 'fresado'));
  const colorDe = it => COLORES[cola.indexOf(it) % COLORES.length];
  const piesDe = it => it.pies === 'izq' ? ['izq'] : it.pies === 'der' ? ['der'] : ['der', 'izq'];
  const piezas = () => cola.filter(x => E.sel.has(x.id) && (x.material?.id ?? '') === E.mat).flatMap(it => piesDe(it).map(lado => {
    const k = it.id + ':' + lado, p = E.pos.get(k);
    return p ? { k, it, lado, g: forma(it, lado), ...p } : null;
  }).filter(Boolean));
  const bordeDe = p => { const M = colocarPieza(p.g, p), out = []; for (let i = 0; i < p.g.ns; i += 2) { const q = i * p.g.nr; out.push([M.X(q), M.Y(q)]); } return out; };
  const cajaDe = B => { let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const [x, y] of B) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } return { x0, x1, y0, y1 }; };

  // ---- acomodar: rectángulos libres (maxrects) ----
  function libresSin(ocupados) {
    const b = BORDE(), e = ENTRE() / 2, L = E.med.largo / 2, A = E.med.ancho / 2;
    let libres = [{ x: -L + b - e, y: -A + b - e, w: 2 * (L - b) + 2 * e, h: 2 * (A - b) + 2 * e }];
    for (const r of ocupados) libres = cortar(libres, r);
    return libres;
  }
  function cortar(L, r) {
    const nuevos = [];
    for (const f of L) {
      if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y) { nuevos.push(f); continue; }
      if (r.x > f.x) nuevos.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
      if (r.x + r.w < f.x + f.w) nuevos.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, h: f.h });
      if (r.y > f.y) nuevos.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
      if (r.y + r.h < f.y + f.h) nuevos.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h });
    }
    return nuevos.filter((a, i) => a.w > 0.5 && a.h > 0.5 && !nuevos.some((c, j) => j !== i && a.x >= c.x && a.y >= c.y && a.x + a.w <= c.x + c.w && a.y + a.h <= c.y + c.h && (j < i || a.w * a.h < c.w * c.h)));
  }
  const rectDe = p => { const c = cajaDe(bordeDe(p)), e = ENTRE() / 2; return { x: c.x0 - e, y: c.y0 - e, w: c.x1 - c.x0 + 2 * e, h: c.y1 - c.y0 + 2 * e }; };
  // lugar para un pie: lo más cerca de la esquina de X e Y menores (el sobrante queda junto). null si no entra.
  function lugar(g, libres) {
    const M0 = colocarPieza(g, {}), Lp = M0.largo, Wp = M0.ancho;
    let mejor = null, porAlto = false;
    for (const giro of E.pre ? [0] : [0, 180, 90, 270]) {
      const w = (giro % 180 ? Wp : Lp) + ENTRE(), h = (giro % 180 ? Lp : Wp) + ENTRE();
      for (const f of libres) for (const [x, y] of [[f.x, f.y], [f.x + f.w - w, f.y], [f.x, f.y + f.h - h], [f.x + f.w - w, f.y + f.h - h]]) {
        if (w > f.w + 1e-6 || h > f.h + 1e-6) continue;
        const p = { x: x + w / 2, y: y + h / 2, giro };
        if (E.pre && !alcanza(g, p)) { porAlto = true; continue; }
        const nota = x * 1000 + y;
        if (!mejor || nota < mejor.nota) mejor = { nota, p, r: { x, y, w, h } };
      }
    }
    return mejor ?? { porAlto };
  }
  const alcanza = (g, p) => { const M = colocarPieza(g, p); for (let q = 0; q < g.z.length; q += 9) if (g.z[q] > altoEn(M.X(q)) - 0.5) return false; return true; };
  // pone en el taco los pies marcados que todavía no tienen lugar (los ya puestos no se mueven). Devuelve los que no entraron.
  function acomodar(todo = false) {
    if (todo) E.pos.clear();
    const fuera = [];
    let libres = libresSin(piezas().map(rectDe));
    for (const it of cola.filter(x => E.sel.has(x.id) && (x.material?.id ?? '') === E.mat)) {
      const faltan = piesDe(it).filter(l => !E.pos.has(it.id + ':' + l));
      if (!faltan.length) continue;
      let L2 = libres; const puestos = [];
      for (const lado of faltan) { const r = lugar(forma(it, lado), L2); if (!r.p) { puestos.length = 0; fuera.push({ it, porAlto: r.porAlto }); break; } puestos.push([lado, r]); L2 = cortar(L2, r.r); }
      if (puestos.length !== faltan.length) continue;
      for (const [lado, r] of puestos) E.pos.set(it.id + ':' + lado, r.p);
      libres = L2;
    }
    return fuera;
  }

  // ---- revisar: margen, separación y alto (lo mismo que revisa el G-code, más rápido, para pintar en rojo) ----
  function revisar(ps) {
    const malas = new Set(), avisos = [], b = BORDE(), L = E.med.largo / 2, A = E.med.ancho / 2, sep = 2 * (R() + masAfuera()) + 3 + 0.5;
    const bordes = ps.map(bordeDe), cajas = bordes.map(cajaDe);
    ps.forEach((p, i) => {
      const c = cajas[i];
      if (c.x0 < -L + b - 0.05 || c.x1 > L - b + 0.05 || c.y0 < -A + b - 0.05 || c.y1 > A - b + 0.05) { malas.add(i); avisos.push(`${nombrePieza(p)}: se sale del taco o no deja el margen al borde.`); }
      if (!alcanza(p.g, p)) { malas.add(i); avisos.push(`${nombrePieza(p)}: el taco no alcanza de alto${E.pre ? ' (quedó en la parte baja del preformado)' : ''}.`); }
      for (let j = i + 1; j < ps.length; j++) {
        const d = cajas[j];
        if (c.x0 > d.x1 + sep || d.x0 > c.x1 + sep || c.y0 > d.y1 + sep || d.y0 > c.y1 + sep) continue;
        if (distBordes(bordes[i], bordes[j]) < sep) { malas.add(i); malas.add(j); avisos.push(`${nombrePieza(p)} y ${nombrePieza(ps[j])} quedan muy juntas.`); }
      }
    });
    return { malas, avisos };
  }
  const dentro = (P, X, Y) => { let s = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [ax, ay] = P[j], [bx, by] = P[i]; if ((ay > Y) !== (by > Y) && X < ax + ((Y - ay) / (by - ay)) * (bx - ax)) s = !s; } return s; };
  function distBordes(P, Q) {
    if (dentro(Q, P[0][0], P[0][1]) || dentro(P, Q[0][0], Q[0][1])) return 0;
    let d = Infinity;
    for (const [x, y] of P) for (let i = 0, j = Q.length - 1; i < Q.length; j = i++) {
      const [ax, ay] = Q[j], [bx, by] = Q[i], ex = bx - ax, ey = by - ay, l2 = ex * ex + ey * ey, t = l2 ? Math.min(1, Math.max(0, ((x - ax) * ex + (y - ay) * ey) / l2)) : 0;
      d = Math.min(d, Math.hypot(x - ax - t * ex, y - ay - t * ey));
    }
    return d;
  }
  const nombrePieza = p => `${p.it.paciente} (${p.lado === 'izq' ? 'izq.' : 'der.'})`;

  // ---- dibujo ----
  function mallaPieza(p, col) {
    const { g } = p, M = colocarPieza(g, p), { ns, nr, z, zb } = g, n = ns * nr, base = 2 * n, nv = 2 * n + 2 * ns;
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), cl = new Float32Array(nv * 3);
    const put = (v, q, zz) => { pos[3 * v] = M.X(q); pos[3 * v + 1] = M.Y(q); pos[3 * v + 2] = zz; };
    for (let q = 0; q < n; q++) { put(q, q, z[q]); put(n + q, q, zb[q]); }
    for (let i = 0; i < ns; i++) { put(base + i, i * nr, z[i * nr]); put(base + ns + i, i * nr, zb[i * nr]); }
    const idx = new Uint32Array(ns * (nr - 1) * 12 + ns * 6); let t = 0;
    const tri = (a, b, c) => { idx[t++] = a; idx[t++] = b; idx[t++] = c; };
    for (let i = 0; i < ns; i++) {
      const j = (i + 1) % ns;
      for (let k = 0; k < nr - 1; k++) { const a = i * nr + k, b = j * nr + k, c = j * nr + k + 1, d = i * nr + k + 1; tri(a, b, c); tri(a, c, d); tri(n + a, n + b, n + c); tri(n + a, n + c, n + d); }
      tri(base + i, base + ns + i, base + ns + j); tri(base + i, base + ns + j, base + j);
    }
    for (let k = 0; k < idx.length; k += 3) {
      const a = 3 * idx[k], b = 3 * idx[k + 1], c = 3 * idx[k + 2];
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const N = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; for (const v of [a, b, c]) { nor[v] += N[0]; nor[v + 1] += N[1]; nor[v + 2] += N[2]; }
    }
    for (let v = 0; v < nor.length; v += 3) { const l = Math.hypot(nor[v], nor[v + 1], nor[v + 2]) || 1; nor[v] /= l; nor[v + 1] /= l; nor[v + 2] /= l; }
    for (let v = 0; v < nv; v++) cl.set(v < n ? col : col.map(c => c * 0.8), 3 * v);
    return { pos, nor, idx, col: cl };
  }
  // caja (taco, aristas, rayas); zTop(x) para el preformado
  function caja(x0, y0, z0, x1, y1, z1, col, alfa = 1, zTop) {
    const nx = zTop ? 120 : 1, pos = [], nor = [], idx = [], cl = [];
    const quad = (P, N) => { const b = pos.length / 3; P.forEach(p => { pos.push(...p); nor.push(...N); cl.push(...col); }); idx.push(b, b + 1, b + 2, b, b + 2, b + 3); };
    const zt = x => zTop ? zTop(x) : z1;
    for (let i = 0; i < nx; i++) {
      const xa = x0 + (x1 - x0) * i / nx, xb = x0 + (x1 - x0) * (i + 1) / nx;
      quad([[xa, y0, zt(xa)], [xb, y0, zt(xb)], [xb, y1, zt(xb)], [xa, y1, zt(xa)]], [0, 0, 1]);
      quad([[xa, y0, z0], [xb, y0, z0], [xb, y0, zt(xb)], [xa, y0, zt(xa)]], [0, -1, 0]);
      quad([[xa, y1, z0], [xa, y1, zt(xa)], [xb, y1, zt(xb)], [xb, y1, z0]], [0, 1, 0]);
    }
    quad([[x0, y0, z0], [x0, y0, zt(x0)], [x0, y1, zt(x0)], [x0, y1, z0]], [-1, 0, 0]);
    quad([[x1, y0, z0], [x1, y1, z0], [x1, y1, zt(x1)], [x1, y0, zt(x1)]], [1, 0, 0]);
    quad([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], [0, 0, -1]);
    return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint32Array(idx), col: new Float32Array(cl), alfa };
  }
  let estado = { malas: new Set(), avisos: [] };
  function dibujar() {
    const ps = piezas(), L = E.med.largo / 2, A = E.med.ancho / 2, H = E.med.alto, lista = [];
    estado = revisar(ps);
    lista.push(caja(-L, -A, 0, L, A, H, [0.55, 0.58, 0.66], 0.3, E.pre ? altoEn : null));
    const G = [0.5, 0.5, 0.53], e = 0.6;
    for (let i = 0; i < 120; i++) { const xa = -L + 2 * L * i / 120, xb = -L + 2 * L * (i + 1) / 120;
      for (const y of [-A, A]) lista.push(caja(xa, y - e, Math.min(altoEn(xa), altoEn(xb)) - e, xb, y + e, Math.max(altoEn(xa), altoEn(xb)) + e, G)); }
    for (const x of [-L, L]) { lista.push(caja(x - e, -A, altoEn(x) - e, x + e, A, altoEn(x) + e, G)); for (const y of [-A, A]) lista.push(caja(x - e, y - e, 0, x + e, y + e, altoEn(x), G)); }
    lista.push(caja(-L, -A - e, 0, L, -A + e, 1.2, G), caja(-L, A - e, 0, L, A + e, 1.2, G), caja(-L - e, -A, 0, -L + e, A, 1.2, G), caja(L - e, -A, 0, L + e, A, 1.2, G));
    ps.forEach((p, i) => {
      let col = colorDe(p.it);
      if (estado.malas.has(i)) col = ROJO; else if (p.k === E.elegida) col = col.map(c => Math.min(1, c * 0.75 + 0.3));
      lista.push(mallaPieza(p, col));
      if (p.k === E.elegida) {   // marco de la elegida
        const c = cajaDe(bordeDe(p)), z = altoEn((c.x0 + c.x1) / 2) + 0.6, k = 1.2, s = [0.1, 0.45, 1];
        lista.push(caja(c.x0 - 4, c.y0 - 4 - k, z, c.x1 + 4, c.y0 - 4, z + 0.4, s), caja(c.x0 - 4, c.y1 + 4, z, c.x1 + 4, c.y1 + 4 + k, z + 0.4, s),
          caja(c.x0 - 4 - k, c.y0 - 4, z, c.x0 - 4, c.y1 + 4, z + 0.4, s), caja(c.x1 + 4, c.y0 - 4, z, c.x1 + 4 + k, c.y1 + 4, z + 0.4, s));
      }
    });
    // sobrante: el espacio libre más grande, en rayas
    const s = libresSin(ps.map(rectDe)).reduce((m, f) => (!m || f.w * f.h > m.w * m.h ? f : m), null);
    if (s && s.w > 45 && s.h > 45) {
      const h = ENTRE() / 2, x0 = s.x + h, x1 = s.x + s.w - h, y0 = s.y + h, y1 = s.y + s.h - h, D = [0.43, 0.43, 0.45];
      const raya = (a, b, c, d) => { const zz = altoEn((a + c) / 2) + 0.4; lista.push(caja(Math.min(a, c) - 0.7, Math.min(b, d) - 0.7, zz - 0.3, Math.max(a, c) + 0.7, Math.max(b, d) + 0.7, zz + 0.3, D)); };
      for (let x = x0; x < x1; x += 12) { raya(x, y0, Math.min(x + 7, x1), y0); raya(x, y1, Math.min(x + 7, x1), y1); }
      for (let y = y0; y < y1; y += 12) { raya(x0, y, x0, Math.min(y + 7, y1)); raya(x1, y, x1, Math.min(y + 7, y1)); }
    }
    visor.poner(lista);
    // resumen y nombre del archivo
    const pac = [...new Set(ps.map(p => p.it))], area = ps.reduce((a, p) => a + areaDe(p.g), 0);
    $('frEst').textContent = ps.length ? `${pac.length} ${pac.length === 1 ? 'paciente' : 'pacientes'} · ${ps.length} ${ps.length === 1 ? 'plantilla' : 'plantillas'} · uso del taco ${Math.round(area / (E.med.largo * E.med.ancho) * 100)} %` : 'Marque en la cola las plantillas que van en este taco.';
    $('frAvisos').innerHTML = [...(E.fuera ?? []), ...estado.avisos].map(a => `<div>${esc(a)}</div>`).join('');
    $('frArchivo').textContent = ps.length ? nombreArchivo(pac) : '—';
    // si el taco cambió después de generar el G-code, el aviso de "guardado" ya no corresponde
    if (E.firmaGcode && E.firmaGcode !== firma(ps)) { E.firmaGcode = null; E.ultimo = null; $('frDespues').innerHTML = ''; }
    pintarPieza();
  }
  const firma = ps => JSON.stringify([E.pre, E.med, E.mesa, ps.map(p => [p.k, p.x, p.y, p.giro])]);
  const areaCache = new WeakMap();
  const areaDe = g => { if (!areaCache.has(g)) { let a = 0; for (let i = 0; i < g.ns; i++) { const p = i * g.nr, q = ((i + 1) % g.ns) * g.nr; a += g.x[p] * g.y[q] - g.x[q] * g.y[p]; } areaCache.set(g, Math.abs(a) / 2); } return areaCache.get(g); };
  const matNombre = () => mats.find(m => m.id === E.mat)?.nombre ?? '';
  // nombre (Ernesto 2026-11-23): todos los pacientes del taco; "(solo derecho / izquierdo)" si va un pie
  const nombreArchivo = pac => `${pac.map(it => it.paciente + (it.pies === 'der' ? ' (solo derecho)' : it.pies === 'izq' ? ' (solo izquierdo)' : '')).join(' + ')} ${matNombre()} fresadora.iso`
    .normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 200);

  // ---- cola (lista de la izquierda) ----
  function pintarCola() {
    const pend = cola.filter(x => x.estado !== 'fresado');
    $('frTitCola').textContent = `Cola de fresado · ${pend.length}`;
    $('frMats').innerHTML = mats.map(m => { const k = pend.filter(x => x.material?.id === m.id).length;
      return `<button class="fr-chip ${m.id === E.mat ? 'activo' : ''}" data-mat="${esc(m.id)}">${esc(m.nombre)}${k ? ` <b>${k}</b>` : ''}</button>`; }).join('');
    const vis = visibles();
    $('frLista').innerHTML = vis.length ? vis.map(it => `<div class="fr-item ${it.estado === 'fresado' ? 'hecho' : ''}">
        <label><input type="checkbox" data-sel="${esc(it.id)}" ${E.sel.has(it.id) ? 'checked' : ''} ${it.estado === 'fresado' ? 'disabled' : ''}>
          <span class="fr-punto" style="background:rgb(${colorDe(it).map(v => Math.round(v * 255))})"></span>
          <span class="fr-nombre" title="${esc(it.disenador ? it.disenador + ' › ' + it.carpeta : '')}">${esc(it.paciente)}<small>${esc(it.talla ?? '')}${it.estado === 'fresado' ? ' · fresada' : ''}</small></span></label>
        <select data-pies="${esc(it.id)}" title="Qué pies se fresan" ${it.estado === 'fresado' ? 'disabled' : ''}>${[['ambos', 'Par'], ['izq', 'Solo izq.'], ['der', 'Solo der.']].map(([v, t]) => `<option value="${v}" ${it.pies === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <button class="fr-x" data-quitar="${esc(it.id)}" title="${it.estado === 'fresado' ? 'Volver a la cola' : 'Quitar de la cola'}">${it.estado === 'fresado' ? '↺' : '✕'}</button>
      </div>`).join('') : `<p class="fr-vacia">No hay diseños de ${esc(matNombre())} en la cola.</p>`;
    $('frMats').querySelectorAll('[data-mat]').forEach(b => b.onclick = () => { E.mat = b.dataset.mat; E.elegida = null; E.fuera = []; pintarCola(); dibujar(); });
    $('frLista').querySelectorAll('[data-sel]').forEach(c => c.onchange = () => {
      const id = c.dataset.sel;
      if (c.checked) { E.sel.add(id); E.fuera = acomodar().map(f => `${f.it.paciente}: no entra en el taco${f.porAlto ? ' (solo cabría en la parte baja del preformado)' : ''}.`); if (E.fuera.length) { E.sel.delete(id); c.checked = false; } }
      else { E.sel.delete(id); for (const l of ['izq', 'der']) E.pos.delete(id + ':' + l); E.fuera = []; }
      dibujar();
    });
    $('frLista').querySelectorAll('[data-pies]').forEach(s => s.onchange = async () => {
      const it = porId.get(s.dataset.pies); it.pies = s.value;
      for (const l of ['izq', 'der']) if (!piesDe(it).includes(l)) E.pos.delete(it.id + ':' + l);
      if (E.sel.has(it.id)) { E.fuera = acomodar().map(f => `${f.it.paciente}: no entra en el taco.`); if (E.fuera.length) E.sel.delete(it.id); }
      dibujar();
      try { await ctx.guardarEnCola(it); } catch (e) { alert('No se pudo guardar el cambio en la cola: ' + e.message); }
    });
    $('frLista').querySelectorAll('[data-quitar]').forEach(b => b.onclick = async () => {
      const it = porId.get(b.dataset.quitar);
      try {
        if (it.estado === 'fresado') { it.estado = 'pendiente'; delete it.fresado; await ctx.guardarEnCola(it); }
        else {
          if (!confirm(`¿Quitar a ${it.paciente} de la cola de fresado? (El diseño no se borra; se puede volver a enviar desde 4. Exportar.)`)) return;
          await ctx.quitarDeCola(it.id); cola.splice(cola.indexOf(it), 1); porId.delete(it.id); E.sel.delete(it.id); for (const l of ['izq', 'der']) E.pos.delete(it.id + ':' + l);
        }
      } catch (e) { alert('No se pudo cambiar la cola: ' + e.message); return; }
      pintarCola(); dibujar();
    });
  }

  // ---- plantilla elegida: girar, quitar ----
  function pintarPieza() {
    const p = piezas().find(x => x.k === E.elegida);
    $('frPieza').innerHTML = p ? `<div class="fr-tit">Elegida: ${esc(nombrePieza(p))}</div>
      <div class="fr-girar"><button data-giro="90" title="Girar 90° a la izquierda (tecla R con Mayús)">↺ 90°</button><button data-giro="-90" title="Girar 90° a la derecha (tecla R)">↻ 90°</button>
      <button data-giro="5" title="Girar 5° a la izquierda">↺ 5°</button><button data-giro="-5" title="Girar 5° a la derecha">↻ 5°</button></div>` : '';
    $('frPieza').querySelectorAll('[data-giro]').forEach(b => b.onclick = () => girar(+b.dataset.giro));
  }
  function girar(gr) {
    const pos = E.pos.get(E.elegida); if (!pos) return;
    // en el preformado también se puede girar: la revisión del alto avisa si la plantilla cae en la parte baja
    pos.giro = (((pos.giro + gr) % 360) + 360) % 360; dibujar();
  }

  // ---- mover a mano: arrastrar sobre el plano de arriba del taco ----
  const enPlano = (px, py, z) => { const { o, d } = visor.rayo(px, py); if (Math.abs(d[2]) < 1e-6) return null; const t = (z - o[2]) / d[2]; return [o[0] + t * d[0], o[1] + t * d[1]]; };
  function piezaEn(px, py) {
    const ps = piezas(), P = enPlano(px, py, 6);   // a media altura de la plantilla
    if (!P) return null;
    for (let i = ps.length - 1; i >= 0; i--) if (dentro(bordeDe(ps[i]), P[0], P[1])) return ps[i];
    return null;
  }
  visor.alAgarrar((px, py) => {
    const p = piezaEn(px, py); if (!p) return null;
    E.elegida = p.k; const pos = E.pos.get(p.k), z = 6, P0 = enPlano(px, py, z); if (!P0) return null;
    const x0 = pos.x, y0 = pos.y;
    dibujar();
    return {
      mover(qx, qy) { const P = enPlano(qx, qy, z); if (!P) return; pos.x = x0 + P[0] - P0[0]; pos.y = y0 + P[1] - P0[1]; dibujar(); },
      soltar() { pos.x = Math.round(pos.x * 2) / 2; pos.y = Math.round(pos.y * 2) / 2; dibujar(); },
    };
  });
  visor.alClic((px, py) => { const p = piezaEn(px, py); E.elegida = p?.k ?? null; dibujar(); });
  // teclas: flechas mueven 1 mm (con Mayús 5), R gira 90°; una sola escucha aunque la pantalla se vuelva a pintar
  if (E.teclas) document.removeEventListener('keydown', E.teclas);
  const teclas = E.teclas = e => {
    if (!cuerpo.querySelector('.fresado') || !cuerpo.offsetParent) return;
    if (e.target.closest?.('input, select, textarea') || !E.elegida) return;
    const pos = E.pos.get(E.elegida); if (!pos) return;
    const paso = e.shiftKey ? 5 : 1, mov = { ArrowLeft: [-paso, 0], ArrowRight: [paso, 0], ArrowUp: [0, paso], ArrowDown: [0, -paso] }[e.key];
    if (mov) { pos.x += mov[0]; pos.y += mov[1]; dibujar(); e.preventDefault(); }
    else if (e.key === 'r' || e.key === 'R') { girar(e.shiftKey ? 90 : -90); e.preventDefault(); }
    else if (e.key === 'Escape') { E.elegida = null; dibujar(); }
  };
  document.addEventListener('keydown', teclas);

  // ---- opciones del taco ----
  const pintarTipo = () => { cuerpo.querySelectorAll('[data-pre]').forEach(b => b.classList.toggle('activo', (b.dataset.pre === '1') === E.pre)); $('frBajoL').hidden = !E.pre; };
  cuerpo.querySelectorAll('[data-pre]').forEach(b => b.onclick = () => {
    E.pre = b.dataset.pre === '1'; pintarTipo();
    // en el preformado van todas derechas (talón al lado alto): se vuelve a acomodar
    if (E.pre) E.fuera = acomodar(true).map(f => `${f.it.paciente}: no entra en el preformado${f.porAlto ? ' (solo cabría en la parte baja)' : ''}.`);
    dibujar(); vistaInicial();
  });
  const campos = { frLargo: 'largo', frAncho: 'ancho', frAlto: 'alto', frMargen: 'margen', frBajo: 'bajo' };
  for (const [id, k] of Object.entries(campos)) {
    const inp = $(id); inp.value = E.med[k];
    inp.onchange = () => { const v = parseFloat(inp.value); E.med[k] = Number.isFinite(v) ? Math.min(+inp.max, Math.max(+inp.min, v)) : E.med[k]; inp.value = E.med[k]; dibujar(); if (k !== 'margen' && k !== 'bajo') vistaInicial(); };
  }
  $('frMesa').onchange = () => { E.mesa = $('frMesa').value; dibujar(); };
  $('frVerFresadas').onchange = () => { E.verFresadas = $('frVerFresadas').checked; pintarCola(); };
  $('frVista').onclick = vistaInicial;
  $('frReacomodar').onclick = () => { E.fuera = acomodar(true).map(f => `${f.it.paciente}: no entra en el taco.`); E.elegida = null; dibujar(); };
  // recomendar: prueba a meter los diseños de este material en tres órdenes (del más antiguo al más nuevo, de la
  // talla más chica a la más grande y al revés) y se queda con el que más aprovecha el taco (si empatan, el primero:
  // así los más antiguos tienen preferencia)
  $('frRecomendar').onclick = () => {
    const otros = [...E.sel].filter(id => porId.get(id)?.material?.id !== E.mat);
    const posOtros = new Map([...E.pos].filter(([k]) => porId.get(k.split(':')[0])?.material?.id !== E.mat));
    const lista = cola.filter(x => x.estado !== 'fresado' && (x.material?.id ?? '') === E.mat), largo = it => it.largo ?? 0;
    let mejor = null;
    for (const orden of [lista, [...lista].sort((a, b) => largo(a) - largo(b)), [...lista].sort((a, b) => largo(b) - largo(a))]) {
      E.sel = new Set(otros); E.pos = new Map(posOtros);
      for (const it of orden) {
        E.sel.add(it.id);
        if (acomodar(false).length) { E.sel.delete(it.id); for (const l of ['izq', 'der']) E.pos.delete(it.id + ':' + l); }
      }
      const area = piezas().reduce((a, p) => a + areaDe(p.g), 0);
      if (!mejor || area > mejor.area + 1) mejor = { area, sel: new Set(E.sel), pos: new Map([...E.pos].map(([k, v]) => [k, { ...v }])) };
    }
    E.sel = mejor.sel; E.pos = mejor.pos;
    E.fuera = []; E.elegida = null; pintarCola(); dibujar();
  };

  // ---- G-code ----
  $('frGcode').onclick = async () => {
    const ps = piezas();
    if (!ps.length) { aviso('Marque primero en la cola las plantillas que van en el taco.'); return; }
    if (estado.malas.size) { aviso('No se generó el G-code: hay plantillas en rojo (revise los avisos debajo del taco).'); return; }
    // carpeta elegida (como en 4. Exportar): se pregunta antes de generar, el navegador solo abre el diálogo justo después del clic
    let destino = null;
    try { if (localStorage.getItem('plantillas.elegirCarpeta') === '1' && window.showDirectoryPicker) destino = await window.showDirectoryPicker({ id: 'plantillas-exportar', mode: 'readwrite', startIn: 'downloads' }); }
    catch (e) { if (e.name === 'AbortError') { aviso('No se generó el G-code: no se eligió la carpeta.'); return; } }
    const pac = [...new Set(ps.map(p => p.it))], nombre = nombreArchivo(pac), m = mesa();
    const material = maq.materiales.find(x => x.id === E.mat) ?? null;
    const op = { ...opcionesGcode(m, E.med.alto, material), bloque: { largo: E.med.largo, ancho: E.med.ancho, alto: E.med.alto }, margen: E.med.margen,
      altoEn: E.pre ? (X => altoEn(X)) : undefined, nombre: nombre.replace(/ fresadora\.iso$/, '') };
    $('frGcode').disabled = true; $('frGcode').textContent = 'Generando…';
    await new Promise(r => setTimeout(r, 30));
    try {
      const r = gcodeTaco(ps.map(p => ({ g: p.g, x: p.x, y: p.y, giro: p.giro, nombre: nombrePieza(p) })), op);
      if (r.avisos.length) { aviso('No se generó el G-code: ' + r.avisos.join(' ')); return; }
      await ctx.guardarGcode(nombre, r.texto);
      if (destino) { const f = await destino.getFileHandle(nombre, { create: true }), w = await f.createWritable(); await w.write(r.texto); await w.close(); }
      E.ultimo = pac.map(it => it.id); E.firmaGcode = firma(ps);
      $('frDespues').innerHTML = `<div class="fr-listo">Guardado "${esc(nombre)}" en ${esc(destino ? `la carpeta "${destino.name}" (y copia en ${ctx.carpeta()})` : ctx.carpeta())}.
        ${r.lineas.toLocaleString('es')} líneas · ≈ ${Math.round(r.minutos)} min (sin contar aceleraciones). Antes de fresar: revíselo en la vista de EdingCNC y páselo primero en el aire.
        <button id="frMarcar">Marcar estas plantillas como fresadas</button></div>`;
      $('frMarcar').onclick = marcarFresadas;
    } catch (e) { aviso('No se generó el G-code: ' + e.message); }
    finally { $('frGcode').disabled = false; $('frGcode').textContent = 'Generar G-code'; }
  };
  // Ernesto las marca a mano cuando ya salieron bien de la fresadora
  async function marcarFresadas() {
    const ids = E.ultimo ?? [];
    if (!ids.length || !confirm(`¿Marcar como fresadas ${ids.length} ${ids.length === 1 ? 'diseño' : 'diseños'}? Salen de la cola (se pueden ver con "Ver las ya fresadas").`)) return;
    try {
      for (const id of ids) { const it = porId.get(id); if (!it) continue; it.estado = 'fresado'; it.fresado = new Date().toISOString(); await ctx.guardarEnCola(it); E.sel.delete(id); for (const l of ['izq', 'der']) E.pos.delete(id + ':' + l); }
    } catch (e) { alert('No se pudo marcar: ' + e.message); }
    E.ultimo = null; $('frDespues').innerHTML = ''; E.elegida = null; pintarCola(); dibujar();
  }
  const aviso = t => { $('frDespues').innerHTML = `<div class="fr-mal">${esc(t)}</div>`; };

  pintarTipo(); pintarCola();
  E.fuera = acomodar().map(f => `${f.it.paciente}: no entra en el taco.`);
  dibujar(); vistaInicial();
}
