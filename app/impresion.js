// Módulo Impresión (beta), Ernesto 2026-11-24: varias plantillas de resina (3D, Glam, Class) en la impresora de cinta
// y un solo G-code (para dejar imprimiendo de noche). Es la propuesta B de la maqueta (pruebas/maqueta_impresion.html).
//
// · Cola de impresión: cada diseño que se manda desde 4. Exportar ("Enviar a cola de impresión"), con su material.
//   Se filtra por material; se marcan con el check los que van, y de cada uno si va el par, solo el izquierdo o solo el
//   derecho. Ernesto marca a mano cuáles ya se imprimieron.
// · Ajustes de esta impresión: salen del perfil de la impresora de cinta (Inicio → Máquinas); lo que se cambie aquí
//   vale solo para este G-code (velocidad, temperatura, flujo, relleno, tipo de relleno y paredes). Boquilla de 0,8.
// · Vista como un laminador: cada línea es un hilo de 0,8 mm (app/vistaCinta.js); se ve capa por capa, de lado y de
//   frente al cabezal. El laminado corre en segundo plano (app/laminarCinta.worker.js) con su barra de avance.
// · El G-code (motor/cinta.js) se nombra con todos los pacientes; "(solo derecho)" si va un pie.

import { crearVistaCinta, COLORES_TIPO, COLORES_PIEZA } from './vistaCinta.js';
import { ajustesDeCinta, opcionesConAjustes, TIPOS_RELLENO, LIMITES_AJUSTES } from './maquinas.js';

const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const n1 = v => String(Math.round(v * 10) / 10).replace('.', ',');

// forma guardada en la cola (Float32 en base64) → plantilla como la de generar (ns, nr, x, y, z, zb)
const deB64 = s => { const t = atob(s), b = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) b[i] = t.charCodeAt(i); return new Float32Array(b.buffer); };
const formas = new Map();
const forma = (it, lado) => {
  const k = it.id + ':' + lado + ':' + it.enviado;
  if (!formas.has(k)) { const f = it[lado]; formas.set(k, { ns: f.ns, nr: f.nr, x: deB64(f.x), y: deB64(f.y), z: deB64(f.z), zb: deB64(f.zb) }); }
  return formas.get(k);
};
// color de la etiqueta del material (por el nombre: Class, Glam, 3D; otro = gris)
const claseMat = nombre => /class/i.test(nombre) ? 'imp-mat-class' : /glam/i.test(nombre) ? 'imp-mat-glam' : /3d/i.test(nombre) ? 'imp-mat-3d' : 'imp-mat-otro';
const nombreCorto = nombre => String(nombre ?? '').replace(/\s*TPU$/i, '');

// estado (se mantiene al ir y volver de la pantalla)
const E = { filtro: 'todas', sel: new Set(), cinta: null, aj: null, modo: 'tipo', verHechas: false, ultimo: null };
let soltarActual = null;
export function soltarImpresion() { soltarActual?.(); soltarActual = null; }

export async function pintarImpresion(cuerpo, ctx) {
  soltarImpresion();
  const maq = ctx.maquinas();
  let cola = [];
  try { cola = await ctx.leerCola(); } catch (e) { cuerpo.innerHTML = `<div class="inicio-aviso"><p>No se pudo leer la cola de impresión: ${esc(e.message)}</p></div>`; return; }
  const porId = new Map(cola.map(x => [x.id, x]));
  for (const id of [...E.sel]) if (!porId.has(id) || porId.get(id).estado === 'impresa') E.sel.delete(id);
  const mats = [...maq.resinas.map(m => ({ id: m.id, nombre: m.nombre })), ...cola.map(x => x.material).filter(m => m && !maq.resinas.some(a => a.id === m.id))]
    .filter((m, i, a) => a.findIndex(b => b.id === m.id) === i);
  if (E.filtro !== 'todas' && !mats.some(m => m.id === E.filtro)) E.filtro = 'todas';
  const cinta = () => maq.cintas.find(c => c.id === E.cinta) ?? maq.cintas[0];
  // los ajustes vuelven a los del perfil si cambió la impresora o se editó su perfil en Máquinas
  const perfil = () => JSON.stringify(ajustesDeCinta(cinta()));
  if (!E.aj || !maq.cintas.some(c => c.id === E.cinta) || E.perfil !== perfil()) { E.cinta = cinta().id; E.aj = ajustesDeCinta(cinta()); E.perfil = perfil(); }

  const campo = (k, etq, u, paso) => `<label class="imp-campo"><span>${etq} <em>${u}</em></span><input type="number" data-k="${k}" min="${LIMITES_AJUSTES[k][0]}" max="${LIMITES_AJUSTES[k][1]}" step="${paso}" value="${E.aj[k]}"></label>`;
  cuerpo.innerHTML = `<div class="inicio-titulo"><h2>Impresión <span class="etq-beta">beta</span></h2>
      <span class="nota-fresado">Varias plantillas de resina en la impresora de cinta y un solo G-code. Los diseños llegan desde 4. Exportar → "Enviar a cola de impresión". Clic izquierdo mueve, derecho gira, rueda acerca.</span></div>
    <div class="imp-escena" id="impEscena">
      <canvas id="impC3d"></canvas><canvas id="impRotulos"></canvas>
      <div class="imp-flot imp-barraSup">
        <b>Ver:</b>
        ${[['tipo', 'Por tipo de línea'], ['plantilla', 'Por plantilla'], ['material', 'Color del filamento']].map(([v, t]) => `<button class="imp-chip ${E.modo === v ? 'si' : ''}" data-modo="${v}">${t}</button>`).join('')}
        <span class="imp-nota">· Material:</span><span id="impFiltro" class="imp-chips"></span>
      </div>
      <div class="imp-columna">
        <div class="imp-flot imp-ajustes">
          <h3>Ajustes de esta impresión</h3>
          <label class="imp-campo"><span>Impresora</span><select id="impCinta">${maq.cintas.map(c => `<option value="${esc(c.id)}" ${c.id === E.cinta ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}</select></label>
          <div class="imp-campo"><span>Boquilla</span><b>${n1(cinta().linea)} mm</b></div>
          ${campo('vel', 'Velocidad', '(relleno, mm/s)', 1)}
          ${campo('temp', 'Temperatura', '°C', 1)}
          ${campo('flujo', 'Flujo', '%', 1)}
          ${campo('relleno', 'Relleno', '%', 5)}
          <label class="imp-campo"><span>Tipo de relleno</span><select data-k="tipo">${TIPOS_RELLENO.map(([v, t]) => `<option value="${v}" ${E.aj.tipo === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          ${campo('paredes', 'Paredes', '', 1)}
          <div class="imp-nota">Salen del perfil de Inicio → Máquinas; lo que cambie aquí vale solo para este G-code. <a href="#" id="impPerfil">Volver al perfil</a></div>
          <hr>
          <div class="imp-resumen" id="impResumen"></div>
          <div class="imp-mal" id="impAvisos"></div>
          <div class="imp-acciones">
            <button class="primario" id="impGcode">Generar G-code</button>
            <button id="impPrueba" title="Solo los primeros 40 mm de cinta: la punta de la primera plantilla (unos minutos). Para la primera vez, mirando la máquina.">Prueba chica</button>
            <button id="impMarcar" title="Marca como impresos los diseños elegidos (salen de la cola)">Marcar impresas</button>
            <div class="imp-nota imp-archivo" id="impArchivo"></div>
            <div id="impDespues"></div>
          </div>
        </div>
        <div class="imp-flot imp-capaBox"><span class="imp-tit" id="impTit2d">Capa actual, de frente al cabezal</span><canvas id="impCapa2d"></canvas></div>
      </div>
      <div class="imp-flot imp-leyenda" id="impLeyenda"></div>
      <div class="imp-flot imp-barraCapa">
        <button id="impPlay" title="Ver cómo se imprime">▶</button>
        <span>Capa</span><input type="range" id="impCapa" min="0" max="0" value="0"><span id="impCapaTxt" class="imp-capaTxt"></span>
        <button id="impEnfocar">Mirar la capa</button><button id="impTodo">Ver todo</button>
      </div>
      <div class="imp-flot imp-cola" id="impCola"></div>
      <div class="imp-flot imp-laminando" id="impLaminando" hidden></div>
    </div>`;
  const $ = id => cuerpo.querySelector('#' + id);

  // alto: hasta abajo de la ventana (sin espacio en blanco debajo)
  const escena = $('impEscena');
  const ajustarAlto = () => { if (!escena.isConnected) return; escena.style.height = Math.max(560, innerHeight - escena.getBoundingClientRect().top - 14) + 'px'; };
  ajustarAlto(); addEventListener('resize', ajustarAlto);

  const cv = $('impC3d');
  let vista = null;
  try { vista = crearVistaCinta(cv, { ancho: cinta().ancho, angulo: cinta().angulo }); }
  catch (e) { escena.insertAdjacentHTML('beforeend', `<div class="imp-flot imp-laminando">No se pudo abrir la vista 3D: ${esc(e.message)}</div>`); return; }

  // ---------- laminar en segundo plano ----------
  // si se pide otra cosa a mitad (otra selección u otro ajuste), se corta ese trabajo y se empieza de nuevo
  let trabajador = null, ocupado = false, pedidoId = 0, espera = null, R = null, firmaR = '', capa = 0, reloj = null;
  const nuevoTrabajador = () => { trabajador = new Worker(new URL('./laminarCinta.worker.js', import.meta.url), { type: 'module' }); trabajador.onmessage = alResponder; };
  nuevoTrabajador();
  soltarActual = () => {
    clearTimeout(espera); clearInterval(reloj); trabajador?.terminate(); trabajador = null;
    removeEventListener('resize', ajustarAlto); vista?.soltar(); vista = null;
  };

  const visibles = () => cola.filter(x => (E.filtro === 'todas' || (x.material?.id ?? '') === E.filtro) && (E.verHechas || x.estado !== 'impresa'));
  const elegidos = () => cola.filter(x => E.sel.has(x.id) && x.estado !== 'impresa' && (E.filtro === 'todas' || (x.material?.id ?? '') === E.filtro));
  // en la cinta: la punta primero; el par sale derecho y después izquierdo
  function piezas() {
    const out = [];
    for (const it of elegidos()) for (const lado of it.pies === 'izq' ? ['izq'] : it.pies === 'der' ? ['der'] : ['der', 'izq'])
      out.push({ it, lado, nombre: `${it.paciente} · ${lado}` });
    return out;
  }
  const opciones = () => opcionesConAjustes(cinta(), E.aj);
  const firma = () => JSON.stringify([piezas().map(p => p.it.id + p.lado + p.it.enviado), E.cinta, E.aj]);

  function laminar() {
    clearTimeout(espera);
    E.ultimo = null; $('impDespues').innerHTML = '';
    espera = setTimeout(() => {
      const ps = piezas(), el = $('impLaminando');
      el.hidden = !ps.length;
      const pacs = new Set(ps.map(p => p.it.id)).size;
      el.innerHTML = `Laminando ${ps.length} plantilla${ps.length === 1 ? '' : 's'} (${pacs} paciente${pacs === 1 ? '' : 's'})… <span id="impPct">0 %</span>
        <div class="imp-barra"><i id="impBarra"></i></div><div class="imp-nota">Unos 8 s por plantilla. Mientras, se ve lo anterior en gris.</div>`;
      cv.classList.toggle('imp-viejo', !!R && ps.length > 0);
      if (!ps.length) { R = null; firmaR = ''; vista.poner([], []); textos(); dibujar2D(); return; }
      if (ocupado) { trabajador.terminate(); nuevoTrabajador(); }
      ocupado = true;
      trabajador.postMessage({ id: ++pedidoId, firma: firma(), piezas: ps.map(p => ({ g: forma(p.it, p.lado), nombre: p.nombre })), op: opciones() });
    }, 350);
  }
  function alResponder({ data }) {
    if (data.id !== pedidoId || !vista) return;   // llegó tarde: ya se pidió otra
    if (data.avance != null) { const p = Math.round(data.avance * 100) + ' %'; $('impPct').textContent = p; $('impBarra').style.width = p; return; }
    ocupado = false; cv.classList.remove('imp-viejo'); $('impLaminando').hidden = true;
    if (data.error) { $('impAvisos').textContent = 'Error al laminar: ' + data.error.split('\n')[0]; return; }
    // si cambió qué plantillas van (no solo un ajuste), se encuadra todo de nuevo para que se vean las nuevas
    const nuevas = !R || R.piezas.map(p => p.nombre).join() !== data.piezas.map(p => p.nombre).join();
    R = data; firmaR = data.firma;
    vista.poner(R.capas, R.piezas);
    const r = $('impCapa'); r.max = R.capas.length - 1;
    capa = nuevas ? R.capas.length - 1 : Math.min(capa, R.capas.length - 1); r.value = capa; vista.capa(capa);
    if (nuevas) verTodo();
    textos(); dibujar2D();
  }

  // ---------- textos ----------
  const nombreArchivo = () => {
    const ps = piezas(), its = [...new Set(ps.map(p => p.it))];
    return its.map(it => it.paciente + (it.pies === 'der' ? ' (solo derecho)' : it.pies === 'izq' ? ' (solo izquierdo)' : '')).join(' + ') + ' cinta BETA.gcode';
  };
  function textos() {
    const c = R?.capas[capa];
    $('impCapaTxt').textContent = c ? `${capa + 1} de ${R.capas.length} · cinta ${c.z.toFixed(0)} mm` : '—';
    $('impLeyenda').innerHTML = E.modo === 'plantilla' && R
      ? R.piezas.map((p, i) => `<div><i style="background:${COLORES_PIEZA[i % 6]}"></i>${esc(p.nombre)}</div>`).join('')
      : E.modo === 'material' ? '<div><i style="background:#dbd9d1"></i>Color del filamento (TPU espumado)</div>'
      : `<div><i style="background:${COLORES_TIPO.exterior}"></i>Pared exterior</div><div><i style="background:${COLORES_TIPO.interior}"></i>Paredes interiores</div><div><i style="background:${COLORES_TIPO.relleno}"></i>Relleno ${{ giroide: 'giroide', cubico: 'cúbico', concentrico: 'concéntrico' }[E.aj.tipo]}</div>`;
    const min = R ? Math.round(R.segundos / 60) : 0;
    $('impResumen').innerHTML = R ? `
      <div><span>Plantillas</span><b>${R.piezas.length}</b></div>
      <div><span>Tiempo</span><b>≈ ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min</b></div>
      <div><span>Filamento</span><b>${n1(R.filamento / 1000)} m · ${Math.round(R.gramos)} g</b></div>
      <div><span>Cinta</span><b>${Math.round(R.largoCinta / 10)} cm · ${R.capas.length} capas</b></div>
      <div class="imp-nota">Calculado por el laminador (beta) en ${n1(R.ms / 1000)} s.</div>` : `<div class="imp-nota">${cola.some(x => x.estado !== 'impresa') ? 'Marque en la cola las plantillas que van.' : 'La cola está vacía: los diseños de resina se mandan desde 4. Exportar → "Enviar a cola de impresión".'}</div>`;
    $('impAvisos').textContent = R?.avisos?.join(' ') ?? '';
    $('impArchivo').textContent = piezas().length ? 'Archivo: ' + nombreArchivo() : '';
    $('impArchivo').title = $('impArchivo').textContent;
  }
  function pintarFiltro() {
    $('impFiltro').innerHTML = [{ id: 'todas', nombre: 'Todas' }, ...mats].map(m => `<button class="imp-chip ${E.filtro === m.id ? 'si' : ''}" data-filtro="${esc(m.id)}">${esc(nombreCorto(m.nombre))}</button>`).join('');
  }
  function pintarCola() {
    const pend = cola.filter(x => x.estado !== 'impresa'), vis = visibles();
    $('impCola').innerHTML = `<div class="imp-colaTit"><b>Cola de impresión</b><span class="imp-nota">${pend.length} por imprimir</span>
        <label class="imp-nota"><input type="checkbox" id="impVerHechas" ${E.verHechas ? 'checked' : ''}> Ver las ya impresas</label></div>` +
      (vis.length ? vis.map(it => {
        const hecha = it.estado === 'impresa', si = E.sel.has(it.id) && !hecha;
        return `<div class="imp-carta ${si ? 'si' : ''} ${hecha ? 'hecha' : ''}" data-carta="${esc(it.id)}" title="${esc(it.disenador ? it.disenador + ' › ' + it.carpeta : '')}">
          <div class="imp-cartaCab"><input type="checkbox" ${si ? 'checked' : ''} ${hecha ? 'disabled' : ''} tabindex="-1"> <b>${esc(it.paciente)}</b>
            <button class="imp-x" data-quitar="${esc(it.id)}" title="${hecha ? 'Volver a la cola' : 'Quitar de la cola'}">${hecha ? '↺' : '✕'}</button></div>
          <div class="imp-cartaPie"><span class="imp-mat ${claseMat(it.material?.nombre)}">${esc(nombreCorto(it.material?.nombre ?? '—'))}</span>
            <span class="imp-nota">${esc(it.talla ?? '')}${hecha ? ' · ✔ impresa' : ''}</span>
            <select data-pies="${esc(it.id)}" title="Qué pies se imprimen" ${hecha ? 'disabled' : ''}>${[['ambos', 'Par'], ['izq', 'Solo izq.'], ['der', 'Solo der.']].map(([v, t]) => `<option value="${v}" ${(it.pies ?? 'ambos') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        </div>`;
      }).join('') : `<div class="imp-vacia imp-nota">${cola.length ? (E.filtro === 'todas' ? 'No hay diseños por imprimir.' : 'No hay diseños de este material por imprimir.') : 'Todavía no hay diseños en la cola. Se mandan desde un diseño de resina: 4. Exportar → "Enviar a cola de impresión".'}</div>`);
  }

  // ---------- capa actual en 2D: los hilos con su ancho real ----------
  const c2 = $('impCapa2d'), g2 = c2.getContext('2d');
  function dibujar2D() {
    if (!c2.isConnected) return;
    const dpr = devicePixelRatio || 1, W = c2.clientWidth, H = c2.clientHeight;
    if (c2.width !== Math.round(W * dpr) || c2.height !== Math.round(H * dpr)) { c2.width = Math.round(W * dpr); c2.height = Math.round(H * dpr); }
    g2.setTransform(dpr, 0, 0, dpr, 0, 0); g2.clearRect(0, 0, W, H);
    const c = R?.capas[capa]; if (!c || !c.recorridos.length) return;
    let x0 = 1e9, x1 = -1e9, s1 = 3;
    for (const r of c.recorridos) for (const [x, s] of r.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); s1 = Math.max(s1, s); }
    const k = Math.min((W - 30) / (x1 - x0 + 2), (H - 44) / (s1 + 1)), ox = (W - (x1 + x0) * k) / 2, base = H - 14;
    g2.fillStyle = '#4a5059'; g2.fillRect(0, base + 2, W, 5);
    const P = ([x, s]) => [ox + x * k, base - s * k];
    const col = { 'WALL-OUTER': COLORES_TIPO.exterior, 'WALL-INNER': COLORES_TIPO.interior, FILL: COLORES_TIPO.relleno };
    g2.lineCap = 'round'; g2.lineJoin = 'round';
    // dos pasadas: el hilo y su brillo encima (se ve redondo, como plástico)
    const ancho = cinta().linea;
    for (const [brillo, f, alfa] of [[0, 1, 1], [1, 0.45, 0.45]]) for (const r of c.recorridos) {
      g2.strokeStyle = brillo ? '#fff' : col[r.tipo] ?? COLORES_TIPO.relleno; g2.globalAlpha = alfa; g2.lineWidth = Math.max(1, ancho * k * f);
      g2.beginPath(); r.pts.forEach((p, i) => { const [a, b] = P(p); i ? g2.lineTo(a, b) : g2.moveTo(a, b); }); g2.stroke();
    }
    g2.globalAlpha = 1;
    $('impTit2d').textContent = `Capa ${capa + 1}, de frente al cabezal · líneas de ${n1(ancho)} mm`;
  }

  // ---------- nombres sobre cada plantilla ----------
  const ro = $('impRotulos'), gr = ro.getContext('2d');
  vista.alDibujar(() => {
    const dpr = devicePixelRatio || 1, W = ro.clientWidth, H = ro.clientHeight;
    if (ro.width !== Math.round(W * dpr) || ro.height !== Math.round(H * dpr)) { ro.width = Math.round(W * dpr); ro.height = Math.round(H * dpr); }
    gr.setTransform(dpr, 0, 0, dpr, 0, 0); gr.clearRect(0, 0, W, H);
    if (!R || !vista) return;
    gr.font = '600 12px system-ui, "Segoe UI", sans-serif'; gr.textAlign = 'center';
    R.piezas.forEach((p, i) => {
      const q = vista.proyectar([cinta().centroX ?? 105, p.b0 + p.largo / 2, p.alto + 14]); if (!q?.visible) return;
      const w = gr.measureText(p.nombre).width + 12;
      gr.fillStyle = 'rgba(255,255,255,.9)'; gr.fillRect(q.x - w / 2, q.y - 14, w, 19);
      gr.fillStyle = E.modo === 'plantilla' ? COLORES_PIEZA[i % 6] : '#1f2630'; gr.fillText(p.nombre, q.x, q.y);
    });
  });

  // ---------- controles ----------
  cuerpo.querySelectorAll('[data-k]').forEach(el => el.addEventListener('input', () => {
    const k = el.dataset.k;
    if (k === 'tipo') E.aj.tipo = el.value;
    else { const v = parseFloat(el.value); if (!Number.isFinite(v)) return; E.aj[k] = v; }
    textos(); laminar();
  }));
  $('impCinta').onchange = () => { E.cinta = $('impCinta').value; E.aj = null; pintarImpresion(cuerpo, ctx); };
  $('impPerfil').onclick = ev => { ev.preventDefault(); E.aj = null; pintarImpresion(cuerpo, ctx); };
  cuerpo.querySelectorAll('[data-modo]').forEach(b => b.onclick = () => {
    E.modo = b.dataset.modo; cuerpo.querySelectorAll('[data-modo]').forEach(x => x.classList.toggle('si', x === b));
    vista.modo(E.modo); textos(); vista.pedir();
  });
  $('impFiltro').onclick = ev => { const b = ev.target.closest('[data-filtro]'); if (!b) return; E.filtro = b.dataset.filtro; pintarFiltro(); pintarCola(); textos(); laminar(); };
  $('impCola').addEventListener('change', async ev => {
    const t = ev.target;
    if (t.id === 'impVerHechas') { E.verHechas = t.checked; pintarCola(); return; }
    if (t.dataset.pies) {
      const it = porId.get(t.dataset.pies); if (!it) return;
      it.pies = t.value;
      try { await ctx.guardarEnCola(it); } catch (e) { alert('No se pudo guardar: ' + e.message); }
      textos(); if (E.sel.has(it.id)) laminar();
    }
  });
  $('impCola').addEventListener('click', async ev => {
    const q = ev.target.closest('[data-quitar]');
    if (q) {
      ev.stopPropagation();
      const it = porId.get(q.dataset.quitar); if (!it) return;
      try {
        if (it.estado === 'impresa') { it.estado = 'pendiente'; delete it.impresa; await ctx.guardarEnCola(it); }
        else {
          if (!confirm(`¿Quitar a ${it.paciente} de la cola de impresión? (El diseño no se borra; se puede volver a enviar desde 4. Exportar.)`)) return;
          await ctx.quitarDeCola(it.id); cola = cola.filter(x => x !== it); porId.delete(it.id);
          if (E.sel.delete(it.id)) laminar();
        }
      } catch (e) { alert('No se pudo cambiar la cola: ' + e.message); }
      pintarCola(); textos(); return;
    }
    if (ev.target.closest('select')) return;
    const carta = ev.target.closest('[data-carta]'); if (!carta) return;
    const it = porId.get(carta.dataset.carta); if (!it || it.estado === 'impresa') return;
    E.sel.has(it.id) ? E.sel.delete(it.id) : E.sel.add(it.id);
    pintarCola(); textos(); laminar();
  });
  const rango = $('impCapa');
  const irA = n => { if (!vista) return; capa = n; rango.value = n; vista.capa(n); textos(); dibujar2D(); };
  rango.addEventListener('input', () => irA(+rango.value));
  $('impPlay').onclick = () => {
    if (reloj) { clearInterval(reloj); reloj = null; $('impPlay').textContent = '▶'; return; }
    if (!R) return; if (capa >= R.capas.length - 1) irA(0);
    $('impPlay').textContent = '❚❚';
    reloj = setInterval(() => { if (!R || capa >= R.capas.length - 1) { $('impPlay').click(); return; } irA(Math.min(capa + 4, R.capas.length - 1)); }, 50);
  };
  function verTodo() {
    if (!R?.piezas.length) return; const fin = R.piezas.at(-1);
    vista.encuadrar([0, -20, 0, cinta().ancho, fin.b0 + fin.largo + 20, 30], -35, 28);
  }
  $('impTodo').onclick = verTodo;
  $('impEnfocar').onclick = () => { const c = R?.capas[capa]; if (c) vista.encuadrar([cinta().centroX - 60, c.z - 45, 0, cinta().centroX + 60, c.z + 5, 25], 170, 52); };
  new ResizeObserver(() => dibujar2D()).observe(c2);

  // ---------- G-code ----------
  const aviso = t => { $('impDespues').innerHTML = `<div class="imp-mal">${esc(t)}</div>`; };
  async function guardar(nombre, texto) {
    // carpeta elegida (como en 4. Exportar): se pregunta antes, el navegador solo abre el diálogo justo después del clic
    let destino = null;
    try { if (localStorage.getItem('plantillas.elegirCarpeta') === '1' && window.showDirectoryPicker) destino = await window.showDirectoryPicker({ id: 'plantillas-exportar', mode: 'readwrite', startIn: 'downloads' }); }
    catch (e) { if (e.name === 'AbortError') throw new Error('no se eligió la carpeta'); }
    await ctx.guardarGcode(nombre, texto);
    if (destino) { const f = await destino.getFileHandle(nombre, { create: true }), w = await f.createWritable(); await w.write(texto); await w.close(); }
    return destino ? `la carpeta "${destino.name}" (y copia en ${ctx.carpeta()})` : ctx.carpeta();
  }
  $('impGcode').onclick = async () => {
    if (!piezas().length) { aviso('Marque primero en la cola las plantillas que van.'); return; }
    if (!R || ocupado || firmaR !== firma()) { aviso('Espere a que termine de laminar (la barra del centro) y vuelva a hacer clic.'); return; }
    if (R.avisos.length) { aviso('No se generó el G-code: ' + R.avisos.join(' ')); return; }
    const nombre = nombreArchivo(), ids = [...new Set(piezas().map(p => p.it.id))];
    try {
      const donde = await guardar(nombre, R.texto);
      const min = Math.round(R.segundos / 60);
      E.ultimo = ids;
      $('impDespues').innerHTML = `<div class="imp-listo">Guardado "${esc(nombre)}" en ${esc(donde)}: ${R.capas.length} capas, ≈ ${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min, ${Math.round(R.gramos)} g.
        BETA: revíselo en la vista previa de la impresora (o de ideaMaker) antes de imprimir. Cuando salga bien, use "Marcar impresas".</div>`;
    } catch (e) { aviso('No se generó el G-code: ' + e.message); }
  };
  // prueba chica: solo los primeros 40 mm de cinta (la punta de la primera plantilla), para la primera vez
  $('impPrueba').onclick = async () => {
    const p = piezas()[0];
    if (!p) { aviso('Marque primero en la cola las plantillas que van.'); return; }
    const nombre = `${p.it.paciente} ${p.lado === 'der' ? 'derecho' : 'izquierdo'} cinta PRUEBA 40mm BETA.gcode`;
    $('impPrueba').disabled = true;
    try {
      const { gcodeCinta } = await import('../motor/cinta.js');
      const r = gcodeCinta([{ g: forma(p.it, p.lado), nombre: p.nombre + ' (prueba 40 mm)' }], { ...opciones(), hastaMm: 40 });
      if (r.avisos.length) { aviso('No se generó la prueba: ' + r.avisos.join(' ')); return; }
      const donde = await guardar(nombre, r.texto), min = Math.round(r.segundos / 60);
      $('impDespues').innerHTML = `<div class="imp-listo">Guardada la prueba "${esc(nombre)}" en ${esc(donde)}: ${r.numCapas} capas, ≈ ${min} min. Imprímala mirando la máquina.</div>`;
    } catch (e) { aviso('No se generó la prueba: ' + e.message); }
    finally { $('impPrueba').disabled = false; }
  };
  // Ernesto las marca a mano cuando ya salieron bien de la impresora: las del último G-code, o las marcadas
  $('impMarcar').onclick = async () => {
    const ids = E.ultimo?.length ? E.ultimo : elegidos().map(x => x.id);
    if (!ids.length) { aviso('Marque en la cola los diseños que ya se imprimieron.'); return; }
    const nombres = ids.map(id => porId.get(id)?.paciente).filter(Boolean);
    if (!confirm(`¿Marcar como impresos ${ids.length === 1 ? 'este diseño' : `estos ${ids.length} diseños`}: ${nombres.join(', ')}? Salen de la cola (se pueden ver con "Ver las ya impresas").`)) return;
    try {
      for (const id of ids) { const it = porId.get(id); if (!it) continue; it.estado = 'impresa'; it.impresa = new Date().toISOString(); await ctx.guardarEnCola(it); E.sel.delete(id); }
    } catch (e) { alert('No se pudo marcar: ' + e.message); }
    E.ultimo = null; pintarCola(); textos(); laminar();
  };

  vista.modo(E.modo);
  pintarFiltro(); pintarCola(); textos(); laminar();
}
