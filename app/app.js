// Pantalla de diseño: lee los valores, genera los dos pies con el motor, los muestra en 3D y exporta.
import { prepararHorma, hormaConContorno, prepararAcabado, prepararElemento, generar, medidas, solido, volumen, aSTL } from '../motor/plantilla.js';
import { crearVisor, crearCubo } from './visor.js';
import { leerSTL, ladoPorNombre, orientar, medirEscaneo, mallaEscaneo } from '../motor/escaneo.js';
import { escalaPNG, analizarMuestra, contornoParaReceta, contornoProlijo } from '../motor/muestra.js';
import { imagenDePDF } from '../motor/pdf.js';
import { crearInicio } from './inicio.js';
import { gcodeEVA } from '../motor/fresado.js';

const $ = id => document.getElementById(id);
// texto seguro dentro de HTML (auditoría 2026-11-18: nombres de archivos, de elementos y recetas que vienen de otras PC)
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const estado = $('estado');
const leer = async ruta => { const r = await fetch(ruta); if (!r.ok) throw new Error('No se pudo leer ' + ruta); return r.json(); };

// ---- Biblioteca ----
const bib = await leer('../biblioteca/biblioteca.json');
// Cuadros de tallas: Hombre y Dama (US → EU → mm, guía de tallas de Lima Blue, 2026-11-13) y la tabla Baroflex
// en EU (27 a 48, incluye niños). `talla` es texto ("9", "7.5", "38").
const baroflex = (await leer('../biblioteca/' + bib.tallas)).tallas, cuadroUSA = await leer('../biblioteca/' + bib.cuadroTallas);
const deUSA = (lista, quien) => lista.map(t => ({ talla: t.us, eu: t.eu, us: t.us, etq: `US ${t.us} · EU ${t.eu}`, corta: `US ${t.us} ${quien}`, largo: t.largo }));
const CUADROS = {
  hombre: { nombre: 'Hombre (US)', tallas: deUSA(cuadroUSA.hombre, 'hombre') },
  dama: { nombre: 'Dama (US)', tallas: deUSA(cuadroUSA.dama, 'dama') },
  eu: { nombre: 'EU Baroflex (27 a 48)', tallas: baroflex.map(t => ({ talla: String(t.talla), eu: t.talla, etq: `EU ${t.talla}`, corta: `EU ${t.talla}`, largo: t.largo })) },
};
const todasTallas = Object.values(CUADROS).flatMap(c => c.tallas);
const LARGO_MIN = Math.min(...todasTallas.map(t => t.largo)), LARGO_MAX = Math.max(...todasTallas.map(t => t.largo));
let tallas = CUADROS.hombre.tallas;   // las del cuadro elegido
// Biblioteca de hormas (Ernesto, 2026-11-16): cada horma es delgada o estándar (bib.tiposHorma) o sirve para las
// dos (la guía de tallas: copa y antepié del producto). Una horma con `base` toma el relieve de esa horma con sus
// factores (`relieve`) y, con `contorno`, el borde propio repartiendo el relieve en proporción.
// puntosHorma: contorno de cada horma (para dibujarla y editarla). Las propias (editor de hormas, 2026-11-17) traen
// sus puntos adentro y se guardan en la carpeta compartida (Biblioteca/hormas.json).
const hormas = {}, acabados = {}, hormaInfo = {}, puntosHorma = {}, datosDe = {};
for (const m of bib.hormas.filter(m => !m.base)) {
  datosDe[m.archivo] = await leer('../biblioteca/' + m.archivo);
  hormas[m.id] = prepararHorma(datosDe[m.archivo], m.ref, m.op); hormaInfo[m.id] = m;   // op: suavizado propio (STL limpio)
}
for (const m of bib.hormas.filter(m => m.contorno)) puntosHorma[m.id] = (await leer('../biblioteca/' + m.contorno)).puntos;
// arma una horma desde su definición: relieve de su base con sus factores y, si tiene, su contorno
function construirHorma(m, puntos) {
  const b = hormaInfo[m.base];
  if (!b || !datosDe[b.archivo]) throw new Error('base de horma desconocida: ' + m.base);
  let h = m.relieve || m.copaLado ? prepararHorma(datosDe[b.archivo], b.ref, { ...b.op, relieve: m.relieve, copaLado: m.copaLado }) : hormas[m.base];
  if (puntos?.length > 20) h = { ...hormaConContorno(h, puntos), deMuestra: false };
  return h;
}
for (const m of bib.hormas.filter(m => m.base)) { hormas[m.id] = construirHorma(m, puntosHorma[m.id]); hormaInfo[m.id] = m; }
// las del programa tal como vienen: si en la carpeta compartida se sobrescribe una, se puede volver a esta
const ORIGINALES_HORMA = Object.fromEntries(bib.hormas.map(m => [m.id, { meta: m, h: hormas[m.id], puntos: puntosHorma[m.id] }]));
for (const a of bib.acabados) acabados[a.id] = prepararAcabado(await leer('../biblioteca/' + a.archivo));
const catalogo = (await leer('../biblioteca/elementos.json')).elementos;
const formas = Object.fromEntries(catalogo.map(e => [e.id, prepararElemento(e)]));
// los del programa tal como vienen: si en la biblioteca compartida se sobrescribe uno, se puede volver a este
const ORIGINALES = Object.fromEntries(catalogo.map(e => [e.id, JSON.parse(JSON.stringify(e))]));

let visor;
try { visor = crearVisor($('lienzo')); }
catch (e) { $('lienzo').insertAdjacentHTML('afterend', `<div class="error">${esc(e.message)}</div>`); }

// ---- Formulario ----
// "Método de producción" como LutraCAD (2026-11-17): con acabado de resina = impresión 3D; sin acabado = fresado EVA
for (const p of bib.productos) $('producto').add(new Option((p.acabado ? 'Impresión 3D: ' : 'Fresado: ') + p.nombre, p.id));
const esEVA = () => !bib.productos.find(p => p.id === $('producto').value)?.acabado;
// módulo 3: "EVA" o "Imprimir" según el método, y su sección
function pintarModuloProduccion() {
  const eva = esEVA();
  $('tabProduccion').textContent = eva ? '3. EVA' : '3. Imprimir';
  if (typeof modulo !== 'undefined' && modulo === 'produccion') { $('seccionEVA').hidden = !eva; $('seccionImprimir').hidden = eva; }
}
for (const [id, c] of Object.entries(CUADROS)) $('cuadro').add(new Option(c.nombre, id));
// hormas agrupadas: delgadas, estándar y las que sirven para las dos (se rehace al cargar o guardar hormas propias)
function pintarOpcionesHorma() {
  const s = $('horma'), v = s.value; s.innerHTML = '';
  const grupos = [['', { nombre: 'Para delgadas y estándar' }], ...Object.entries(bib.tiposHorma ?? {}).filter(([, t]) => t?.nombre)];
  for (const [tipo, t] of grupos) {
    const hs = Object.values(hormaInfo).filter(m => !m.oculta && (m.tipo ?? '') === tipo); if (!hs.length) continue;
    const g = document.createElement('optgroup'); g.label = t.nombre;
    for (const m of hs) g.append(new Option(m.nombre + (m.propia ? ' · propia' : ''), m.id));
    s.append(g);
  }
  if (v && hormas[v]) s.value = v;
}
pintarOpcionesHorma();
// Hormas propias de la carpeta compartida (Biblioteca/hormas.json): las nuevas se suman; las que tienen el id de una
// del programa la reemplazan (se puede volver al original). Una definición rota se omite.
function ponerHormasPropias({ hormas: lista = [] } = {}) {
  for (const [id, o] of Object.entries(ORIGINALES_HORMA)) { hormas[id] = o.h; hormaInfo[id] = o.meta; puntosHorma[id] = o.puntos; }
  for (const id of Object.keys(hormaInfo)) if (hormaInfo[id].propia) { delete hormas[id]; delete hormaInfo[id]; delete puntosHorma[id]; }
  for (const def of lista) {
    try {
      if (!def?.id || !def.base || hormaInfo[def.id]?.oculta) continue;
      const h = construirHorma(def, def.puntos), meta = { ...def }; delete meta.puntos;
      if (ORIGINALES_HORMA[def.id]) meta.modificado = true; else meta.propia = true;
      hormas[def.id] = h; hormaInfo[def.id] = meta; puntosHorma[def.id] = def.puntos;
    } catch { /* definición rota: se omite */ }
  }
  hormasMuestra.clear();
  if (!hormas[$('horma').value]) $('horma').value = 'guia_tallas';
  pintarOpcionesHorma(); try { pedir(); } catch { /* al cargar, antes de que exista la pantalla */ }
}
// definición completa de una horma para editarla (con sus puntos), sin las marcas de propia/modificada
function defHorma(id) {
  const m = JSON.parse(JSON.stringify(hormaInfo[id])); delete m.propia; delete m.modificado; delete m.contorno; delete m.origen;
  m.puntos = JSON.parse(JSON.stringify(puntosHorma[id] ?? null));
  // sin archivo de contorno (Guía de tallas desde el STL, 2026-11-17): el contorno de la propia horma, cada 16 puntos
  if (!m.puntos && hormas[id]?.cont) { const c = hormas[id].cont; m.puntos = []; for (let i = 0; i < c.x.length; i += 16) m.puntos.push([+c.x[i].toFixed(1), +c.y[i].toFixed(1)]); }
  if (!m.relieve) m.relieve = {};
  return m;
}

// tipo de diseño (Ernesto, 2026-11-16): delgado (copa 10, espesor 1,5) o estándar (copa 14, espesor 2)
for (const [id, t] of Object.entries(bib.tiposHorma ?? {})) if (t?.copa) $('tipoDiseno').add(new Option(`${t.nombre.replace(/s$/, '').replace(/a$/, 'o')} · copa ${t.copa} · espesor ${String(t.antepie).replace('.', ',')} mm`, id));
// tipo de arco (Ernesto, 2026-11-16): neutro 20, plano 21, cavo 23 mm, o a mano; "proporcional" solo para recetas de
// antes, que no tenían tipo de arco
// botones del tipo de diseño (como LutraCAD: un clic elige, sin desplegable). Dibujo: la plantilla de costado,
// fina o gruesa. Cambian el desplegable oculto, que sigue siendo el que usa el resto del programa.
{
  const icono = grueso => `<svg viewBox="0 0 44 18" width="44" height="18" aria-hidden="true"><path d="M2 ${grueso ? 11 : 13.5} C8 ${grueso ? 11 : 13.5} 12 ${grueso ? 4 : 6} 20 ${grueso ? 4 : 6} C28 ${grueso ? 4 : 6} 30 ${grueso ? 11 : 13.5} 42 ${grueso ? 11 : 13.5} L42 15.5 L2 15.5 Z" fill="currentColor" opacity=".9"/></svg>`;
  $('botonesTipo').innerHTML = Object.entries(bib.tiposHorma ?? {}).filter(([, t]) => t?.copa).map(([id, t]) =>
    `<button type="button" role="radio" data-tipo="${id}" title="${t.calzados?.join(', ') ?? ''}">${icono(id === 'estandar')}
      <span class="bt-nombre">${id === 'estandar' ? 'Estándar' : 'Delgado'}</span>
      <span class="bt-dato">copa ${t.copa} · espesor ${String(t.antepie).replace('.', ',')}</span></button>`).join('');
  $('botonesTipo').addEventListener('click', ev => {
    const b = ev.target.closest('[data-tipo]'); if (!b || b.disabled || $('tipoDiseno').value === b.dataset.tipo) return;
    $('tipoDiseno').value = b.dataset.tipo; $('tipoDiseno').dispatchEvent(new Event('change')); pintarBotonesTipo();
  });
}
function pintarBotonesTipo() {
  for (const b of document.querySelectorAll('#botonesTipo [data-tipo]')) {
    const si = b.dataset.tipo === $('tipoDiseno').value;
    b.classList.toggle('activo', si); b.setAttribute('aria-checked', String(si));
  }
}
const TIPOS_ARCO =Object.fromEntries(Object.entries(bib.tiposArco ?? {}).filter(([, t]) => t?.altura));
for (const [id, t] of Object.entries(TIPOS_ARCO)) $('tipoArco').add(new Option(`${t.nombre} (${t.altura} mm)`, id));
$('tipoArco').add(new Option('A mano', 'mano'));
{ const o = new Option('Proporcional a la copa (receta antigua)', 'horma'); o.hidden = true; $('tipoArco').add(o); }
// botones del tipo de arco (Ernesto, 2026-11-16): neutro, plano y cavo con un clic. "A mano" ya no es un botón: se
// pasa a mano haciendo clic en el número del alto de arco. El desplegable oculto sigue guardando el tipo.
{
  const icono = h => `<svg viewBox="0 0 44 18" width="44" height="18" aria-hidden="true"><path d="M2 15 C9 15 13 ${15 - h} 21 ${15 - h} C29 ${15 - h} 33 15 42 15 L42 16.5 L2 16.5 Z" fill="currentColor" opacity=".9"/></svg>`;
  $('botonesArco').innerHTML = Object.entries(TIPOS_ARCO).map(([id, t]) =>
    `<button type="button" role="radio" data-arco="${id}">${icono(Math.round((t.altura - 14) * 1.1))}
      <span class="bt-nombre">${t.nombre}</span><span class="bt-dato">${t.altura} mm</span></button>`).join('');
  $('botonesArco').addEventListener('click', ev => {
    const b = ev.target.closest('[data-arco]'); if (!b || b.disabled || $('tipoArco').value === b.dataset.arco) return;
    $('tipoArco').value = b.dataset.arco; $('tipoArco').dispatchEvent(new Event('change'));
  });
}

const num = id => parseFloat($(id).value);
const producto = () => bib.productos.find(p => p.id === $('producto').value);
const hormaId = () => (hormas[$('horma').value] ? $('horma').value : producto().horma);
const tipoHorma = () => bib.tiposHorma?.[$('tipoDiseno').value] ?? null;
const arcoPosDefecto = () => hormaInfo[hormaId()]?.valores?.arcoPos ?? ARCO_POS;
const recordar = (k, v) => { try { localStorage.setItem('plantillas.' + k, v); } catch { /* sin almacenamiento */ } };
const recordado = k => { try { return localStorage.getItem('plantillas.' + k); } catch { return null; } };

// Medida desde la guía de tallas o desde la muestra / escaneo (Ernesto, 2026-11-13). Con guía de tallas el largo
// sale del cuadro (+5 mm para pulir si el producto es EVA) y abrir el escaneo no lo cambia; con muestra o escaneo
// el largo sale del pie o de la muestra, como antes.
const margenPulido = () => producto()?.margenPulido ?? 0;
const conGuia = () => $('medidaDesde').value === 'guia';
// Talla (Ernesto, 2026-11-16): primero la EU en negrita, después el largo en mm y al final la US. El desplegable
// del navegador no deja poner negrita, así que se muestra una lista propia; el <select> oculto sigue siendo el
// que guarda la talla (y el que lee el resto del programa).
const textoTalla = t => `EU ${t.eu} · ${t.largo} mm${t.us ? ' · US ' + t.us : ''}`;
const htmlTalla = t => `<b>EU ${t.eu}</b><span class="tl-mm">${t.largo} mm</span>${t.us ? `<span class="tl-us">US ${t.us}</span>` : ''}`;
function pintarCuadro() {
  const s = $('talla'), v = s.value; s.innerHTML = '';
  for (const t of tallas) s.add(new Option(textoTalla(t), t.talla));
  s.add(new Option('Personalizada', 'otra'));
  s.value = tallas.some(t => t.talla === v) ? v : 'otra';
  pintarSelTalla();
}
function pintarSelTalla() {
  const caja = $('selTalla'); if (!caja) return;
  const t = tallas.find(x => x.talla === $('talla').value);
  caja.querySelector('.st-actual').innerHTML = t ? htmlTalla(t) : '<span class="tl-otra">Personalizada</span>';
  caja.querySelector('.st-boton').setAttribute('aria-label', 'Talla: ' + (t ? textoTalla(t) : 'personalizada'));
  if (!caja.querySelector('.st-lista').hidden) pintarListaTallas();
}
function pintarListaTallas() {
  const lista = $('selTalla').querySelector('.st-lista'), v = $('talla').value;
  lista.innerHTML = [...tallas.map(t => `<li role="option" data-talla="${t.talla}" aria-selected="${t.talla === v}">${htmlTalla(t)}</li>`),
    `<li role="option" data-talla="otra" aria-selected="${v === 'otra'}"><span class="tl-otra">Personalizada</span></li>`].join('');
}
function abrirListaTallas(si) {
  const caja = $('selTalla'), lista = caja.querySelector('.st-lista'), boton = caja.querySelector('.st-boton');
  if (si === undefined) si = lista.hidden;
  if (si) { pintarListaTallas(); lista.hidden = false; lista.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' }); }
  else lista.hidden = true;
  boton.setAttribute('aria-expanded', String(si)); caja.classList.toggle('abierta', si);
}
function elegirTalla(v) {
  abrirListaTallas(false);
  if ($('talla').value !== v) { $('talla').value = v; $('talla').dispatchEvent(new Event('change')); }
  pintarSelTalla(); $('selTalla').querySelector('.st-boton').focus();
}
{
  const caja = $('selTalla'), boton = caja.querySelector('.st-boton'), lista = caja.querySelector('.st-lista');
  boton.addEventListener('click', () => abrirListaTallas());
  lista.addEventListener('click', ev => { const li = ev.target.closest('[data-talla]'); if (li) elegirTalla(li.dataset.talla); });
  // teclado: flechas cambian de talla, Enter o espacio abren, Esc cierra
  caja.addEventListener('keydown', ev => {
    const opciones = [...tallas.map(t => t.talla), 'otra'], i = opciones.indexOf($('talla').value);
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault(); const n = opciones[Math.min(Math.max(i + (ev.key === 'ArrowDown' ? 1 : -1), 0), opciones.length - 1)];
      if (n !== $('talla').value) { $('talla').value = n; $('talla').dispatchEvent(new Event('change')); pintarSelTalla(); }
      lista.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    } else if (ev.key === 'Escape' && !lista.hidden) { ev.preventDefault(); ev.stopPropagation(); abrirListaTallas(false); }
    else if (ev.key === 'Enter' && !lista.hidden) { ev.preventDefault(); abrirListaTallas(false); }
  });
  document.addEventListener('pointerdown', ev => { if (!caja.contains(ev.target)) abrirListaTallas(false); });
}
function ponerCuadro(id) {
  if (!CUADROS[id]) id = 'hombre';
  $('cuadro').value = id; tallas = CUADROS[id].tallas; pintarCuadro(); recordar('cuadro', id);
}
const tallaDeLargo = largo => tallas.find(t => t.largo + margenPulido() === largo)?.talla ?? 'otra';
const tallaCercana = largo => tallas.reduce((a, b) => (Math.abs(b.largo - largo) < Math.abs(a.largo - largo) ? b : a));
function pintarNotaLargo() {
  const t = tallas.find(x => x.talla === $('talla').value), m = margenPulido();
  $('notaLargo').textContent = !t ? '' : m ? `${t.largo} mm del cuadro + ${m} mm para pulir (EVA)` : `${t.largo} mm del cuadro`;
  $('notaLargo').hidden = !t;
  pintarSelTalla();   // la lista propia de tallas sigue a la talla elegida
}
function ponerMedidaDesde(modo, aplicar = true) {
  $('medidaDesde').value = modo === 'muestra' ? 'muestra' : 'guia'; recordar('medidaDesde', $('medidaDesde').value);
  if (!aplicar || !conGuia()) return;
  // a guía de tallas: la talla elegida (o la más cercana al largo de ahora), ancho proporcional y forma de la horma
  const t = tallas.find(x => x.talla === $('talla').value) ?? tallaCercana(num('largo') - margenPulido());
  ponerTalla(t.talla); $('anchoAuto').checked = true; escalaTalon = null; talonPedido = null; $('anchoTalonAuto').checked = true;
  if (contornoActual) { contornoActual = null; pintarContorno(); }
  mensaje(`Con guía de tallas: ${t.corta}, largo ${num('largo')} mm${margenPulido() ? ` (${t.largo} + ${margenPulido()} para pulir)` : ''}.`);
}

// copa y espesor: los del tipo de diseño (delgado o estándar), salvo que la horma traiga los suyos
function valoresDeProducto() {
  const p = producto(), t = tipoHorma(), v = hormaInfo[hormaId()]?.valores ?? {};
  const copa = v.copa ?? t?.copa ?? p.copa, antepie = v.antepie ?? t?.antepie ?? p.antepie;
  for (const s of ['', 'Der']) { $('copa' + s).value = copa; $('antepie' + s).value = antepie; $('canto' + s).value = p.canto ?? 1.2; }
}
// tipo de arco: con neutro, plano o cavo el alto queda fijo (los dos pies); "a mano" deja escribirlo (y separarlo)
function pintarTipoArco() {
  const t = $('tipoArco').value, fijo = TIPOS_ARCO[t];
  if (fijo) { $('arco').value = $('arcoDer').value = fijo.altura; ponerSeparado('arco', false); }
  // con un tipo elegido el número queda bloqueado (solo lectura, así recibe el clic que lo desbloquea)
  const bloqueado = t !== 'mano';
  for (const el of [$('arco'), $('arcoDer')]) {
    el.disabled = false; el.readOnly = bloqueado; el.classList.toggle('bloqueado', bloqueado);
    el.title = bloqueado ? 'Clic para escribir el alto de arco a mano' : '';
  }
  document.querySelector('[data-candado="arco"]').hidden = bloqueado;
  for (const b of document.querySelectorAll('#botonesArco [data-arco]')) {
    const si = b.dataset.arco === t; b.classList.toggle('activo', si); b.setAttribute('aria-checked', String(si));
  }
}
// clic en el alto de arco bloqueado: pasa a "a mano" con el mismo número, listo para escribir
// (en la fila: el casillero del pie derecho se crea después, con el candado)
$('arco').closest('.fila').addEventListener('click', ev => {
  const el = ev.target; if ((el.id !== 'arco' && el.id !== 'arcoDer') || !el.readOnly || el.disabled) return;
  $('tipoArco').value = 'mano'; $('tipoArco').dispatchEvent(new Event('change'));
  el.focus(); el.select();
});
function ponerTalla(talla) {
  const t = tallas.find(x => x.talla === String(talla));
  if (t) { $('talla').value = t.talla; $('largo').value = t.largo + margenPulido(); }
  pintarNotaLargo();
}

// Valores por pie, como el candado de LutraCAD: cerrado (por defecto) = un solo valor para los dos pies;
// abierto = el primer casillero es el pie izquierdo y aparece otro para el derecho (Ernesto, 2026-11-12)
const POR_PIE = ['copa', 'antepie', 'arco', 'arcoPos', 'canto'];
const separado = new Set();
for (const id of POR_PIE) {
  const a = $(id), fila = a.closest('.fila'), b = a.cloneNode(), nombre = fila.querySelector('label').textContent;
  b.id = id + 'Der'; b.hidden = true; b.setAttribute('aria-label', nombre + ', pie derecho'); a.after(b);
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'candado'; btn.dataset.candado = id;
  fila.querySelector('.campo').after(btn);
  fila.querySelector('label').insertAdjacentHTML('beforeend', '<small class="izqder"> izq · der</small>');
  fila.classList.add('por-pie');
  b.addEventListener('input', pedir);
  btn.addEventListener('click', () => { ponerSeparado(id, !separado.has(id)); pedir(); });
  ponerSeparado(id, false);
}
function ponerSeparado(id, si) {
  const btn = document.querySelector(`[data-candado="${id}"]`), nombre = $(id).closest('.fila').querySelector('label').firstChild.textContent.trim();
  if (si && !separado.has(id)) $(id + 'Der').value = $(id).value;
  if (si) separado.add(id); else separado.delete(id);
  $(id + 'Der').hidden = !si;
  $(id).setAttribute('aria-label', si ? nombre + ', pie izquierdo' : nombre);
  $(id).closest('.fila').classList.toggle('separado', si);
  btn.textContent = si ? '🔓' : '🔒';
  btn.title = si ? 'Izquierdo y derecho por separado. Clic para usar el mismo valor en los dos pies (toma el del izquierdo).'
                 : 'El mismo valor en los dos pies. Clic para poner un valor distinto en cada pie.';
  btn.setAttribute('aria-pressed', String(si));
}

// ---- Secciones desplegables (Ernesto, 2026-11-13) ----
// Cada título del panel abre o cierra su sección; empiezan cerradas y el programa recuerda cuáles quedaron
// abiertas. Cerrada, el título muestra un resumen corto (paciente, talla, alturas…).
const seccionesAbiertas = new Set((() => { try { return JSON.parse(recordado('secciones') ?? '[]'); } catch { return []; } })());
const secciones = {};
document.querySelectorAll('aside section > h2').forEach(h => {
  const sec = h.parentElement, clave = h.textContent.trim();
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'plegar';
  b.innerHTML = '<span class="flecha" aria-hidden="true">▸</span><span class="texto"></span><span class="resumen"></span>';
  b.querySelector('.texto').textContent = h.textContent;
  h.textContent = ''; h.appendChild(b);
  secciones[clave] = sec;
  b.addEventListener('click', () => abrirSeccion(clave, sec.classList.contains('cerrada'), true));
  abrirSeccion(clave, seccionesAbiertas.has(clave), false);
});
function abrirSeccion(clave, si = true, guardarlo = true) {
  const sec = secciones[clave]; if (!sec) return;
  sec.classList.toggle('cerrada', !si);
  sec.querySelector('.plegar').setAttribute('aria-expanded', String(si));
  if (si) seccionesAbiertas.add(clave); else seccionesAbiertas.delete(clave);
  if (guardarlo) recordar('secciones', JSON.stringify([...seccionesAbiertas]));
}
const resumenSeccion = (clave, texto) => { const r = secciones[clave]?.querySelector('.resumen'); if (r) { r.textContent = texto; r.title = texto; } };

const nombreTipo = id => ({ delgado: 'delgado', estandar: 'estándar' }[id] ?? id);
// al abrir: la guía de tallas con su tipo (estándar, Ernesto 2026-11-17); una horma sin tipo toma el del producto
$('producto').value = 'resina'; $('horma').value = 'guia_tallas';
$('tipoDiseno').value = hormaInfo.guia_tallas?.tipo ?? producto().tipo ?? 'delgado'; valoresDeProducto();
$('tipoArco').value = 'neutro'; pintarTipoArco();
// cambiar de horma: si es delgada o estándar pone ese tipo de diseño; la línea de corte editada o la muestra se mantienen
$('horma').addEventListener('change', () => {
  const m = hormaInfo[hormaId()];
  if (m.tipo && bib.tiposHorma?.[m.tipo]) $('tipoDiseno').value = m.tipo;
  valoresDeProducto();
  mensaje(`Horma ${m.nombre} (diseño ${nombreTipo($('tipoDiseno').value)}): copa ${$('copa').value.replace('.', ',')} mm, espesor ${$('antepie').value.replace('.', ',')} mm, arco al ${Math.round(arcoPosDefecto() * 100)} %.` +
    (contornoActual ? ' La plantilla mantiene la línea de corte o la muestra elegida; el relieve es el de esta horma.' : ''));
  pedir();
});
$('tipoDiseno').addEventListener('change', () => {
  valoresDeProducto();
  mensaje(`Diseño ${nombreTipo($('tipoDiseno').value)}: copa ${$('copa').value.replace('.', ',')} mm y espesor ${$('antepie').value.replace('.', ',')} mm.`);
  pedir();
});
$('tipoArco').addEventListener('change', () => { pintarTipoArco(); pedir(); });
ponerCuadro(recordado('cuadro') ?? 'hombre'); ponerTalla('9');
$('medidaDesde').value = recordado('medidaDesde') === 'muestra' ? 'muestra' : 'guia';

// cambiar de producto: con una talla elegida el largo se rehace (el EVA suma o quita el margen de pulido)
$('producto').addEventListener('change', () => {
  // cada producto trae su tipo de diseño (resina: delgado; EVA urbanas: estándar), salvo una horma delgada o estándar
  if (producto().tipo && !hormaInfo[hormaId()]?.tipo) $('tipoDiseno').value = producto().tipo;
  valoresDeProducto();
  if ($('talla').value !== 'otra' && conGuia()) ponerTalla($('talla').value); else pintarNotaLargo();
  pedir();
});
$('cuadro').addEventListener('change', () => {
  const largo = num('largo') - margenPulido(); ponerCuadro($('cuadro').value);
  if (conGuia()) ponerTalla(tallaCercana(largo).talla); else { $('talla').value = tallaDeLargo(num('largo')); pintarNotaLargo(); }
  pedir();
});
// elegir una talla es trabajar con la guía de tallas
$('talla').addEventListener('change', () => {
  if ($('talla').value !== 'otra') { if (conGuia()) ponerTalla($('talla').value); else ponerMedidaDesde('guia'); }
  pintarNotaLargo(); pedir();
});
$('medidaDesde').addEventListener('change', () => { ponerMedidaDesde($('medidaDesde').value); pedir(); });
$('largo').addEventListener('input', () => { $('talla').value = tallaDeLargo(num('largo')); pintarNotaLargo(); pedir(); });
for (const id of ['copa', 'antepie', 'arco', 'arcoPos', 'canto', 'paciente', 'contactoPct', 'corrArcoIzq', 'corrArcoDer', 'corrApiceIzq', 'corrApiceDer']) $(id).addEventListener('input', pedir);
for (const id of ['arcoPosAuto', 'contactoActivo', 'contactoForma']) $(id).addEventListener('change', pedir);
// Anchos (Ernesto, 2026-11-16): se escriben como se miden en la plantilla. El ancho del antepié se pasa al ancho de
// la horma ("ancho", oculto) con la proporción de la última plantilla; el del talón, a un factor solo del talón.
// Auditoría 2026-11-16: la proporción se toma de la última plantilla generada (ultimoAncho), no del casillero que la
// tecla anterior ya cambió: antes, escribir "90,5" dejaba 77,5 mm y "100" y "110" seguidos dejaban 141,8 mm.
// Fuera del rango del casillero (40 a 140 mm el antepié, 30 a 110 el talón) no se aplica hasta que se corrija.
let escalaTalon = null;   // null = el talón de la horma
let talonPedido = null;   // ancho del talón escrito: se afina en la plantilla siguiente (la escala no es lineal)
const enRango = (id, v) => Number.isFinite(v) && v >= parseFloat($(id).min) && v <= parseFloat($(id).max);
$('anchoAntepie').addEventListener('input', () => {
  const v = num('anchoAntepie');
  // fuera de rango (QA-02, 2026-11-18): queda escrito a mano y valoresFuera() lo marca y bloquea exportar
  if (!enRango('anchoAntepie', v)) { $('anchoAuto').checked = false; pedir(); return; }
  if (!ultimoAncho) return;
  $('ancho').value = (v * ultimoAncho.ancho / ultimoAncho.antepie).toFixed(2); $('anchoAuto').checked = false; pedir();
});
$('anchoAuto').addEventListener('change', pedir);
$('anchoTalon').addEventListener('input', () => {
  const v = num('anchoTalon');
  if (!enRango('anchoTalon', v)) { $('anchoTalonAuto').checked = false; pedir(); return; }
  if (!ultimoAncho) return;
  talonPedido = v;
  escalaTalon = Math.min(Math.max(v / (ultimoAncho.talon / ultimoAncho.escala), 0.6), 1.5); $('anchoTalonAuto').checked = false; pedir();
});
$('anchoTalonAuto').addEventListener('change', () => { if ($('anchoTalonAuto').checked) { escalaTalon = null; talonPedido = null; } pedir(); });

// ---- Elementos ----
// cada uno con su altura por pie (0 en un pie = ese pie no lo lleva) y su posición por pie:
// mov.izq = [adelante, hacia interno] en mm respecto de donde lo pone la biblioteca
let elegidos = [], activo = -1;
// pie del elemento elegido (verde en ese pie, rojo el mismo elemento en el otro, como LutraCAD) y qué hace arrastrarlo
let activoPie = 'izq', modoElem = 'mover';
let contornoActual = null, alturaBordeActual = null;   // { archivo, puntos } cuando la plantilla tiene la forma de la muestra
// Lista de "Agregar elemento": favoritos primero y después por categoría (Biblioteca, 2026-11-13)
const CATEGORIAS = ['Cuñas', 'Barras y olivas', 'Arcos', 'Talón', 'Otros'];
let favoritos = [];
function pintarListaElementos() {
  const s = $('agregarElemento'); while (s.children.length > 1) s.lastChild.remove();
  const grupo = (etq, lista) => {
    if (!lista.length) return;
    const g = document.createElement('optgroup'); g.label = etq;
    for (const e of lista) g.append(new Option(e.nombre + (e.propio ? ' · propio' : ''), e.id));
    s.append(g);
  };
  grupo('★ Favoritos', favoritos.map(id => catalogo.find(e => e.id === id)).filter(Boolean));
  const cats = [...CATEGORIAS, ...new Set(catalogo.map(e => e.categoria).filter(c => c && !CATEGORIAS.includes(c)))];
  for (const c of cats) grupo(c, catalogo.filter(e => (e.categoria || 'Otros') === c));
}
pintarListaElementos();
// Elementos propios de Lima Blue (de la carpeta compartida, Biblioteca/elementos.json): se suman al catálogo
function ponerElementosPropios({ elementos = [], favoritos: fav = [] } = {}) {
  // primero vuelve todo a como viene el programa
  for (let i = catalogo.length - 1; i >= 0; i--) {
    const e = catalogo[i];
    if (ORIGINALES[e.id]) { if (e.modificado) { catalogo[i] = JSON.parse(JSON.stringify(ORIGINALES[e.id])); formas[e.id] = prepararElemento(catalogo[i]); } }
    else if (e.propio) { delete formas[e.id]; catalogo.splice(i, 1); }
  }
  for (const def of elementos) {
    try {
      const forma = prepararElemento(def), i = catalogo.findIndex(e => e.id === def.id);
      // uno del programa sobrescrito desde la Biblioteca (Ernesto, 2026-11-14): reemplaza al original
      if (i >= 0 && ORIGINALES[def.id]) catalogo[i] = { ...def, modificado: true };
      else if (i < 0) catalogo.push({ ...def, propio: true });
      else continue;
      formas[def.id] = forma;
    } catch { /* definición rota: se omite */ }
  }
  favoritos = fav.filter(id => catalogo.some(e => e.id === id));
  pintarListaElementos(); pedir();
}
// Dibujo de un elemento visto desde arriba sobre una plantilla izquierda de 240 mm (tarjetas de la Biblioteca)
function miniaturaElemento(def, cv, opciones = {}) {
  const c = cv.getContext('2d'), W = cv.width, H = cv.height; c.clearRect(0, 0, W, H);
  let g;
  try {
    const forma = prepararElemento(def), h = hormas[bib.productos[0].horma];
    // los guardados desde un diseño se dibujan con su tamaño, giro y posición (salvo al editar su forma con la caja)
    const ini = opciones.sinInicial ? null : def.inicial;
    g = generar(h, { largo: 240, antepie: 1.5, copa: 10, canto: 1.2, lado: 'izq', lados: opciones.zona || opciones.silueta ? 220 : 120, arcos: opciones.zona || opciones.silueta ? 50 : 30, anillos: opciones.zona || opciones.silueta ? 40 : 18, arcoPos: ARCO_POS,
                     elementos: [{ forma, altura: Math.max(ini?.altura ?? def.altura ?? 3, 1), mover: ini?.mov, giro: ini?.giro ?? 0,
                                   escala: ini?.tam ? [ini.tam[0] / 100, ini.tam[1] / 100] : [1, 1] }] });
  } catch { c.fillStyle = '#b3261e'; c.font = '12px system-ui'; c.fillText('Forma con error', 10, 20); return; }
  const { ns, nr, x, y, aportes } = g, ap = aportes[0];
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  // silueta (Biblioteca, Ernesto 2026-11-17, como LutraCAD): solo la forma del elemento, sin la plantilla
  if (opciones.silueta) {
    for (let q = 0; q < x.length; q++) if (ap[q] > ELEM_BORDE + 0.05) { x0 = Math.min(x0, x[q]); x1 = Math.max(x1, x[q]); y0 = Math.min(y0, y[q]); y1 = Math.max(y1, y[q]); }
    if (!(x1 > x0)) return;
    const k = Math.min((W - 6) / (x1 - x0), (H - 6) / (y1 - y0)), ox = (W - k * (x1 - x0)) / 2, oy = (H - k * (y1 - y0)) / 2;
    const P = q => [ox + (x[q] - x0) * k, H - oy - (y[q] - y0) * k];
    for (let i = 0; i < ns; i++) {
      const j = (i + 1) % ns;
      for (let kk = 0; kk < nr - 1; kk++) {
        const a = i * nr + kk, b = j * nr + kk, cc = j * nr + kk + 1, d = i * nr + kk + 1;
        // recorta cada celda justo donde el elemento empieza (interpolando), así el borde sale liso y sin escalones
        const vs = [a, b, cc, d], pts = [];
        for (let n = 0; n < 4; n++) {
          const p = vs[n], q = vs[(n + 1) % 4], hp = ap[p] - ELEM_BORDE, hq = ap[q] - ELEM_BORDE;
          if (hp > 0) pts.push(P(p));
          if ((hp > 0) !== (hq > 0)) { const t = hp / (hp - hq), [px, py] = P(p), [qx, qy] = P(q); pts.push([px + t * (qx - px), py + t * (qy - py)]); }
        }
        if (pts.length < 3) continue;
        const col = SILUETA.map(u => Math.min(255, Math.round(255 * u * luzCara(g, a, b, cc, d))));
        c.fillStyle = c.strokeStyle = `rgb(${col.join(',')})`; c.lineWidth = 0.5;
        c.beginPath(); pts.forEach(([px, py], n) => n ? c.lineTo(px, py) : c.moveTo(px, py)); c.closePath(); c.fill(); c.stroke();
      }
    }
    return;
  }
  for (let q = 0; q < x.length; q++) { x0 = Math.min(x0, x[q]); x1 = Math.max(x1, x[q]); y0 = Math.min(y0, y[q]); y1 = Math.max(y1, y[q]); }
  // zona = { u0, u1 } (fracciones del largo): se acerca a ese tramo de la plantilla, de borde a borde (caja del editor)
  if (opciones.zona) {
    const ya = Math.max(opciones.zona.u0 * 240, y0), yb = Math.min(opciones.zona.u1 * 240, y1);
    let xa = Infinity, xb = -Infinity;
    for (let i = 0; i < ns; i++) { const q = i * nr; if (y[q] >= ya - 5 && y[q] <= yb + 5) { xa = Math.min(xa, x[q]); xb = Math.max(xb, x[q]); } }
    if (xb > xa) { x0 = xa - 4; x1 = xb + 4; y0 = ya; y1 = yb; }
  }
  const k = Math.min((W - 16) / (x1 - x0), (H - 16) / (y1 - y0)), ox = (W - k * (x1 - x0)) / 2, oy = (H - k * (y1 - y0)) / 2;
  const P = q => [ox + (x[q] - x0) * k, H - oy - (y[q] - y0) * k];   // dedos arriba
  const alto = Math.max(...ap) || 1, colorE = def.descarga ? COLOR_DESCARGA : COLOR_ELEMENTO, sil = !!opciones.silueta;
  for (let i = 0; i < ns; i++) {
    const j = (i + 1) % ns;
    for (let kk = 0; kk < nr - 1; kk++) {
      const a = i * nr + kk, b = j * nr + kk, cc = j * nr + kk + 1, d = i * nr + kk + 1;
      const m = (ap[a] + ap[b] + ap[cc] + ap[d]) / 4, t = m > ELEM_BORDE ? 0.55 + 0.45 * Math.min(m / alto, 1) : 0;
      const s = sil ? luzCara(g, a, b, cc, d) : 1, base = sil ? SILUETA : COLOR_PLANTILLA;
      const col = base.map((v, n) => Math.round(255 * s * (v + t * (colorE[n] - v))));
      c.fillStyle = c.strokeStyle = `rgb(${col.join(',')})`; c.lineWidth = 0.6;
      c.beginPath(); for (const q of [a, b, cc, d]) { const [px, py] = P(q); q === a ? c.moveTo(px, py) : c.lineTo(px, py); } c.closePath(); c.fill(); c.stroke();
    }
  }
  c.strokeStyle = sil ? 'rgba(120,130,140,.7)' : '#0d6122'; c.lineWidth = sil ? 0.8 : 1.4; c.beginPath();
  for (let i = 0; i <= ns; i++) { const [px, py] = P((i % ns) * nr); i ? c.lineTo(px, py) : c.moveTo(px, py); }
  c.stroke();
  // para la caja del editor: de (u, v) del elemento a píxeles del dibujo y de vuelta (como lo lee el motor: v es la
  // fracción del ancho de la fila, con el ancho tomado entre el 10 % y el 90 % del largo)
  const largo = 240, bordes = yy => {
    const yc = Math.min(Math.max(yy, 0.1 * largo), 0.9 * largo); let a = Infinity, b = -Infinity;
    for (let i = 0; i < ns; i++) {
      const p = i * nr, q = ((i + 1) % ns) * nr;
      if ((y[p] - yc) * (y[q] - yc) <= 0 && y[p] !== y[q]) { const xx = x[p] + ((yc - y[p]) / (y[q] - y[p])) * (x[q] - x[p]); a = Math.min(a, xx); b = Math.max(b, xx); }
    }
    return [a, b];
  };
  cv._mapa = {
    aPx: (u, v) => { const yy = u * largo, [a, b] = bordes(yy), xx = a + v * (b - a); return [ox + (xx - x0) * k, H - oy - (yy - y0) * k]; },
    dePx: (px, py) => { const yy = (H - oy - py) / k + y0, xx = (px - ox) / k + x0, [a, b] = bordes(yy); return [yy / largo, (xx - a) / (b - a)]; },
  };
}
// Hormas para la Biblioteca (2026-11-16): nombre, tipo, valores y dibujo (de arriba, con el relieve en tonos, y de
// costado, la silueta del lado interno), con la copa y el antepié de su tipo a 260 mm
function listaHormas() {
  return Object.values(hormaInfo).filter(m => !m.oculta).map(m => {
    const t = bib.tiposHorma?.[m.tipo], p = bib.productos.find(x => x.horma === m.id) ?? bib.productos[0];
    const copa = m.valores?.copa ?? t?.copa ?? p.copa, antepie = m.valores?.antepie ?? t?.antepie ?? p.antepie;
    return { id: m.id, nombre: m.nombre, tipo: m.tipo ?? '', tipoNombre: t?.nombre ?? 'Para delgadas y estándar', nota: m.nota ?? '',
             calzados: t?.calzados ?? [], copa, antepie, arco: m.valores?.arco ?? null, arcoPos: m.valores?.arcoPos ?? ARCO_POS,
             propia: !!m.propia, modificado: !!m.modificado, editable: !!m.base,
             dibujar: cv => miniaturaHorma(hormas[m.id], cv, { copa, antepie, arco: m.valores?.arco, arcoPos: m.valores?.arcoPos ?? ARCO_POS }) };
  });
}
// ---- Editor de hormas (Biblioteca, 2026-11-17) ----
// Lo que el editor necesita del programa: armar la horma de una definición, generar la plantilla de muestra (260 mm,
// con la copa y el espesor de su tipo y arco neutro), medir su costado y mostrarla en 3D.
const editorHorma = {
  tipos: () => Object.fromEntries(Object.entries(bib.tiposHorma ?? {}).filter(([, t]) => t?.copa)),
  def: defHorma,
  construir: def => construirHorma(def, def.puntos),
  valores: def => { const t = bib.tiposHorma?.[def.tipo] ?? bib.tiposHorma?.estandar; return { copa: def.valores?.copa ?? t.copa, antepie: def.valores?.antepie ?? t.antepie, arco: TIPOS_ARCO.neutro?.altura ?? 20 }; },
  generar(h, def, rapido = false) {
    const v = editorHorma.valores(def);
    return generar(h, { largo: 260, ...v, canto: 1.2, lado: 'izq', arcoPos: def.valores?.arcoPos ?? ARCO_POS,
                        acabado: rapido ? undefined : acabados[bib.productos[0].acabado], ...(rapido ? { lados: 160, anillos: 24 } : {}) });
  },
  // costado: lo más alto en cada tramo del largo (lado interno) y la altura del borde externo, cada 1 % del largo
  perfil(g) {
    const N = 100, L = 260, sil = new Array(N + 1).fill(0), ext = new Array(N + 1).fill(null), xmin = new Array(N + 1).fill(Infinity);
    for (let q = 0; q < g.x.length; q++) { const k = Math.round(g.y[q] / L * N); if (k >= 0 && k <= N) sil[k] = Math.max(sil[k], g.z[q]); }
    for (let i = 0; i < g.ns; i++) { const q = i * g.nr, k = Math.round(g.y[q] / L * N); if (k >= 0 && k <= N && g.x[q] < 0 && g.x[q] < xmin[k]) { xmin[k] = g.x[q]; ext[k] = g.z[q]; } }
    for (let k = 0; k <= N; k++) { if (!sil[k]) sil[k] = sil[k - 1] ?? sil[k + 1] ?? 0; if (ext[k] == null) ext[k] = ext[k - 1] ?? sil[k]; }
    return { sil, ext, N };
  },
  vista3D(cv, cubo) {
    const v = crearVisor(cv); if (cubo) crearCubo(cubo, v);
    let primera = true;
    return {
      poner(g) {
        const mm = modoMapa; modoMapa = null;
        try { v.poner([malla(g, 0), contornoPlantilla(g, 0)]); } finally { modoMapa = mm; }
        if (primera) { let x0 = Infinity, x1 = -Infinity; for (const xx of g.x) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); } v.encuadrar([x0, 0, 0, x1, 260, 22]); primera = false; }
      },
      vista: n => v.vista(n),
      visor: v,   // para los puntos de edición sobre el 3D (proyectar, rayo, alDibujar, alClic, alAgarrar)
      cerrar() { try { cv.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ya cerrado */ } },
    };
  },
};
// Miniaturas tipo silueta (Biblioteca): color claro y una luz desde arriba a la izquierda; lo inclinado se oscurece
const SILUETA = [0.86, 0.88, 0.9];
function luzCara(g, a, b, cc, d) {
  const { x, y, z } = g;
  const u = [x[cc] - x[a], y[cc] - y[a], (z[cc] - z[a]) * 1.6], w = [x[d] - x[b], y[d] - y[b], (z[d] - z[b]) * 1.6];
  let n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
  if (n[2] < 0) n = n.map(v => -v);
  const ln = Math.hypot(...n) || 1, L = [-0.45, 0.35, 0.82];
  return 0.8 + 0.24 * Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / ln);
}
function miniaturaHorma(h, cv, v) {
  const c = cv.getContext('2d'), W = cv.width, H = cv.height; c.clearRect(0, 0, W, H);
  let g; try { g = generar(h, { largo: 260, antepie: v.antepie, copa: v.copa, ...(v.arco ? { arco: v.arco } : {}), canto: 1.2, lado: 'izq', lados: 120, arcos: 30, anillos: 18, arcoPos: v.arcoPos }); }
  catch { c.fillStyle = '#b3261e'; c.font = '12px system-ui'; c.fillText('Horma con error', 10, 20); return; }
  // Solo la vista de arriba (Ernesto, 2026-11-16), en proporción y centrada
  const { ns, nr, x, y, z } = g;
  let x0 = Infinity, x1 = -Infinity, zMax = 0;
  for (let q = 0; q < x.length; q++) { x0 = Math.min(x0, x[q]); x1 = Math.max(x1, x[q]); zMax = Math.max(zMax, z[q]); }
  const k = Math.min((W - 20) / (x1 - x0), (H - 20) / 260);
  const ox = (W - k * (x1 - x0)) / 2, oy = (H - 260 * k) / 2;
  const P = q => [ox + (x[q] - x0) * k, H - oy - y[q] * k];
  // silueta clara con luz, como la biblioteca de LutraCAD (Ernesto, 2026-11-17): el relieve se ve por la sombra
  for (let i = 0; i < ns; i++) {
    const j = (i + 1) % ns;
    for (let kk = 0; kk < nr - 1; kk++) {
      const a = i * nr + kk, b = j * nr + kk, cc = j * nr + kk + 1, d = i * nr + kk + 1;
      const s = luzCara(g, a, b, cc, d), col = SILUETA.map(u => Math.round(255 * u * s));
      c.fillStyle = c.strokeStyle = `rgb(${col.join(',')})`; c.lineWidth = 0.6;
      c.beginPath(); for (const q of [a, b, cc, d]) { const [px, py] = P(q); q === a ? c.moveTo(px, py) : c.lineTo(px, py); } c.closePath(); c.fill(); c.stroke();
    }
  }
  c.strokeStyle = 'rgba(120,130,140,.7)'; c.lineWidth = 0.8; c.beginPath();
  for (let i = 0; i <= ns; i++) { const [px, py] = P((i % ns) * nr); i ? c.lineTo(px, py) : c.moveTo(px, py); }
  c.stroke();
}
// Vista 3D del editor de elementos (Biblioteca, pantalla completa; Ernesto 2026-11-14): la plantilla izquierda de
// 240 mm con el elemento, en un visor propio que se gira, acerca y mueve igual que el del diseño.
// De (u, v) del elemento a mm de una plantilla generada (pie izquierdo) y de vuelta, como lo lee el motor: v es la
// fracción del ancho de la fila, con el ancho tomado entre el 10 % y el 90 % del largo.
function mapaUV(g) {
  const { ns, nr, x, y } = g; let largo = 0; for (let i = 0; i < ns; i++) largo = Math.max(largo, y[i * nr]);
  const bordes = yy => {
    const yc = Math.min(Math.max(yy, 0.1 * largo), 0.9 * largo); let a = Infinity, b = -Infinity;
    for (let i = 0; i < ns; i++) {
      const p = i * nr, q = ((i + 1) % ns) * nr;
      if ((y[p] - yc) * (y[q] - yc) <= 0 && y[p] !== y[q]) { const xx = x[p] + ((yc - y[p]) / (y[q] - y[p])) * (x[q] - x[p]); a = Math.min(a, xx); b = Math.max(b, xx); }
    }
    return [a, b];
  };
  return {
    largo,
    aMundo: (u, v) => { const yy = u * largo, [a, b] = bordes(yy); return [a + v * (b - a), yy]; },
    deMundo: (xx, yy) => { const [a, b] = bordes(yy); return [yy / largo, (xx - a) / (b - a)]; },
  };
}
function vista3DElemento(cv, cubo) {
  const v = crearVisor(cv), h = hormas[bib.productos[0].horma];
  if (cubo) crearCubo(cubo, v);
  let primera = true, g = null, mapa = null;
  return {
    visor: v,
    mapa: () => mapa,
    // lo más alto del elemento a lo largo, en u: { x, y, z (arriba), base (z de la plantilla), alto (mm del elemento) }
    cresta(u) {
      if (!g) return null;
      const yy = u * mapa.largo, ap = g.aportes[0]; let mejor = -1, qm = -1;
      for (let q = 0; q < ap.length; q++) if (Math.abs(g.y[q] - yy) < 2.5 && ap[q] > mejor) { mejor = ap[q]; qm = q; }
      if (qm < 0) return null;
      return { x: g.x[qm], y: yy, z: g.z[qm], base: g.z[qm] - ap[qm], alto: ap[qm] };
    },
    poner(def) {
      try {
        g = generar(h, { largo: 240, antepie: 1.5, copa: 10, canto: 1.2, lado: 'izq', arcoPos: ARCO_POS,
                         acabado: bib.productos[0].acabado ? acabados[bib.productos[0].acabado] : undefined,
                         elementos: [{ forma: prepararElemento(def), altura: Math.max(def.altura ?? 3, 0.5) }] });
      } catch { return; }
      mapa = mapaUV(g);
      const mm = modoMapa; modoMapa = null;   // en el editor, siempre con los colores normales
      try { v.poner([malla(g, 0), contornoPlantilla(g, 0)]); } finally { modoMapa = mm; }
      if (primera) {
        let x0 = Infinity, x1 = -Infinity; for (const xx of g.x) { x0 = Math.min(x0, xx); x1 = Math.max(x1, xx); }
        v.encuadrar([x0, 0, 0, x1, 240, 14]); primera = false;
      }
    },
    vista: n => v.vista(n),
    // acerca la cámara al tramo [u0, u1] del largo (de borde a borde): la caja se ve grande
    acercar(u0, u1) {
      if (!g) return;
      let x0 = Infinity, x1 = -Infinity; const ya = u0 * 240, yb = u1 * 240;
      for (let q = 0; q < g.x.length; q++) if (g.y[q] >= ya && g.y[q] <= yb) { x0 = Math.min(x0, g.x[q]); x1 = Math.max(x1, g.x[q]); }
      if (x1 > x0) v.encuadrar([x0, ya, 0, x1, yb, 12]);
    },
    cerrar() { try { cv.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ya cerrado */ } },
  };
}
// Recuadro del elemento en (u, v) sin la caja, con un margen: donde se arma la caja la primera vez
function recuadroElemento(def) {
  const d = { ...def }; delete d.caja;
  const f = prepararElemento(d).para(hormas[bib.productos[0].horma]);
  let u0 = 1, u1 = 0, v0 = 1, v1 = 0, max = 0;
  for (let i = 0; i <= 150; i++) for (let j = 0; j <= 60; j++) max = Math.max(max, f(i / 150, j / 60));
  for (let i = 0; i <= 150; i++) for (let j = 0; j <= 60; j++) if (f(i / 150, j / 60) > 0.04 * max) { u0 = Math.min(u0, i / 150); u1 = Math.max(u1, i / 150); v0 = Math.min(v0, j / 60); v1 = Math.max(v1, j / 60); }
  if (u1 <= u0) return { u0: 0.3, u1: 0.7, v0: 0.2, v1: 0.8 };
  const mu = 0.02, mv = 0.06;
  return { u0: Math.max(u0 - mu, 0), u1: Math.min(u1 + mu, 1), v0: Math.max(v0 - mv, 0), v1: Math.min(v1 + mv, 1) };
}
const nombreElemento = id => catalogo.find(e => e.id === id)?.nombre ?? id;
const esDescargaId = id => !!catalogo.find(e => e.id === id)?.descarga;
const fmtMov = v => String(Math.round(v * 10) / 10);
// Ajustes de cada elemento por pie: posición, giro y tamaño (se ven en "Posición, giro y tamaño")
const CAMPOS = [
  { k: 'adelante', etq: 'Hacia los dedos (mm)', paso: 1, min: -80, max: 80, leer: (e, p) => e.mov[p][0], poner: (e, p, v) => { e.mov[p][0] = v; } },
  { k: 'interno', etq: 'Hacia interno (mm)', paso: 1, min: -80, max: 80, leer: (e, p) => e.mov[p][1], poner: (e, p, v) => { e.mov[p][1] = v; } },
  { k: 'giro', etq: 'Giro (°, + frente hacia interno)', paso: 5, min: -90, max: 90, leer: (e, p) => e.giro[p], poner: (e, p, v) => { e.giro[p] = v; } },
  { k: 'largo', etq: 'Largo (%)', paso: 5, min: 40, max: 250, leer: (e, p) => e.tam[p][0], poner: (e, p, v) => { e.tam[p][0] = v; } },
  { k: 'ancho', etq: 'Ancho (%)', paso: 5, min: 40, max: 250, leer: (e, p) => e.tam[p][1], poner: (e, p, v) => { e.tam[p][1] = v; } },
];
const campo = k => CAMPOS.find(c => c.k === k);
const abiertos = new Set();   // tarjetas con los ajustes desplegados
function pintarElementos() {
  $('listaElementos').innerHTML = elegidos.map((e, i) => `
    <div class="elemento${i === activo ? ' activo' : ''}${esDescargaId(e.id) ? ' descarga' : ''}" data-tarjeta="${i}">
      <div class="cab"><span>${esc(nombreElemento(e.id))}</span><button class="quitar" data-quitar="${i}" title="Quitar (Supr)" aria-label="Quitar ${esc(nombreElemento(e.id))}">×</button></div>
      <div class="alturas">
        <label for="el-izq-${i}">Izq</label><input type="number" id="el-izq-${i}" data-i="${i}" data-pie="izq" min="0" max="15" step="0.5" value="${+e.izq || 0}">
        <label for="el-der-${i}">Der</label><input type="number" id="el-der-${i}" data-i="${i}" data-pie="der" min="0" max="15" step="0.5" value="${+e.der || 0}">
        <span>${esDescargaId(e.id) ? 'mm hondo' : 'mm'}</span>
      </div>
      <details class="ajustes" data-det="${i}"${abiertos.has(i) ? ' open' : ''}>
        <summary>Posición, giro y tamaño</summary>
        <div class="posicion">
          <span></span><span class="cab-pie">Izq</span><span class="cab-pie">Der</span>
          ${CAMPOS.map(c => `<label>${c.etq}</label>` + ['izq', 'der'].map(p =>
            `<input type="number" step="${c.paso}" min="${c.min}" max="${c.max}" data-i="${i}" data-campo="${c.k}" data-lado="${p}" value="${fmtMov(c.leer(e, p))}" aria-label="${c.etq}, ${p === 'izq' ? 'izquierdo' : 'derecho'}">`).join('')).join('')}
        </div>
        <button class="centrar" data-centrar="${i}">Volver a su lugar y tamaño</button>
      </details>
    </div>`).join('');
  pintarPanelElemento();
}
// mientras se arrastra no se redibuja la lista (perdería el foco): solo se cambian los números
function refrescarPosiciones() {
  document.querySelectorAll('[data-campo]').forEach(inp => {
    if (inp === document.activeElement) return;
    const e = elegidos[+inp.dataset.i]; if (e) inp.value = fmtMov(campo(inp.dataset.campo).leer(e, inp.dataset.lado));
  });
  document.querySelectorAll('[data-tarjeta]').forEach(t => t.classList.toggle('activo', +t.dataset.tarjeta === activo));
  // el elemento elegido se pinta distinto en el 3D
  if (activo !== activoPintado || activoPie !== piePintado) { activoPintado = activo; piePintado = activoPie; pedir(); }
  pintarPanelElemento();
}
let activoPintado = -1, piePintado = 'izq';
$('listaElementos').addEventListener('toggle', ev => {
  const d = ev.target.closest?.('[data-det]'); if (!d) return;
  if (d.open) abiertos.add(+d.dataset.det); else abiertos.delete(+d.dataset.det);
}, true);
$('agregarElemento').addEventListener('change', () => {
  const id = $('agregarElemento').value; if (!id) return;
  const e = catalogo.find(x => x.id === id), ini = e.inicial;
  // un elemento guardado desde el diseño ("Añadir a la biblioteca") trae su tamaño, giro y posición
  const alto = ini?.altura ?? e.altura;
  elegidos.push(normalizarElemento(ini ? { id, izq: alto, der: alto, mov: { izq: ini.mov, der: ini.mov }, giro: { izq: ini.giro, der: ini.giro }, tam: { izq: ini.tam, der: ini.tam } }
                                       : { id, izq: alto, der: alto }));
  activo = elegidos.length - 1; activoPie = 'izq';
  $('agregarElemento').value = ''; pintarElementos(); pedir();
});
$('listaElementos').addEventListener('input', ev => {
  const t = ev.target;
  // 0 a 15 mm, como en el panel del elemento (auditoría 2026-11-16: aquí se podían poner 500 mm)
  if (t.dataset.pie) { elegidos[+t.dataset.i][t.dataset.pie] = Math.min(15, Math.max(0, parseFloat(t.value) || 0)); pedir(); return; }
  if (t.dataset.campo) {
    const c = campo(t.dataset.campo), e = elegidos[+t.dataset.i], n = parseFloat(t.value);
    if (!Number.isFinite(n)) return;   // campo a medio escribir: se espera
    const val = Math.max(c.min, Math.min(c.max, n));
    c.poner(e, t.dataset.lado, val);
    if ($('moverJuntos').checked) c.poner(e, t.dataset.lado === 'izq' ? 'der' : 'izq', val);
    activo = +t.dataset.i; refrescarPosiciones(); pedir();
  }
});
$('listaElementos').addEventListener('click', ev => {
  const b = ev.target.closest('[data-quitar]');
  if (b) { elegidos.splice(+b.dataset.quitar, 1); activo = -1; abiertos.clear(); pintarElementos(); pedir(); return; }
  const c = ev.target.closest('[data-centrar]');
  if (c) {
    const i = +c.dataset.centrar, e = elegidos[i];
    elegidos[i] = normalizarElemento({ id: e.id, izq: e.izq, der: e.der });
    activo = i; refrescarPosiciones(); pedir(); return;
  }
  // clic en una tarjeta: ese elemento queda elegido (para Supr o para verlo resaltado)
  const tj = ev.target.closest('[data-tarjeta]');
  if (tj && !ev.target.closest('input, summary, button')) { activo = +tj.dataset.tarjeta; activoPie = 'izq'; refrescarPosiciones(); }
});

// ---- Diseño actual ----
function diseno() {
  return {
    version: 1,
    paciente: $('paciente').value.trim(),
    producto: $('producto').value,
    horma: hormaId(),
    medidaDesde: $('medidaDesde').value,
    cuadro: $('cuadro').value,
    talla: $('talla').value === 'otra' ? null : $('talla').value,
    largo: num('largo'),
    ancho: $('anchoAuto').checked ? null : num('ancho'),
    tipoDiseno: $('tipoDiseno').value,
    escalaTalon,
    copa: num('copa'), antepie: num('antepie'),
    tipoArco: $('tipoArco').value,
    arco: $('tipoArco').value === 'horma' ? null : num('arco'),
    arcoPos: $('arcoPosAuto').checked || !(num('arcoPos') > 0) ? null : num('arcoPos') / 100,
    canto: num('canto'),
    // correcciones como LutraCAD (2026-11-17): [izquierdo, derecho] en mm
    correcciones: { arcoMedial: [num('corrArcoIzq') || 0, num('corrArcoDer') || 0], moverApice: [num('corrApiceIzq') || 0, num('corrApiceDer') || 0] },
    elementos: JSON.parse(JSON.stringify(elegidos)),
    // archivos del escaneo con que se hizo (solo el nombre: el escaneo se abre de la carpeta del paciente)
    escaneo: escaneos.izq || escaneos.der ? { izq: escaneos.izq?.nombre ?? null, der: escaneos.der?.nombre ?? null } : null,
    orden: ordenActual,
    // forma de la muestra (si se usa): contorno como pie izquierdo, en mm, talón en y = 0
    contorno: contornoActual,
    // altura del borde editada en la vista de costado: { izq, der } con { interno, externo } (mm a lo largo), o null
    alturaBorde: alturaBordeActual,
    // contacto total en el arco con el escaneo (%), o null; necesita el escaneo abierto
    contacto: $('contactoActivo').checked ? Math.min(Math.max(num('contactoPct') || 0, 0), 100) : null,
    contactoForma: $('contactoForma').value,
    // valores del pie derecho que se separaron con el candado (los de arriba son los del izquierdo)
    separados: POR_PIE.filter(id => separado.has(id)),
    der: valoresDer(),
  };
}
function valoresDer() {
  const der = {};
  for (const id of POR_PIE) {
    if (!separado.has(id)) continue;
    if (id === 'arco') { if ($('tipoArco').value === 'mano') der.arco = num('arcoDer'); }
    else if (id === 'arcoPos') { if (!$('arcoPosAuto').checked && num('arcoPosDer') > 0) der.arcoPos = num('arcoPosDer') / 100; }
    else der[id] = num(id + 'Der');
  }
  return Object.keys(der).length ? der : null;
}

let pies = 'ambos', actual = null;
const ARCO_POS = 0.35;   // cima del arco por defecto, fracción del largo desde el talón (como LutraCAD)
const DIF_ARCO_COPA = 6; // mm mínimos del arco sobre la copa (estándar 14/20 y delgado 10/20 no cambian)

// Forma de la plantilla: la horma del producto o, si se eligió, el contorno de la muestra con el relieve de esa
// horma. Se guarda una por contorno para no rehacerla (ni los elementos) en cada cambio.
const hormasMuestra = new Map();
function hormaDe(idHorma, cont) {
  if (!cont) return hormas[idHorma];
  const clave = idHorma + '|' + JSON.stringify(cont.puntos);
  if (!hormasMuestra.has(clave)) {
    if (hormasMuestra.size > 8) hormasMuestra.clear();
    hormasMuestra.set(clave, hormaConContorno(hormas[idHorma], cont.puntos));
  }
  return hormasMuestra.get(clave);
}

function generarPies(d) {
  const p = producto(), idH = hormas[d.horma] ? d.horma : p.horma, h = hormaDe(idH, d.contorno);
  const base = { largo: d.largo, antepie: d.antepie, copa: d.copa, canto: d.canto,
                 acabado: p.acabado ? acabados[p.acabado] : undefined };
  if (d.ancho) base.ancho = d.ancho;
  if (d.arco) base.arco = d.arco;
  if (d.escalaTalon) base.escalaTalon = d.escalaTalon;
  // ubicación del arco: la pedida o, por defecto, la de la horma (guía de tallas: al 35 % del largo como LutraCAD,
  // Ernesto 2026-11-12)
  base.arcoPos = d.arcoPos || (hormaInfo[idH]?.valores?.arcoPos ?? ARCO_POS);
  // ref = posición en la lista de elementos, para saber cuál se agarra en el 3D
  const de = pie => d.elementos.map((e, ref) => ({ forma: formas[e.id], altura: e[pie], mover: e.mov?.[pie], ref,
      giro: e.giro?.[pie] ?? 0, escala: e.tam ? [e.tam[pie][0] / 100, e.tam[pie][1] / 100] : [1, 1] }))
    .filter(e => e.forma && e.altura > 0);
  // contacto total: primero la plantilla sin contacto para alinear el escaneo (el contorno no cambia), después la
  // definitiva con la cara de arriba llevada a la planta del pie en el arco
  // línea de corte propia del pie derecho (editada por separado): su horma sale de su contorno y su largo y ancho
  // guardan la proporción con el izquierdo (el izquierdo es el que marca "Largo" y "Ancho")
  const hDer = d.contorno?.puntosDer ? hormaDe(idH, { puntos: d.contorno.puntosDer }) : h;
  const pie = lado => {
    let b = lado === 'der' && d.der ? { ...base, ...d.der } : base;
    if (lado === 'der' && hDer !== h) {
      b = { ...b, largo: base.largo * hDer.largo / h.largo };
      if (base.ancho) b.ancho = base.ancho * hDer.ancho / h.ancho;
    }
    const hp = lado === 'der' ? hDer : h;
    // el arco sube solo si la copa le queda cerca (Ernesto, 2026-11-17): siempre al menos DIF_ARCO_COPA mm sobre la
    // copa, para que el arco no se aplane (con copa 16 y arco neutro 20 quedaría una meseta)
    if (b.arco != null && b.copa != null && b.arco < b.copa + DIF_ARCO_COPA) b = { ...b, arco: +(b.copa + DIF_ARCO_COPA).toFixed(1) };
    // correcciones de este pie (se suman a la horma, sin reescalarla)
    { const k = lado === 'izq' ? 0 : 1, c = d.correcciones; if (c) b = { ...b, arcoMedial: c.arcoMedial?.[k] || 0, moverApice: c.moverApice?.[k] || 0 }; }
    const p = { ...b, lado, elementos: de(lado), alturaBorde: d.alturaBorde?.[lado] ?? undefined }, es = escaneos[lado];
    if (!(d.contacto > 0 && es)) return generar(hp, p);
    const al = alinearEscaneo(es, generar(hp, { ...b, lado, lados: 120, anillos: 20 }), b.antepie);
    // arco "natural" (por defecto): se alisa a lo largo y se rellenan los pozos, como el borde prolijo de la muestra;
    // "fiel": copia el escaneo tal cual (solo sin el ruido fino)
    // solo el arco (pedido de Ernesto): del 24 % al 66 % del largo del pie y del lado interno; la copa, el lado externo y el
    // antepié quedan como la horma
    // soloSubir (Ernesto, 2026-11-12): el arco nunca queda más bajo que la horma; con pie cavo sube hasta el pie
    // (fracciones del largo del pie; termina al 66 %, antes de las cabezas de los metatarsianos)
    const forma = d.contactoForma === 'fiel' ? { sx: 5, sy: 5, desde: 0.24, transicion: 0.08, hasta: 0.66, extender: true, soloSubir: true }
      : { sx: 5, sy: 15, desde: 0.24, transicion: 0.1, hasta: 0.66, alisar: 25, alisarAncho: 6, extender: true, soloSubir: true };
    // la zona del arco se mide sobre el largo del pie, no de la plantilla: con una talla más larga que el pie la zona
    // llegaba al juanete y dejaba un escalón en el borde interno del antepié
    const g = generar(hp, { ...p, contacto: { altura: al.altura, pct: d.contacto / 100, interno: lado === 'izq' ? 1 : -1,
      largoPie: es.m.largo, ...forma } });
    g.al = al; return g;
  };
  return { h, izq: pie('izq'), der: pie('der') };
}

// Escala de colores del mapa de alturas: azul (0 mm) → celeste → verde → amarillo → rojo (ALTO_MAPA mm o más).
const ALTO_MAPA = 20;
const PASOS_MAPA = [[0.16, 0.27, 0.62], [0.18, 0.62, 0.86], [0.3, 0.72, 0.42], [0.96, 0.84, 0.25], [0.86, 0.27, 0.2]];
function colorMapa(zv) {
  const t = Math.min(Math.max(zv / ALTO_MAPA, 0), 1) * (PASOS_MAPA.length - 1), i = Math.min(Math.floor(t), PASOS_MAPA.length - 2), f = t - i;
  return PASOS_MAPA[i].map((c, k) => c + f * (PASOS_MAPA[i + 1][k] - c));
}
// Mapa de ajuste al pie: diferencia entre la planta del pie (escaneo) y la cara de arriba de la plantilla.
// Azul = hueco (el pie queda por encima, la plantilla no lo toca), blanco = toca, rojo = la plantilla queda más
// alta que la planta del pie (en la copa es normal: envuelve el talón; en el arco o el antepié, presiona).
const PASOS_AJUSTE = [[0.86, 0.27, 0.2], [0.98, 0.97, 0.95], [0.2, 0.45, 0.85]];   // -3, 0, +6 mm
const AJUSTE_MIN = -3, AJUSTE_MAX = 6;
function colorAjuste(dz) {
  if (dz <= 0) { const f = Math.min(-dz / -AJUSTE_MIN, 1); return PASOS_AJUSTE[1].map((c, k) => c + f * (PASOS_AJUSTE[0][k] - c)); }
  const f = Math.min(dz / AJUSTE_MAX, 1); return PASOS_AJUSTE[1].map((c, k) => c + f * (PASOS_AJUSTE[2][k] - c));
}
let modoMapa = null;   // null, 'alturas' o 'ajuste'

// Lámina para ver el diseño (Base y Diseño, como LutraCAD, 2026-11-17): la misma cara de arriba y la de abajo
// paralela, al espesor del antepié; abajo en verde. Solo para ver: lo que se exporta es el sólido.
const COLOR_LAMINA = [0.36, 0.66, 0.1];
function lamina(g) {
  const esp = g.p?.antepie ?? 1.5, zb = new Float32Array(g.z.length);
  for (let q = 0; q < zb.length; q++) zb[q] = Math.max(0, g.z[q] - esp);
  return { ...g, zb, lamina: true };
}
// Malla para el visor: cara de arriba, cara de abajo y pared, con normales suaves en cada cara y canto marcado.
// `al` = escaneo alineado con este pie (para el mapa de ajuste).
function malla(g, ox, al) {
  const { ns, nr, x, y, z, zb } = g, n = ns * nr, base = 2 * n, nv = 2 * n + 2 * ns;
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
  for (let q = 0; q < n; q++) {
    pos[3 * q] = x[q] + ox; pos[3 * q + 1] = y[q]; pos[3 * q + 2] = z[q];
    pos[3 * (n + q)] = x[q] + ox; pos[3 * (n + q) + 1] = y[q]; pos[3 * (n + q) + 2] = zb[q];
  }
  for (let i = 0; i < ns; i++) {
    const q = i * nr;
    pos.set([x[q] + ox, y[q], z[q]], 3 * (base + i));
    pos.set([x[q] + ox, y[q], zb[q]], 3 * (base + ns + i));
  }
  const idx = new Uint32Array(ns * (nr - 1) * 12 + ns * 6);
  let t = 0;
  const tri = (a, b, c) => { idx[t++] = a; idx[t++] = b; idx[t++] = c; };
  for (let i = 0; i < ns; i++) {
    const j = (i + 1) % ns;
    for (let k = 0; k < nr - 1; k++) {
      const a = i * nr + k, b = j * nr + k, c = j * nr + k + 1, d = i * nr + k + 1;
      tri(a, b, c); tri(a, c, d);
      tri(n + a, n + b, n + c); tri(n + a, n + c, n + d);
    }
    tri(base + i, base + ns + i, base + ns + j); tri(base + i, base + ns + j, base + j);
  }
  for (let k = 0; k < idx.length; k += 3) {
    const a = 3 * idx[k], b = 3 * idx[k + 1], c = 3 * idx[k + 2];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const v of [a, b, c]) { nor[v] += nx; nor[v + 1] += ny; nor[v + 2] += nz; }
  }
  for (let v = 0; v < nor.length; v += 3) {
    const l = Math.hypot(nor[v], nor[v + 1], nor[v + 2]);
    if (l > 0) { nor[v] /= l; nor[v + 1] /= l; nor[v + 2] /= l; } else nor[v + 2] = 1;
  }
  // color: plantilla en blanco; cada elemento de un color liso con borde nítido, como LutraCAD (Ernesto,
  // 2026-11-13): turquesa, y el elegido en verde. El borde del elemento es donde sube ELEM_BORDE mm; el corte lo hace
  // el visor en cada píxel (col2 + marca), no los puntos de la malla.
  const col = new Float32Array(nv * 3), col2 = new Float32Array(nv * 3), marca = new Float32Array(nv);
  for (let q = 0; q < nv; q++) {
    if (modoMapa === 'alturas' && q < n) { col.set(colorMapa(z[q]), 3 * q); continue; }
    if (modoMapa === 'ajuste' && q < n && al) {
      const zp = al.altura(g.x[q], g.y[q]);
      // fuera del escaneo: el color de la plantilla
      col.set(zp == null ? COLOR_PLANTILLA : colorAjuste(zp - z[q]), 3 * q); continue;
    }
    col.set(COLOR_PLANTILLA, 3 * q);
  }
  if (g.lamina) for (let q = n; q < nv; q++) col.set(COLOR_LAMINA, 3 * q);
  if (!modoMapa && g.p.elementos?.length) {
    // en cada punto, el elemento que más sube
    const quien = new Int16Array(n).fill(-1);
    for (let q = 0; q < n; q++) {
      let mejor = 0;
      g.p.elementos.forEach((el, k) => { const a = g.aportes[k][q]; if (a > mejor) { mejor = a; quien[q] = k; } });
      marca[q] = mejor / (2 * ELEM_BORDE);
    }
    // descargas en naranja (hunden), elementos en turquesa (suben); el elegido en verde y su par en rojo
    const colorDe = k => (g.p.elementos[k].ref !== activo ? (g.p.elementos[k].forma?.descarga ? COLOR_DESCARGA : COLOR_ELEMENTO)
      : g.p.lado === activoPie ? COLOR_ELEGIDO : COLOR_PAR);
    for (let q = 0; q < n; q++) if (quien[q] >= 0) col2.set(colorDe(quien[q]), 3 * q);
    // los puntos de alrededor del elemento llevan su color: si no, el borde se mezclaría con negro
    for (let i = 0; i < ns; i++) for (let k = 0; k < nr; k++) {
      const q = i * nr + k; if (quien[q] >= 0) continue;
      for (let di = -1; di <= 1 && quien[q] < 0; di++) for (let dk = -1; dk <= 1; dk++) {
        const kk = k + dk; if (kk < 0 || kk >= nr) continue;
        const r = ((i + di + ns) % ns) * nr + kk;
        if (quien[r] >= 0) { col2.set(colorDe(quien[r]), 3 * q); break; }
      }
    }
  }
  return { pos, nor, idx, col, col2, marca };
}
const COLOR_DESCARGA = [0.9, 0.52, 0.18];
const COLOR_PLANTILLA = [0.95, 0.95, 0.94], COLOR_ELEMENTO = [0.2, 0.6, 0.68], COLOR_ELEGIDO = [0.05, 0.62, 0.12], COLOR_PAR = [0.86, 0.12, 0.1];
const ELEM_BORDE = 0.12;   // mm: desde ahí se pinta el elemento

// Contorno de la plantilla: una cinta fina verde oscuro por el borde de la cara de arriba (como LutraCAD), apenas
// levantada para que se vea sobre la superficie.
function contornoPlantilla(g, ox) {
  const { ns, nr, x, y, z } = g, ANCHO = 0.9, ALTO = 0.12;
  const pos = new Float32Array(ns * 6), nor = new Float32Array(ns * 6), idx = new Uint32Array(ns * 6), col = new Float32Array(ns * 6);
  for (let i = 0; i < ns; i++) {
    // hacia adentro por los anillos hasta ANCHO mm; la cinta va por encima del punto más alto de ese tramo (el canto
    // es redondeado y una cinta recta quedaría debajo de la superficie)
    const q0 = i * nr; let k = 1, zMax = z[q0], px = x[q0], py = y[q0];
    for (; k < nr - 1; k++) {
      const q = q0 + k; zMax = Math.max(zMax, z[q]);
      if (Math.hypot(x[q] - x[q0], y[q] - y[q0]) >= ANCHO) break;
    }
    const qa = q0 + k - 1, qb = q0 + k, da = Math.hypot(x[qa] - x[q0], y[qa] - y[q0]), db = Math.hypot(x[qb] - x[q0], y[qb] - y[q0]);
    const f = db > da ? Math.min(Math.max((ANCHO - da) / (db - da), 0), 1) : 1;
    px = x[qa] + (x[qb] - x[qa]) * f; py = y[qa] + (y[qb] - y[qa]) * f;
    zMax = Math.max(zMax, z[qa] + (z[qb] - z[qa]) * f) + ALTO;
    pos.set([x[q0] + ox, y[q0], zMax, px + ox, py, zMax], 6 * i);
    nor.set([0, 0, 1, 0, 0, 1], 6 * i); col.set([0.05, 0.38, 0.12, 0.05, 0.38, 0.12], 6 * i);
    const j = (i + 1) % ns;
    idx.set([2 * i, 2 * j, 2 * j + 1, 2 * i, 2 * j + 1, 2 * i + 1], 6 * i);
  }
  return { pos, nor, idx, col };
}

const f1 = v => v.toFixed(1).replace('.', ','), f2 = v => v.toFixed(2).replace('.', ',');
let primeraVez = true;

// en Exportar el diseño queda fijo: Medidas y alturas se ve pero no se edita
function bloquearMedidas() {
  pintarBotonesTipo();   // los botones siguen al tipo elegido (también al abrir una receta, deshacer o cambiar de horma)
  let fijo = false; try { fijo = fijoModulo(); } catch { /* al cargar, antes de que exista "modulo" */ }
  for (const id of ['largo', 'anchoAntepie', 'anchoTalon', 'copa', 'copaDer', 'antepie', 'antepieDer', 'tipoArco', 'anchoAuto', 'anchoTalonAuto',
                    'arcoPosAuto', 'canto', 'cantoDer'])
    $(id).disabled = fijo;
  document.querySelectorAll('#botonesArco button, #botonesTipo button').forEach(b => { b.disabled = fijo; });
  document.querySelectorAll('.medidas-alturas .candado').forEach(b => { b.disabled = fijo; });
  if (fijo) $('arco').disabled = $('arcoDer').disabled = $('arcoPos').disabled = $('arcoPosDer').disabled = true;
  else { pintarTipoArco(); $('arcoPos').disabled = $('arcoPosDer').disabled = $('arcoPosAuto').checked; }
}
// Auditoría 2026-11-16: antes solo se pedía que los valores fueran mayores que cero; un largo de 9999 mm o un arco de
// 500 mm (antepié en −13 mm) se generaban igual. Ahora cada casillero tiene que estar entre su mínimo y su máximo.
function valoresFuera() {
  const ids = ['largo', 'copa', 'antepie', 'canto'];
  // anchos (QA-02, 2026-11-18): solo los escritos a mano; en automático el número lo pone la plantilla
  if (!$('anchoAuto').checked) ids.push('anchoAntepie');
  if (!$('anchoTalonAuto').checked) ids.push('anchoTalon');
  if ($('tipoArco').value !== 'horma') ids.push('arco');
  if (!$('arcoPosAuto').checked) ids.push('arcoPos');
  const fuera = [];
  for (const id of ids) for (const s of ['', 'Der']) {
    const el = $(id + s); if (!el || (s && el.hidden)) continue;
    const v = parseFloat(el.value), lo = parseFloat(el.min), hi = parseFloat(el.max);
    if (!Number.isFinite(v) || v < lo || v > hi) {
      const nombre = el.closest('.fila')?.querySelector('label')?.firstChild?.textContent.trim() ?? id;
      fuera.push(`${nombre}${s ? ' der' : ''} (${String(lo).replace('.', ',')} a ${String(hi).replace('.', ',')})`);
    }
  }
  // correcciones (auditoría 2026-11-18: antes aceptaban 999 mm de arco medial sin avisar)
  for (const [id, nombre] of [['corrArcoIzq', 'Arco medial izq'], ['corrArcoDer', 'Arco medial der'], ['corrApiceIzq', 'Mover ápice izq'], ['corrApiceDer', 'Mover ápice der']]) {
    const el = $(id); if (!el) continue;
    const v = el.value === '' ? 0 : parseFloat(el.value), lo = parseFloat(el.min), hi = parseFloat(el.max);
    if (!Number.isFinite(v) || v < lo || v > hi) fuera.push(`${nombre} (${String(lo).replace('.', ',')} a ${String(hi).replace('.', ',')})`);
  }
  return fuera;
}
let ultimoAncho = null;   // anchos de la última plantilla generada: para pasar lo escrito a la escala sin acumular
function actualizar() {
  const d = diseno(), dd = { ...d, ...d.der };
  const fuera = valoresFuera();
  if (fuera.length) { estado.textContent = 'Revise: ' + fuera.join(', '); estado.title = estado.textContent; return; }
  estado.title = '';
  const t0 = performance.now();
  let r, m, mDer;
  // una receta o línea de corte rota no deja trabado el programa: se avisa y queda la plantilla anterior
  try { r = generarPies(d); m = medidas(r.izq);
    // el derecho se mide aparte también con su propia línea de corte (QA-02c, 2026-11-18: antes tomaba las del izquierdo)
    mDer = d.der || d.contorno?.puntosDer ? medidas(r.der) : m; }
  catch (err) { estado.textContent = 'No se pudo generar'; estado.title = err.message; mensaje('No se pudo generar la plantilla: ' + err.message, false); return; }
  if ($('anchoAuto').checked) $('ancho').value = (r.h.ancho * d.largo / r.h.largo).toFixed(1);
  // G-code de la fresadora solo para EVA (sin acabado de resina: base plana)
  { const eva = !producto().acabado; $('exportarGcode').hidden = !eva; pintarModuloProduccion(); }
  // arco subido solo por la copa (ver generarPies): se avisa al lado del alto de arco
  { const sube = d.arco != null && d.copa != null && d.arco < d.copa + DIF_ARCO_COPA, av = $('avisoArcoSube');
    av.hidden = !sube; if (sube) av.textContent = `Con copa ${String(d.copa).replace('.', ',')} el arco sube solo a ${String(+(d.copa + DIF_ARCO_COPA).toFixed(1)).replace('.', ',')} mm (siempre ${DIF_ARCO_COPA} mm sobre la copa, para que no se aplane).`; }
  ultimoAncho = { ancho: num('ancho'), antepie: m.anchoAntepie, escala: d.escalaTalon ?? 1, talon: m.anchoTalon };
  // el talón no escala parejo (pasa suave al antepié): con un ancho escrito se afina una vez más hasta ±0,2 mm
  if (talonPedido && escalaTalon && Math.abs(m.anchoTalon - talonPedido) > 0.2) {
    const nueva = Math.min(Math.max(escalaTalon * talonPedido / m.anchoTalon, 0.6), 1.5);
    if (Math.abs(nueva - escalaTalon) > 1e-4) { escalaTalon = nueva; pedir(); }
    else talonPedido = null;
  } else talonPedido = null;
  if ($('tipoArco').value === 'horma') { $('arco').value = r.izq.p.arco.toFixed(1); $('arcoDer').value = r.der.p.arco.toFixed(1); }
  if ($('arcoPosAuto').checked) $('arcoPos').value = $('arcoPosDer').value = Math.round(arcoPosDefecto() * 100);
  $('arcoPos').disabled = $('arcoPosDer').disabled = $('arcoPosAuto').checked;
  // Medidas y alturas (Ernesto, 2026-11-16): los anchos se muestran como quedan en la plantilla (pie izquierdo);
  // mientras se escribe en el casillero no se pisa
  if (document.activeElement !== $('anchoAntepie')) $('anchoAntepie').value = m.anchoAntepie.toFixed(1);
  if (document.activeElement !== $('anchoTalon')) $('anchoTalon').value = m.anchoTalon.toFixed(1);
  bloquearMedidas();
  const dos = (f, k) => d.der ? `${f(m[k])} / ${f(mDer[k])}` : f(m[k]);
  // resumen en el título de cada sección (se ve cuando está cerrada)
  const tallaElegida = tallas.find(t => t.talla === $('talla').value);
  resumenSeccion('Paciente', d.paciente);
  resumenSeccion('Plantilla', `${conGuia() ? (tallaElegida?.corta ?? 'guía') : 'muestra/escaneo'} · ${nombreTipo(d.tipoDiseno)}`);
  resumenSeccion('Medidas y alturas', `${f1(m.largo)} mm · copa ${dos(f1, 'copa')} · arco ${dos(f1, 'arco')}`);
  resumenSeccion('Escaneo del pie', [escaneos.izq && 'izq', escaneos.der && 'der'].filter(Boolean).join(' y ') || 'sin escaneo');
  resumenSeccion('Muestra 2D', muestra ? muestra.nombre : 'sin muestra');
  resumenSeccion('Elementos', d.elementos.length ? `${d.elementos.length} elemento${d.elementos.length > 1 ? 's' : ''}` : 'sin elementos');
  actual = { d, ...r, m, mDer };

  const avisos = [];
  if (d.largo < LARGO_MIN || d.largo > LARGO_MAX + margenPulido()) avisos.push(`El largo está fuera de los cuadros de tallas (${LARGO_MIN} a ${LARGO_MAX + margenPulido()} mm).`);
  if (m.espesor < 1) avisos.push(`Hay zonas de ${f2(m.espesor)} mm: muy finas para imprimir.`);
  if (Math.min(d.antepie, dd.antepie) < 1.2) avisos.push('El antepié es menor a 1,2 mm.');
  if (m.arco <= d.copa) avisos.push(`El arco quedó igual o más bajo que la copa${d.der ? ' (izq)' : ''}.`);
  if (d.der && mDer.arco <= dd.copa) avisos.push('El arco quedó igual o más bajo que la copa (der).');
  for (const e of d.elementos) for (const pie of ['izq', 'der'])
    if (e[pie] > 10) avisos.push(`${nombreElemento(e.id)} (${pie}): ${f1(e[pie])} mm es muy alto, revise.`);
  // elemento corrido fuera de la plantilla: en ningún punto llega al 70 % de su altura
  for (const pie of ['izq', 'der']) {
    const g = r[pie];
    g.p.elementos?.forEach((el, k) => {
      let max = 0; for (const a of g.aportes[k]) if (a > max) max = a;
      // descarga: cuánto hundió de verdad (el espesor mínimo de 1 mm la puede frenar)
      if (el.forma?.descarga && max >= 0.7 * el.altura) {
        let hondo = 0; const ap = g.aportes[k];
        for (let q = 0; q < ap.length; q++) if (ap[q] > 0.5 * max) hondo = Math.max(hondo, -g.he[q]);
        if (hondo < el.altura - 0.3)
          avisos.push(`${nombreElemento(d.elementos[el.ref].id)} (${pie}): el espesor solo deja hundir ${f1(hondo)} de ${f1(el.altura)} mm (la plantilla no queda más fina que 1 mm).`);
      }
      if (el.altura > 0 && max < 0.7 * el.altura)
        avisos.push(`${nombreElemento(d.elementos[el.ref].id)} (${pie}): quedó fuera de la plantilla o pegado al borde (llega a ${f1(max)} de ${f1(el.altura)} mm).`);
    });
  }
  // con escaneo: la plantilla mucho más chica que el pie, o pies muy distintos entre sí
  const conEscaneo = [escaneos.izq, escaneos.der].filter(Boolean);
  if (conEscaneo.length) {
    const largoPie = Math.max(...conEscaneo.map(e => e.m.largo)), anchoPie = Math.max(...conEscaneo.map(e => e.m.anchoAntepie));
    if (m.largo < largoPie - 5) avisos.push(`La plantilla es ${f1(largoPie - m.largo)} mm más corta que el pie del escaneo.`);
    if (m.anchoAntepie < anchoPie - 6) avisos.push(`La plantilla es ${f1(anchoPie - m.anchoAntepie)} mm más angosta que el antepié del escaneo.`);
    if (escaneos.izq && escaneos.der && Math.abs(escaneos.izq.m.largo - escaneos.der.m.largo) > 6)
      avisos.push(`Los pies del escaneo miden distinto: izquierdo ${f1(escaneos.izq.m.largo)} mm, derecho ${f1(escaneos.der.m.largo)} mm.`);
  }
  if (!d.paciente) avisos.push('Falta el nombre del paciente (se usa en el nombre de los archivos).');
  resumenSeccion('Revisión', avisos.length ? `${avisos.length} aviso${avisos.length > 1 ? 's' : ''}` : 'sin observaciones');
  $('avisos').innerHTML = avisos.length ? avisos.map(a => `<li>${esc(a)}</li>`).join('') : '<li class="sinavisos" style="background:none;border:0;padding:0">Sin observaciones.</li>';

  if (visor) {
    const sep = m.anchoAntepie / 2 + 14, lista = [];
    enVista = [];
    if (pies !== 'der') enVista.push({ pie: 'izq', g: r.izq, ox: pies === 'ambos' ? -sep : 0 });
    if (pies !== 'izq') enVista.push({ pie: 'der', g: r.der, ox: pies === 'ambos' ? sep : 0 });
    for (const v of enVista) {
      v.al = v.g.al ?? (escaneos[v.pie] ? alinearEscaneo(escaneos[v.pie], v.g, v.g.p.antepie) : null);
      // en Base y Diseño, lámina de espesor parejo (como LutraCAD); en EVA/Imprimir y Exportar, el sólido real
      let lam = false; try { lam = enLamina(); } catch { /* al cargar, antes de que existan los módulos */ }
      lista.push(malla(lam ? lamina(v.g) : v.g, v.ox, v.al), contornoPlantilla(v.g, v.ox));
      // con el mapa de ajuste el escaneo no se dibuja: taparía los colores
      if (v.al && $('verEscaneo').checked && modoMapa !== 'ajuste') lista.push(escaneoSobre(v.al, v.ox));
    }
    visor.poner(lista);
    if (primeraVez || cambioPies) {
      const w = pies === 'ambos' ? 2 * sep + m.anchoAntepie : m.anchoAntepie;
      visor.encuadrar([-w / 2, 0, 0, w / 2, m.largo, m.arco]);
      primeraVez = false; cambioPies = false;
    }
  }
  estado.textContent = `Listo · ${Math.round(performance.now() - t0)} ms`;
  if (corte) dibujarCorte();   // el corte sigue al diseño mientras se ajusta
  registrarHistorial();
}

// ---- Escaneo del pie (STL del Podoscan que llega de Baro a la carpeta del paciente) ----
// Se guarda ya orientado (talón en y = 0, dedos hacia +Y, apoyo en z = 0). Para verlo se alinea con cada
// plantilla: el talón con el talón, y el eje talón → antepié del pie con el de la plantilla. El pie se apoya
// sobre el antepié de la plantilla, así se ve dónde el arco del pie queda por encima o por debajo.
const escaneos = { izq: null, der: null };
function centroPlantilla(g, f) {
  let y1 = 0; for (let q = 0; q < g.y.length; q++) y1 = Math.max(y1, g.y[q]);
  let lo = Infinity, hi = -Infinity;
  for (let q = 0; q < g.y.length; q++) if (Math.abs(g.y[q] / y1 - f) < 0.03) { lo = Math.min(lo, g.x[q]); hi = Math.max(hi, g.x[q]); }
  return [(lo + hi) / 2, f * y1];
}
// Escaneo puesto sobre una plantilla (sin el corrimiento ox de la vista): puntos, normales y una grilla de alturas
// de la planta del pie cada 1,5 mm, para comparar con la plantilla punto por punto.
function alinearEscaneo(es, g, apoyo) {
  const m = es.m, S1 = [m.centro(0.15), 0.15 * m.largo], S2 = [m.centro(0.7), 0.7 * m.largo];
  const I1 = centroPlantilla(g, 0.15), I2 = centroPlantilla(g, 0.7);
  const giro = Math.atan2(I2[0] - I1[0], I2[1] - I1[1]) - Math.atan2(S2[0] - S1[0], S2[1] - S1[1]);
  const c = Math.cos(giro), s = Math.sin(giro), { pos, nor, idx } = es.malla;
  const P = new Float32Array(pos.length), N = new Float32Array(nor.length);
  for (let i = 0; i < pos.length; i += 3) {
    const a = pos[i] - S1[0], b = pos[i + 1] - S1[1];
    P[i] = a * c + b * s + I1[0]; P[i + 1] = -a * s + b * c + S1[1]; P[i + 2] = pos[i + 2] + apoyo;
    N[i] = nor[i] * c + nor[i + 1] * s; N[i + 1] = -nor[i] * s + nor[i + 1] * c; N[i + 2] = nor[i + 2];
  }
  // grilla: en cada celda, lo más bajo del escaneo (la planta), por triángulos
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < P.length; i += 3) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); }
  const paso = 1.5, nx = Math.ceil((x1 - x0) / paso) + 1, ny = Math.ceil((y1 - y0) / paso) + 1, G = new Float32Array(nx * ny).fill(Infinity);
  for (let k = 0; k < idx.length; k += 3) {
    const A = 3 * idx[k], B = 3 * idx[k + 1], C = 3 * idx[k + 2];
    const ia = Math.floor((Math.min(P[A], P[B], P[C]) - x0) / paso), ib = Math.ceil((Math.max(P[A], P[B], P[C]) - x0) / paso);
    const ja = Math.floor((Math.min(P[A + 1], P[B + 1], P[C + 1]) - y0) / paso), jb = Math.ceil((Math.max(P[A + 1], P[B + 1], P[C + 1]) - y0) / paso);
    const den = (P[B + 1] - P[C + 1]) * (P[A] - P[C]) + (P[C] - P[B]) * (P[A + 1] - P[C + 1]);
    if (Math.abs(den) < 1e-9) continue;
    for (let i = ia; i <= ib; i++) for (let j = ja; j <= jb; j++) {
      const px = x0 + i * paso, py = y0 + j * paso;
      const w0 = ((P[B + 1] - P[C + 1]) * (px - P[C]) + (P[C] - P[B]) * (py - P[C + 1])) / den;
      const w1 = ((P[C + 1] - P[A + 1]) * (px - P[C]) + (P[A] - P[C]) * (py - P[C + 1])) / den, w2 = 1 - w0 - w1;
      if (w0 < -1e-4 || w1 < -1e-4 || w2 < -1e-4 || i < 0 || j < 0 || i >= nx || j >= ny) continue;
      const z = w0 * P[A + 2] + w1 * P[B + 2] + w2 * P[C + 2], q = j * nx + i;
      if (z < G[q]) G[q] = z;
    }
  }
  // altura de la planta del pie en (x, y), o null fuera del escaneo
  const altura = (x, y) => {
    const fi = (x - x0) / paso, fj = (y - y0) / paso, i = Math.floor(fi), j = Math.floor(fj);
    if (i < 0 || j < 0 || i >= nx - 1 || j >= ny - 1) return null;
    const v = [G[j * nx + i], G[j * nx + i + 1], G[(j + 1) * nx + i], G[(j + 1) * nx + i + 1]];
    const tx = fi - i, ty = fj - j, w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty];
    // en el borde del escaneo faltan esquinas: promedio pesado de las que hay (sin escalones)
    let s = 0, sw = 0; for (let k = 0; k < 4; k++) if (isFinite(v[k])) { s += w[k] * v[k]; sw += w[k]; }
    return sw > 0.15 ? s / sw : null;
  };
  return { P, N, idx, altura };
}
function escaneoSobre(al, ox) {
  const P = new Float32Array(al.P);
  if (ox) for (let i = 0; i < P.length; i += 3) P[i] += ox;
  const col = new Float32Array(P.length);
  for (let i = 0; i < col.length; i += 3) col.set([0.3, 0.52, 0.88], i);
  return { pos: P, nor: al.N, idx: al.idx, col, alfa: 0.72 };
}
function pintarEscaneo() {
  $('filaContacto').hidden = !(escaneos.izq || escaneos.der);
  const filas = [];
  for (const pie of ['izq', 'der']) {
    const e = escaneos[pie]; if (!e) continue;
    const t = pie === 'izq' ? 'Izq' : 'Der';
    filas.push([`${t}: archivo`, e.nombre], [`${t}: largo del pie`, f1(e.m.largo) + ' mm'],
               [`${t}: ancho antepié`, f1(e.m.anchoAntepie) + ' mm'], [`${t}: ancho talón`, f1(e.m.anchoTalon) + ' mm'],
               [`${t}: arco del pie`, `a ${Math.round(e.m.arcoPos * 100)} % del talón`]);
  }
  const s = sugerenciaEscaneo();
  if (s) filas.push(['Sugerido', `${f1(s.largo)} × ${f1(s.ancho)} mm, arco al ${s.arcoPos} % (cerca de ${s.talla.corta})`]);
  $('medidasEscaneo').innerHTML = filas.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('');
  $('aplicarEscaneo').hidden = !s;
}
// Largo y ancho que salen del escaneo: la plantilla mide igual que el pie (Ernesto, 2026-11-11), con el pie más
// grande de los dos para que el par salga igual. Se pueden cambiar a mano después; el escaneo no los vuelve a
// pisar salvo con el botón "Volver a usar…". `talla` = la de la tabla más cercana, solo como referencia.
const MARGEN_LARGO = 0;   // mm que se suman al largo del pie
function sugerenciaEscaneo() {
  const lista = [escaneos.izq, escaneos.der].filter(Boolean); if (!lista.length) return null;
  const largo = Math.round((Math.max(...lista.map(e => e.m.largo)) + MARGEN_LARGO) * 2) / 2;
  const ancho = Math.round(Math.max(...lista.map(e => e.m.anchoAntepie)) * 2) / 2;
  const talla = tallaCercana(largo);
  // ubicación del arco: el promedio de los dos pies (la plantilla del par la comparte), de 28 a 52 %
  const arcoPos = Math.min(52, Math.max(28, Math.round(100 * lista.reduce((a, e) => a + e.m.arcoPos, 0) / lista.length)));
  return { talla, ancho, largo, arcoPos };
}
function aplicarEscaneo() {
  const s = sugerenciaEscaneo(); if (!s) return;
  ponerMedidaDesde('muestra');   // usar las medidas del pie es trabajar con el escaneo, no con la guía de tallas
  $('largo').value = s.largo; $('talla').value = tallaDeLargo(s.largo); pintarNotaLargo();
  escalaTalon = null; talonPedido = null; $('anchoTalonAuto').checked = true; $('anchoAuto').checked = false; $('ancho').value = s.ancho;
  // la cima del arco queda al 35 % (como LutraCAD); dónde está el arco del pie se muestra como dato
  $('arcoPosAuto').checked = true;
  mensaje(`Del escaneo: largo ${f1(s.largo)} mm y ancho ${f1(s.ancho)} mm, como el pie (cerca de ${s.talla.corta}). El arco del pie está al ${s.arcoPos} % del talón; la plantilla lo pone al ${Math.round(arcoPosDefecto() * 100)} % (se cambia en "Alturas").`);
  pedir();
}
$('abrirEscaneo').addEventListener('click', () => $('archivoEscaneo').click());
$('verEscaneo').addEventListener('change', pedir);
// Abre los STL del escaneo (uno o los dos pies). `aplicar` = poner largo, ancho y arco del escaneo.
async function cargarEscaneos(archivos, aplicar = true) {
  const avisos = [];
  for (const f of archivos) {
    try {
      const t = orientar(leerSTL(await f.arrayBuffer())), m = medirEscaneo(t);
      // el lado sale del nombre (IZ / DC); si no lo dice, de dónde sube el arco
      const lado = ladoPorNombre(f.name) ?? (m.internoHaciaMasX ? 'izq' : 'der');
      if ((lado === 'izq') !== m.internoHaciaMasX) avisos.push(`${f.name}: el arco no está del lado que dice el nombre, revise.`);
      escaneos[lado] = { nombre: f.name, t, m, malla: mallaEscaneo(t) };
    } catch (e) { avisos.push(`${f.name}: ${e.message}`); }
  }
  pintarEscaneo();
  document.querySelector('[data-herr=ajuste]').hidden = !(escaneos.izq || escaneos.der);
  abrirSeccion('Escaneo del pie');
  if (avisos.length) { mensaje(avisos.join(' '), false); pedir(); }
  // con guía de tallas el escaneo no cambia el largo ni el ancho (sirve para el arco y para comparar)
  else if (aplicar && conGuia()) {
    const s = sugerenciaEscaneo();
    mensaje(`Escaneo abierto. Se trabaja con guía de tallas: el largo queda en ${num('largo')} mm (el pie mide ${f1(s.largo)} mm, cerca de ${s.talla.corta}). Para usar el largo del pie: "Usar las medidas del escaneo".`);
    pedir();
  } else if (aplicar) aplicarEscaneo(); else pedir();
}
$('archivoEscaneo').addEventListener('change', async ev => { await cargarEscaneos([...ev.target.files]); ev.target.value = ''; });
$('aplicarEscaneo').addEventListener('click', aplicarEscaneo);

// ---- Muestra 2D (PNG con regla de 100 mm, de muestra_a_png.ps1) ----
// Se dibuja debajo de la plantilla en la vista de arriba, alineada como el escaneo (talón con talón y el eje
// talón → antepié con el de la plantilla). Se puede correr y girar a mano. En el otro pie va en espejo.
let muestra = null, muestrasCarpeta = [];
// Lee una muestra: PNG con su escala (nombre _<dpi>dpi o resolución guardada) o el PDF del escáner tal cual.
async function leerMuestra(f) {
  const buf = await f.arrayBuffer();
  let bmp, ppmm;
  if (/\.pdf$/i.test(f.name)) ({ bmp, ppmm } = await imagenDePDF(buf));
  else {
    ppmm = escalaPNG(buf, f.name);
    if (!ppmm) throw new Error('no se sabe la escala de la imagen (use el PDF del escáner o un PNG que termine en _<dpi>dpi.png)');
    bmp = await createImageBitmap(new Blob([buf]));
  }
  const cv = document.createElement('canvas'); cv.width = bmp.width; cv.height = bmp.height;
  const c = cv.getContext('2d', { willReadFrequently: true }); c.drawImage(bmp, 0, 0);
  const a = analizarMuestra(c.getImageData(0, 0, bmp.width, bmp.height), ppmm);
  // contorno encontrado, en píxeles de la imagen (para dibujarlo en rojo encima de la muestra)
  const o = a.aOrientado(0, 0), ex = a.aOrientado(1, 0), ey = a.aOrientado(0, 1);
  const A = [ex[0] - o[0], ey[0] - o[0], ex[1] - o[1], ey[1] - o[1]], det = A[0] * A[3] - A[1] * A[2], esp = a.lado === 'der' ? -1 : 1;
  const contornoPx = a.contorno.filter((_, i) => i % 3 === 0).map(([x, y]) => {
    const X = esp * x - o[0], Y = y - o[1]; return [(A[3] * X - A[1] * Y) / det, (-A[2] * X + A[0] * Y) / det];
  });
  // dudosa: el trazo tenía huecos grandes o es lápiz gris; conviene mirar el contorno rojo antes de usarla
  return { nombre: f.name, bmp, a, ppmm, contornoPx, dudosa: a.cierre >= 6 || a.tinta === 'gris' };
}
function ponerMuestra(m) {
  muestra = m; const a = m.a;
  abrirSeccion('Muestra 2D');
  for (const id of ['muestraX', 'muestraY', 'muestraGiro']) $(id).value = 0;
  $('muestraLado').value = a.lado;
  $('datosMuestra').hidden = false;
  $('medidasMuestra').innerHTML = [['Archivo', m.nombre], ['Largo', f1(a.largo) + ' mm'], ['Ancho antepié', f1(a.ancho) + ' mm'],
    ['Ancho talón', f1(a.anchoTalon) + ' mm'], ['Escala', `${Math.round(m.ppmm * 25.4)} dpi`]]
    .map(([x, y]) => `<tr><td>${esc(x)}</td><td>${esc(y)}</td></tr>`).join('');
  $('avisoMuestra').hidden = !m.dudosa && !a.ladoDudoso;
  $('avisoMuestra').textContent = [m.dudosa ? 'Trazo muy cortado o a lápiz: revise en la vista Arriba que la línea roja siga la muestra antes de usar su forma.' : '',
    a.ladoDudoso ? 'No está claro de qué pie es la muestra: revise "Pie de la muestra".' : ''].filter(Boolean).join(' ');
  visor?.pedir();
}
async function cargarMuestra(f) {
  try {
    const m = await leerMuestra(f); ponerMuestra(m); muestrasCarpeta = [m]; pintarListaMuestras();
    mensaje(`Muestra abierta: ${f1(m.a.largo)} × ${f1(m.a.ancho)} mm, pie ${m.a.lado === 'izq' ? 'izquierdo' : 'derecho'}. Se ve en la vista Arriba (tecla 2). ` +
      `"Plantilla con la forma de la muestra" copia su contorno.`, !m.dudosa);
  } catch (e) { mensaje(`${f.name}: ${e.message}`, false); }
}
function pintarListaMuestras() {
  $('filaListaMuestras').hidden = muestrasCarpeta.length < 2;
  $('listaMuestras').innerHTML = muestrasCarpeta.map((m, i) =>
    `<option value="${i}"${m === muestra ? ' selected' : ''}>${esc(m.nombre.replace(/\.(pdf|png)$/i, ''))} (${f1(m.a.largo)} mm)</option>`).join('');
}
$('listaMuestras').addEventListener('change', () => {
  const m = muestrasCarpeta[+$('listaMuestras').value]; if (!m) return;
  ponerMuestra(m);
  if (contornoActual) usarContornoMuestra(true);
  mensaje(`Muestra: ${m.nombre}.`);
});

// ---- Abrir la carpeta del paciente (la que llena Baro: escaneos del Podoscan y muestras escaneadas) ----
// El nombre del paciente sale de la carpeta ("Nombre Apellido-DNI"). Se cargan los dos escaneos y todas las
// muestras que se puedan leer (PDF del escáner o PNG); los reportes, recetas e incidencias no se miran.
const NO_ES_MUESTRA = /reporte|incidencia|receta|rmn|lesi[oó]n|orden|factura|boleta|solucion/i;
async function abrirCarpeta(archivos) {
  const ruta = f => f.webkitRelativePath || f.name, carpeta = ruta(archivos[0]).split('/')[0];
  const directos = archivos.filter(f => ruta(f).split('/').length <= 2);   // sin entrar a subcarpetas
  // sin proyecto: paciente nuevo, se empieza de cero (deshacer lo devuelve). Con un proyecto abierto solo se cargan
  // el escaneo y las muestras: el diseño guardado se conserva (así se retoma un proyecto)
  const conProyecto = !!inicio?.proyecto();
  if (!conProyecto || !$('paciente').value.trim()) $('paciente').value = carpeta.replace(/\s*-\s*\d{6,}\s*$/, '').trim();
  if (conProyecto) { escaneos.izq = null; escaneos.der = null; muestra = null; muestrasCarpeta = []; $('datosMuestra').hidden = true; pintarListaMuestras(); }
  else limpiarPaciente();
  mensaje(`Abriendo la carpeta de ${$('paciente').value}…`);
  const stl = directos.filter(f => /\.stl$/i.test(f.name) && ladoPorNombre(f.name));
  if (stl.length) await cargarEscaneos(stl, true); else { pintarEscaneo(); pedir(); }
  const cand = directos.filter(f => /\.(pdf|png)$/i.test(f.name) && !NO_ES_MUESTRA.test(f.name) && f.size < 8e6);
  for (const f of cand) { try { muestrasCarpeta.push(await leerMuestra(f)); } catch { /* no es una muestra escaneada */ } }
  if (muestrasCarpeta.length) ponerMuestra(muestrasCarpeta[0]);
  pintarListaMuestras();
  const partes = [`${$('paciente').value}`,
    stl.length ? `escaneo ${stl.map(f => f.name).join(' y ')}` : 'sin escaneo del Podoscan',
    muestrasCarpeta.length ? `${muestrasCarpeta.length} muestra${muestrasCarpeta.length > 1 ? 's' : ''} (${muestrasCarpeta.map(m => m.nombre).join(', ')})` : 'sin muestras escaneadas'];
  mensaje(partes.join(' · ') + '.' + (muestrasCarpeta.length > 1 ? ' Elija la muestra en "Muestra 2D".' : ''), true);
}
$('abrirCarpeta').addEventListener('click', () => $('archivoCarpeta').click());
$('archivoCarpeta').addEventListener('change', async ev => {
  const fs = [...ev.target.files]; ev.target.value = '';
  if (fs.length) await abrirCarpeta(fs);
});
// pie de la muestra: lo reconoce el programa por la curva del arco; si se equivoca, se cambia a mano
const ladoMuestra = () => $('muestraLado').value || muestra?.a.lado;
$('muestraBorde').addEventListener('change', () => {
  if (contornoActual && muestra && contornoActual.archivo === muestra.nombre) usarContornoMuestra(true);
});
$('muestraLado').addEventListener('change', () => {
  // si la plantilla ya tiene la forma de esta muestra, se vuelve a tomar con el lado nuevo
  if (contornoActual && muestra && contornoActual.archivo === muestra.nombre) usarContornoMuestra(true); else visor?.pedir();
});

// Plantilla con la forma de la muestra: el borde es el contorno de la muestra (solo se suaviza el temblor del
// trazo) y la copa, el arco y el antepié son los de la horma del producto, repartidos en ese contorno. El largo
// y el ancho quedan iguales a la muestra (se pueden cambiar: la forma se estira).
function usarContornoMuestra(silencio) {
  if (!muestra) return;
  const esp = ladoMuestra() === muestra.a.lado ? 1 : -1;   // el contorno viene como pie izquierdo
  const borde = $('muestraBorde').value;
  const limpio = contornoProlijo(muestra.a.contorno.map(([x, y]) => [esp * x, y]), borde);
  contornoActual = { archivo: muestra.nombre, borde, puntos: contornoParaReceta(limpio) };
  const h = hormaDe(hormaId(), contornoActual), largo = Math.round(h.largo * 10) / 10, ancho = Math.round(h.ancho * 10) / 10;
  ponerMedidaDesde('muestra');
  $('largo').value = largo; $('talla').value = tallaDeLargo(largo); pintarNotaLargo();
  escalaTalon = null; talonPedido = null; $('anchoTalonAuto').checked = true; $('anchoAuto').checked = false; $('ancho').value = ancho;
  pintarContorno();
  if (!silencio) mensaje(`Plantilla con la forma de la muestra: largo ${f1(largo)} mm, ancho ${f1(ancho)} mm. La copa, el arco y el antepié son los del producto.`);
  pedir();
}
function pintarContorno() {
  $('estadoContorno').hidden = !contornoActual && !alturaBordeActual;
  $('nombreContorno').textContent = [contornoActual && contornoActual.archivo +
    ({ fiel: ' (fiel al trazo)', prolijo: ' (borde prolijo)', muy: ' (borde muy prolijo)' }[contornoActual.borde] ?? ''),
    alturaBordeActual && 'altura del borde editada'].filter(Boolean).join(' + ');
}
$('contornoMuestra').addEventListener('click', () => usarContornoMuestra(false));
$('quitarContorno').addEventListener('click', () => {
  contornoActual = null; alturaBordeActual = null; pintarContorno();
  mensaje('La plantilla vuelve a la forma de la horma del producto (el largo y el ancho no cambian).'); pedir();
});
$('abrirMuestra').addEventListener('click', () => $('archivoMuestra').click());
$('archivoMuestra').addEventListener('change', async ev => { if (ev.target.files[0]) await cargarMuestra(ev.target.files[0]); ev.target.value = ''; });
for (const id of ['muestraX', 'muestraY', 'muestraGiro']) $(id).addEventListener('input', () => visor?.pedir());
for (const id of ['verMuestra', 'muestraEspejo']) $(id).addEventListener('change', () => { pintarVerMuestra(); visor?.pedir(); });
// botón "👁 Muestra" en la barra de vistas (Ernesto, 2026-11-13): ocultar o mostrar la muestra sin bajar a la sección;
// va junto con la casilla "Mostrar debajo" y solo aparece cuando hay una muestra abierta
function pintarVerMuestra() {
  const b = $('verMuestraBarra'), si = $('verMuestra').checked;
  b.hidden = !muestra; b.classList.toggle('activo', si); b.setAttribute('aria-pressed', String(si));
}
$('verMuestraBarra').addEventListener('click', () => {
  $('verMuestra').checked = !$('verMuestra').checked; pintarVerMuestra(); visor?.pedir();
});
$('aplicarMuestra').addEventListener('click', () => {
  if (!muestra) return;
  const largo = Math.round(muestra.a.largo * 2) / 2, ancho = Math.round(muestra.a.ancho * 2) / 2;
  ponerMedidaDesde('muestra');
  $('largo').value = largo; $('talla').value = tallaDeLargo(largo); pintarNotaLargo();
  escalaTalon = null; talonPedido = null; $('anchoTalonAuto').checked = true; $('anchoAuto').checked = false; $('ancho').value = ancho;
  mensaje(`De la muestra: largo ${f1(largo)} mm y ancho ${f1(ancho)} mm.`); pedir();
});
function dibujarMuestra() {
  const cv = $('lienzoMuestra'), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const c = cv.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
  if ($('verMuestraBarra').hidden === !!muestra) pintarVerMuestra();   // se abrió o se cerró una muestra
  // solo mirando desde arriba: la imagen es plana y en otras vistas no coincidiría
  if (!muestra || !$('verMuestra').checked || !visor || visor.camara().elev < 70) return;
  const a = muestra.a, W = muestra.bmp.width, H = muestra.bmp.height;
  // con el lado cambiado a mano, la imagen se dibuja en espejo respecto de lo que se reconoció
  const voltear = ladoMuestra() !== a.lado;
  for (const v of enVista) {
    const espejo = (v.pie !== a.lado) !== voltear;
    if (espejo && !$('muestraEspejo').checked) continue;
    const sx = espejo ? -1 : 1, S1 = [sx * a.centro(0.15), 0.15 * a.largo], S2 = [sx * a.centro(0.7), 0.7 * a.largo];
    const I1 = centroPlantilla(v.g, 0.15), I2 = centroPlantilla(v.g, 0.7);
    // correr y girar a mano: positivo = hacia el lado interno de cada pie (en el derecho es hacia -X)
    const haciaInterno = v.pie === 'izq' ? 1 : -1;
    const giro = Math.atan2(I2[0] - I1[0], I2[1] - I1[1]) - Math.atan2(S2[0] - S1[0], S2[1] - S1[1]) + haciaInterno * (num('muestraGiro') || 0) * Math.PI / 180;
    const cg = Math.cos(giro), sg = Math.sin(giro), dx = haciaInterno * (num('muestraX') || 0), dy = num('muestraY') || 0;
    const aMundo = (px, py) => {
      const [x0, y0] = a.aOrientado(px, py), x = sx * x0 - S1[0], y = y0 - S1[1];
      return [x * cg + y * sg + I1[0] + v.ox + dx, -x * sg + y * cg + S1[1] + dy, 0];
    };
    const p0 = visor.proyectar(aMundo(0, 0)), p1 = visor.proyectar(aMundo(W, 0)), p2 = visor.proyectar(aMundo(0, H));
    if (!p0 || !p1 || !p2) continue;
    c.setTransform(dpr * (p1.x - p0.x) / W, dpr * (p1.y - p0.y) / W, dpr * (p2.x - p0.x) / H, dpr * (p2.y - p0.y) / H, dpr * p0.x, dpr * p0.y);
    c.globalAlpha = 0.9; c.drawImage(muestra.bmp, 0, 0); c.globalAlpha = 1;
    // el contorno que encontró el programa, en rojo fino (para ver si siguió bien el trazo)
    if (muestra.contornoPx?.length) {
      c.strokeStyle = 'rgba(220,30,30,0.85)'; c.lineWidth = muestra.ppmm * 0.5; c.beginPath();
      muestra.contornoPx.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.stroke();
    }
  }
}

let espera = null, cambioPies = false;
function pedir() { clearTimeout(espera); espera = setTimeout(() => { espera = null; actualizar(); }, 50); }

// ---- Medir alturas ----
// Cada medida guarda el pie y el punto (x, y) en ese pie; la altura se vuelve a leer en cada cambio del diseño,
// así el número sigue a la cuña mientras se ajusta.
let enVista = [], medidasTomadas = [], midiendo = false, cortando = false, corte = null;
// Regla (Ernesto, 2026-11-13): dos clics = distancia entre esos puntos. Los puntos van en coordenadas del visor
// (sobre la plantilla o, si el clic no la toca, sobre el piso, donde está la muestra).
let reglando = false, reglas = [], cursorRegla = null;
// Punto de la regla en un píxel. Con Mayús (como en LutraCAD) la línea queda recta en la vista que se mira:
// horizontal o vertical en la pantalla desde el primer punto, la que esté más cerca del ratón.
function rectaRegla(px, py, recta) {
  const ult = reglas[reglas.length - 1], A = ult && !ult.b ? visor.proyectar(ult.a) : null;
  if (recta && A) { if (Math.abs(px - A.x) >= Math.abs(py - A.y)) py = A.y; else px = A.x; }
  return [px, py];
}
function puntoRegla(px, py, recta) {
  [px, py] = rectaRegla(px, py, recta);
  const p = puntoDelClic(px, py);
  if (p) return [p.x + enVista.find(e => e.pie === p.pie).ox, p.y, p.z];
  // fuera de la plantilla: el punto del piso (z = 0)
  const { o, d } = visor.rayo(px, py); if (Math.abs(d[2]) < 1e-9) return null;
  const t = -o[2] / d[2]; return t > 0 ? [o[0] + t * d[0], o[1] + t * d[1], 0] : null;
}

// Punto de la cara de arriba en (x, y) de un pie: altura, base y lo que suman los elementos.
function leerPunto(g, px, py) {
  const { ns, nr, x, y, z, zb, he } = g;
  for (let i = 0; i < ns; i++) {
    const j = (i + 1) % ns;
    for (let k = 0; k < nr - 1; k++) {
      const a = i * nr + k, b = j * nr + k, c = j * nr + k + 1, d = i * nr + k + 1;
      for (const [p, q, r] of [[a, b, c], [a, c, d]]) {
        const den = (y[q] - y[r]) * (x[p] - x[r]) + (x[r] - x[q]) * (y[p] - y[r]);
        if (Math.abs(den) < 1e-12) continue;
        const w0 = ((y[q] - y[r]) * (px - x[r]) + (x[r] - x[q]) * (py - y[r])) / den;
        const w1 = ((y[r] - y[p]) * (px - x[r]) + (x[p] - x[r]) * (py - y[r])) / den, w2 = 1 - w0 - w1;
        if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
        const mix = A => w0 * A[p] + w1 * A[q] + w2 * A[r];
        return { z: mix(z), zb: mix(zb), he: mix(he) };
      }
    }
  }
  return null;
}

// Grilla de 0,5 mm de la cara de arriba de un pie (altura, base y elemento), para leer muchos puntos rápido
// (vista de corte). Se arma una vez por diseño y queda guardada en el pie.
function grillaDe(g) {
  if (g._grilla) return g._grilla;
  const { ns, nr, x, y, z, zb, he } = g, paso = 0.5;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let q = 0; q < x.length; q++) { x0 = Math.min(x0, x[q]); x1 = Math.max(x1, x[q]); y0 = Math.min(y0, y[q]); y1 = Math.max(y1, y[q]); }
  const nx = Math.ceil((x1 - x0) / paso) + 1, ny = Math.ceil((y1 - y0) / paso) + 1, n = nx * ny;
  const Z = new Float32Array(n).fill(NaN), ZB = new Float32Array(n), HE = new Float32Array(n);
  for (let i = 0; i < ns; i++) {
    const j = (i + 1) % ns;
    for (let k = 0; k < nr - 1; k++) {
      const a = i * nr + k, b = j * nr + k, c = j * nr + k + 1, d = i * nr + k + 1;
      for (const [p, q, r] of [[a, b, c], [a, c, d]]) {
        const den = (y[q] - y[r]) * (x[p] - x[r]) + (x[r] - x[q]) * (y[p] - y[r]); if (Math.abs(den) < 1e-12) continue;
        const ia = Math.max(0, Math.floor((Math.min(x[p], x[q], x[r]) - x0) / paso)), ib = Math.min(nx - 1, Math.ceil((Math.max(x[p], x[q], x[r]) - x0) / paso));
        const ja = Math.max(0, Math.floor((Math.min(y[p], y[q], y[r]) - y0) / paso)), jb = Math.min(ny - 1, Math.ceil((Math.max(y[p], y[q], y[r]) - y0) / paso));
        for (let ii = ia; ii <= ib; ii++) for (let jj = ja; jj <= jb; jj++) {
          const px = x0 + ii * paso, py = y0 + jj * paso;
          const w0 = ((y[q] - y[r]) * (px - x[r]) + (x[r] - x[q]) * (py - y[r])) / den;
          const w1 = ((y[r] - y[p]) * (px - x[r]) + (x[p] - x[r]) * (py - y[r])) / den, w2 = 1 - w0 - w1;
          if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
          const s = jj * nx + ii;
          Z[s] = w0 * z[p] + w1 * z[q] + w2 * z[r]; ZB[s] = w0 * zb[p] + w1 * zb[q] + w2 * zb[r]; HE[s] = w0 * he[p] + w1 * he[q] + w2 * he[r];
        }
      }
    }
  }
  const leer = (px, py) => {
    const ii = Math.round((px - x0) / paso), jj = Math.round((py - y0) / paso);
    if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) return null;
    const s = jj * nx + ii; return Number.isNaN(Z[s]) ? null : { z: Z[s], zb: ZB[s], he: HE[s] };
  };
  g._grilla = { leer, x0, x1, y0, y1 };
  return g._grilla;
}

// Clic en el visor: punto de la cara de arriba que toca el rayo (el más cercano a la cámara). Se avanza por el
// rayo sobre la grilla de alturas de cada pie hasta pasar por debajo de la superficie y se afina el cruce.
function puntoDelClic(px, py) {
  const { o, d } = visor.rayo(px, py);
  let mejor = null;
  for (const v of enVista) {
    const G = grillaDe(v.g); let zMax = 0; for (const zz of v.g.z) if (zz > zMax) zMax = zz;
    // tramo del rayo dentro de la caja del pie
    let t0 = 0, t1 = Infinity;
    const caja = [[G.x0 + v.ox, G.x1 + v.ox], [G.y0, G.y1], [-1, zMax + 1]];
    for (let k = 0; k < 3; k++) {
      if (Math.abs(d[k]) < 1e-9) { if (o[k] < caja[k][0] || o[k] > caja[k][1]) { t1 = -1; break; } continue; }
      let a = (caja[k][0] - o[k]) / d[k], b = (caja[k][1] - o[k]) / d[k]; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (!(t1 > t0)) continue;
    const debajo = t => { const p = G.leer(o[0] + t * d[0] - v.ox, o[1] + t * d[1]); return p && o[2] + t * d[2] <= p.z ? p : null; };
    let antes = t0;
    for (let t = t0; t <= t1; t += 0.4) {
      if (!debajo(t)) { antes = t; continue; }
      let a = antes, b = t;
      for (let i = 0; i < 12; i++) { const m = (a + b) / 2; if (debajo(m)) b = m; else a = m; }
      if (!mejor || b < mejor.t) mejor = { t: b, pie: v.pie, x: o[0] + b * d[0] - v.ox, y: o[1] + b * d[1], z: o[2] + b * d[2] };
      break;
    }
  }
  return mejor;
}
// Versión anterior (triángulo por triángulo): más lenta, queda para comparar desde la consola.
function puntoDelClicExacto(px, py) {
  const { o, d } = visor.rayo(px, py);
  let mejor = null;
  for (const v of enVista) {
    const { ns, nr, x, y, z } = v.g;
    for (let i = 0; i < ns; i++) {
      const j = (i + 1) % ns;
      for (let k = 0; k < nr - 1; k++) {
        const a = i * nr + k, b = j * nr + k, c = j * nr + k + 1, e = i * nr + k + 1;
        for (const [p, q, r] of [[a, b, c], [a, c, e]]) {
          const P = [x[p] + v.ox, y[p], z[p]], Q = [x[q] + v.ox, y[q], z[q]], R = [x[r] + v.ox, y[r], z[r]];
          const e1 = Q.map((t, n) => t - P[n]), e2 = R.map((t, n) => t - P[n]);
          const h = [d[1] * e2[2] - d[2] * e2[1], d[2] * e2[0] - d[0] * e2[2], d[0] * e2[1] - d[1] * e2[0]];
          const det = e1[0] * h[0] + e1[1] * h[1] + e1[2] * h[2]; if (Math.abs(det) < 1e-9) continue;
          const s = o.map((t, n) => t - P[n]), u = (s[0] * h[0] + s[1] * h[1] + s[2] * h[2]) / det; if (u < 0 || u > 1) continue;
          const qv = [s[1] * e1[2] - s[2] * e1[1], s[2] * e1[0] - s[0] * e1[2], s[0] * e1[1] - s[1] * e1[0]];
          const w = (d[0] * qv[0] + d[1] * qv[1] + d[2] * qv[2]) / det; if (w < 0 || u + w > 1) continue;
          const t = (e2[0] * qv[0] + e2[1] * qv[1] + e2[2] * qv[2]) / det;
          if (t > 0 && (!mejor || t < mejor.t)) mejor = { t, pie: v.pie, x: o[0] + t * d[0] - v.ox, y: o[1] + t * d[1], z: o[2] + t * d[2] };
        }
      }
    }
  }
  return mejor;
}

// ---- Vista de corte ----
// Perfil de la plantilla por el punto elegido: a lo ancho (transversal) y a lo largo (longitudinal). Gris = la
// plantilla (de la base a la cara de arriba), naranja = lo que suman los elementos, azul punteado = planta del
// pie del escaneo. La altura se agranda (×k, se indica) para que se lea; las distancias son en mm reales.
const COLOR_TRANS = '#d9481c', COLOR_LONG = '#1d5fbf';
function perfilesCorte(v) {
  const G = grillaDe(v.g), al = v.al, trans = [], long = [];
  for (let x = G.x0; x <= G.x1; x += 0.5) { const p = G.leer(x, corte.y); if (p) trans.push({ s: x, ...p, pie: al?.altura(x, corte.y) ?? null }); }
  for (let y = G.y0; y <= G.y1; y += 0.5) { const p = G.leer(corte.x, y); if (p) long.push({ s: y, ...p, pie: al?.altura(corte.x, y) ?? null }); }
  return { trans, long };
}
function dibujarCorte() {
  const v = corte && enVista.find(e => e.pie === corte.pie);
  if (!v) { $('panelCorte').hidden = true; return; }
  const cv = $('graficoCorte'), dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const { trans, long } = perfilesCorte(v), pt = grillaDe(v.g).leer(corte.x, corte.y);
  const medialDerecha = v.pie === 'izq';   // pie izquierdo: lado interno hacia +X
  const lado = v.pie === 'izq' ? 'izquierdo' : 'derecho';
  const graf = (datos, x0, ancho, titulo, color, marca, extremos) => {
    if (datos.length < 2) return;
    const m = { l: 34, r: 12, t: 26, b: 22 }, gw = ancho - m.l - m.r, gh = H - m.t - m.b;
    const s0 = datos[0].s, s1 = datos[datos.length - 1].s, zMax = Math.max(...datos.map(d => Math.max(d.z, d.pie ?? 0))) + 1;
    const pxmm = gw / (s1 - s0), k = Math.max(1, Math.min(8, Math.floor(gh / (zMax * pxmm))));
    const X = s => x0 + m.l + (s - s0) * pxmm, Y = z => m.t + gh - z * pxmm * k;
    c.font = '600 12px system-ui, sans-serif'; c.fillStyle = '#1c2430'; c.fillText(titulo, x0 + m.l, 16);
    c.font = '11px system-ui, sans-serif'; c.fillStyle = '#5d6878'; c.fillText(`alto ×${k}`, x0 + ancho - m.r - 40, 16);
    // rejilla de alturas cada 5 mm
    c.strokeStyle = '#e3e7ec'; c.lineWidth = 1;
    for (let z = 0; z <= zMax; z += 5) { c.beginPath(); c.moveTo(X(s0), Y(z)); c.lineTo(X(s1), Y(z)); c.stroke(); c.fillText(`${z}`, x0 + 8, Y(z) + 4); }
    // plantilla
    c.beginPath(); datos.forEach((d, i) => (i ? c.lineTo(X(d.s), Y(d.z)) : c.moveTo(X(d.s), Y(d.z))));
    for (let i = datos.length - 1; i >= 0; i--) c.lineTo(X(datos[i].s), Y(datos[i].zb));
    c.closePath(); c.fillStyle = '#ddd8cf'; c.fill();
    // elementos
    c.beginPath(); datos.forEach((d, i) => (i ? c.lineTo(X(d.s), Y(d.z)) : c.moveTo(X(d.s), Y(d.z))));
    for (let i = datos.length - 1; i >= 0; i--) c.lineTo(X(datos[i].s), Y(datos[i].z - datos[i].he));
    c.closePath(); c.fillStyle = 'rgba(224,138,46,.75)'; c.fill();
    c.beginPath(); datos.forEach((d, i) => (i ? c.lineTo(X(d.s), Y(d.z)) : c.moveTo(X(d.s), Y(d.z)))); c.strokeStyle = '#1c2430'; c.lineWidth = 1.5; c.stroke();
    // pie del escaneo
    if (datos.some(d => d.pie != null)) {
      c.setLineDash([5, 4]); c.strokeStyle = '#3d6fd0'; c.lineWidth = 1.5; c.beginPath(); let abierto = false;
      for (const d of datos) { if (d.pie == null) { abierto = false; continue; } if (abierto) c.lineTo(X(d.s), Y(d.pie)); else { c.moveTo(X(d.s), Y(d.pie)); abierto = true; } }
      c.stroke(); c.setLineDash([]);
    }
    // punto elegido
    if (pt) {
      c.strokeStyle = color; c.lineWidth = 1; c.beginPath(); c.moveTo(X(marca), Y(0)); c.lineTo(X(marca), Y(pt.z) - 6); c.stroke();
      c.fillStyle = color; c.beginPath(); c.arc(X(marca), Y(pt.z), 3.5, 0, 7); c.fill();
      c.font = '600 12px system-ui, sans-serif'; const t = `${f1(pt.z)} mm`; c.fillText(t, Math.min(X(marca) + 6, x0 + ancho - m.r - c.measureText(t).width), Y(pt.z) - 8);
    }
    c.font = '11px system-ui, sans-serif'; c.fillStyle = '#5d6878';
    c.fillText(extremos[0], X(s0), H - 6); const t1 = extremos[1]; c.fillText(t1, X(s1) - c.measureText(t1).width, H - 6);
  };
  const mitad = W / 2;
  graf(trans, 0, mitad, `A lo ancho (pie ${lado}), a ${Math.round(corte.y)} mm del talón`, COLOR_TRANS, corte.x,
       medialDerecha ? ['externo', 'interno'] : ['interno', 'externo']);
  graf(long, mitad, mitad - 30, `A lo largo, por el punto elegido`, COLOR_LONG, corte.y, ['talón', 'dedos']);
}
$('cerrarCorte').addEventListener('click', () => { corte = null; $('panelCorte').hidden = true; visor?.pedir(); });

const capa = $('capa');
function dibujarCapa() {
  const dpr = window.devicePixelRatio || 1, w = capa.clientWidth, h = capa.clientHeight;
  if (capa.width !== Math.round(w * dpr) || capa.height !== Math.round(h * dpr)) { capa.width = Math.round(w * dpr); capa.height = Math.round(h * dpr); }
  const c = capa.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  // líneas del corte sobre la plantilla
  const vc = corte && enVista.find(e => e.pie === corte.pie);
  if (vc) {
    const G = grillaDe(vc.g);
    for (const [color, puntos] of [[COLOR_TRANS, s => [s, corte.y]], [COLOR_LONG, s => [corte.x, s]]]) {
      const [a, b] = color === COLOR_TRANS ? [G.x0, G.x1] : [G.y0, G.y1];
      c.strokeStyle = color; c.lineWidth = 2; c.beginPath(); let abierto = false;
      for (let s = a; s <= b; s += 1.5) {
        const [px, py] = puntos(s), p = G.leer(px, py);
        if (!p) { abierto = false; continue; }
        const q = visor.proyectar([px + vc.ox, py, p.z + 0.2]); if (!q?.visible) continue;
        if (abierto) c.lineTo(q.x, q.y); else { c.moveTo(q.x, q.y); abierto = true; }
      }
      c.stroke();
    }
  }
  // con la regla prendida: cruz de guía de lado a lado de la vista por el ratón (como LutraCAD)
  if (reglando && cursorRegla) {
    c.strokeStyle = 'rgba(40,60,90,.45)'; c.lineWidth = 1; c.beginPath();
    c.moveTo(0, cursorRegla.sy + 0.5); c.lineTo(w, cursorRegla.sy + 0.5); c.moveTo(cursorRegla.sx + 0.5, 0); c.lineTo(cursorRegla.sx + 0.5, h); c.stroke();
  }
  // reglas como cota de LutraCAD: los dos puntos medidos, líneas de referencia finas hasta la línea de la cota (que
  // se corre a un lado arrastrándola, para no tapar la plantilla) y el valor escrito a lo largo de la línea
  const VERDE = '#12963a';
  for (const rg of reglas) {
    // la regla a medio poner sigue al ratón hasta el segundo clic
    const fin = rg.b ?? (reglando && rg === reglas[reglas.length - 1] ? cursorRegla?.w : null);
    const A = visor.proyectar(rg.a), B = fin && visor.proyectar(fin); rg._seg = null; if (!A) continue;
    c.fillStyle = VERDE; c.beginPath(); c.arc(A.x, A.y, 3, 0, 7); c.fill();
    if (!B) continue;
    c.beginPath(); c.arc(B.x, B.y, 3, 0, 7); c.fill();
    const off = rg.b && rg.desp ? rg.desp : [0, 0, 0], mas = (p, o) => [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
    const A2 = visor.proyectar(mas(rg.a, off)), B2 = visor.proyectar(mas(fin, off)); if (!A2 || !B2) continue;
    rg._seg = [A2, B2];
    const ang0 = Math.atan2(B2.y - A2.y, B2.x - A2.x), nx = -Math.sin(ang0), ny = Math.cos(ang0);
    // líneas de referencia: del punto medido a la cota y un poco más allá
    if (Math.hypot(A2.x - A.x, A2.y - A.y) > 2) {
      c.strokeStyle = 'rgba(60,72,90,.75)'; c.lineWidth = 1; c.beginPath();
      for (const [P, P2] of [[A, A2], [B, B2]]) {
        const l = Math.hypot(P2.x - P.x, P2.y - P.y), ux = (P2.x - P.x) / l, uy = (P2.y - P.y) / l;
        c.moveTo(P.x, P.y); c.lineTo(P2.x + ux * 8, P2.y + uy * 8);
      }
      c.stroke();
    }
    // línea de la cota con marcas en las puntas y cada 10 mm
    const elegida = rg === reglaElegida, color = elegida ? '#e0661b' : VERDE;
    c.strokeStyle = color; c.lineWidth = elegida ? 3 : 1.6; c.beginPath(); c.moveTo(A2.x, A2.y); c.lineTo(B2.x, B2.y);
    for (const P of [A2, B2]) { c.moveTo(P.x - nx * 7, P.y - ny * 7); c.lineTo(P.x + nx * 7, P.y + ny * 7); }
    c.stroke();
    const dx = fin[0] - rg.a[0], dy = fin[1] - rg.a[1], dz = fin[2] - rg.a[2], L = Math.hypot(dx, dy, dz);
    c.lineWidth = 1;
    for (let s = 10; s < L; s += 10) {
      const p = visor.proyectar(mas([rg.a[0] + dx * s / L, rg.a[1] + dy * s / L, rg.a[2] + dz * s / L], off)); if (!p) continue;
      const k = s % 50 === 0 ? 5 : 2.5; c.beginPath(); c.moveTo(p.x - nx * k, p.y - ny * k); c.lineTo(p.x + nx * k, p.y + ny * k); c.stroke();
    }
    // valor a lo largo de la línea, siempre al derecho (de izquierda a derecha o de abajo hacia arriba)
    const plano = Math.hypot(dx, dy), t1 = `${f1(L)} mm`, t2 = Math.abs(dz) >= 0.5 ? `en planta ${f1(plano)} · alto ${f1(Math.abs(dz))}` : '';
    let ang = ang0; if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
    c.save(); c.translate((A2.x + B2.x) / 2, (A2.y + B2.y) / 2); c.rotate(ang); c.textAlign = 'center'; c.lineJoin = 'round';
    c.font = '600 14px system-ui, sans-serif'; c.lineWidth = 4; c.strokeStyle = 'rgba(255,255,255,.92)';
    c.strokeText(t1, 0, -7); c.fillStyle = '#0d6b2a'; c.fillText(t1, 0, -7);
    if (t2) { c.font = '12px system-ui, sans-serif'; c.strokeText(t2, 0, 17); c.fillStyle = '#4d5866'; c.fillText(t2, 0, 17); }
    c.restore();
  }
  for (const md of medidasTomadas) {
    const v = enVista.find(e => e.pie === md.pie); if (!v) continue;
    const pt = leerPunto(v.g, md.x, md.y); if (!pt) continue;
    const arriba = visor.proyectar([md.x + v.ox, md.y, pt.z]), abajo = visor.proyectar([md.x + v.ox, md.y, pt.zb]);
    if (!arriba?.visible) continue;
    // línea vertical desde la base hasta el punto, punto marcado y etiqueta
    c.strokeStyle = '#1c2430'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(abajo.x, abajo.y); c.lineTo(arriba.x, arriba.y - 28); c.stroke();
    c.fillStyle = '#d9481c'; c.beginPath(); c.arc(arriba.x, arriba.y, 4, 0, 7); c.fill();
    const t1 = `${f1(pt.z)} mm`, t2 = `espesor ${f1(pt.z - pt.zb)}` + (pt.he > 0.05 ? ` · elemento +${f1(pt.he)}` : '');
    c.font = '600 14px system-ui, sans-serif'; const a1 = c.measureText(t1).width;
    c.font = '12px system-ui, sans-serif'; const a2 = c.measureText(t2).width, ancho = Math.max(a1, a2) + 16;
    const bx = arriba.x - ancho / 2, by = arriba.y - 70;
    c.fillStyle = 'rgba(255,255,255,.94)'; c.strokeStyle = '#c7cfda'; c.lineWidth = 1;
    c.beginPath(); c.roundRect(bx, by, ancho, 40, 6); c.fill(); c.stroke();
    c.fillStyle = '#1c2430'; c.font = '600 14px system-ui, sans-serif'; c.fillText(t1, bx + 8, by + 17);
    c.fillStyle = '#5d6878'; c.font = '12px system-ui, sans-serif'; c.fillText(t2, bx + 8, by + 33);
  }
}
if (visor) {
  visor.alDibujar(dibujarCapa);
  visor.alDibujar(dibujarMuestra);
  // la línea de corte en edición, encima de todo (en la capa de medidas)
  visor.alDibujar(() => {
    if (!lc) return;
    const dpr = window.devicePixelRatio || 1, c = capa.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); dibujarCorte2D(c);
  });
  visor.alClic((px, py, ev) => {
    if (lc) return;   // editando la línea de corte: los clics son de la edición
    if (clicDeRegla) { clicDeRegla = false; return; }   // fue elegir o agarrar una cota, no un clic de herramienta
    if (reglaElegida) { reglaElegida = null; visor.pedir(); }   // clic en otro lado: la cota deja de estar elegida
    if (cortando) {
      const p = puntoDelClic(px, py); if (!p) return;
      corte = { pie: p.pie, x: p.x, y: p.y }; $('panelCorte').hidden = false; dibujarCorte(); visor.pedir();
      return;
    }
    if (reglando) {
      const w = puntoRegla(px, py, !!ev?.shiftKey); if (!w) return;
      const ult = reglas[reglas.length - 1];
      if (ult && !ult.b) { ult.b = w; cursorRegla = null; } else { reglas.push({ a: w, b: null }); if (reglas.length > 6) reglas.shift(); }
      $('borrarMedidas').hidden = false; visor.pedir();
      return;
    }
    if (!midiendo) { if (!fijoModulo()) elegirPlantilla(px, py); return; }
    const p = puntoDelClic(px, py); if (!p) return;
    medidasTomadas.push({ pie: p.pie, x: p.x, y: p.y }); if (medidasTomadas.length > 8) medidasTomadas.shift();
    $('borrarMedidas').hidden = false; visor.pedir();
  });
  visor.alAgarrar((px, py, ev) => {
    if (lc) return agarrarCorte(px, py, ev);
    const r = agarrarRegla(px, py); if (r) return r;
    if (reglaElegida) { reglaElegida = null; visor.pedir(); }
    return agarrarElemento(px, py, ev);
  });
  // regla prendida: la cruz de guía sigue al ratón; a medio poner, la línea también (con Mayús, recta; también al
  // apretar o soltar Mayús con el ratón quieto)
  const reglaPendiente = () => reglando && reglas.length && !reglas[reglas.length - 1].b;
  const seguirRegla = (px, py, recta) => {
    const [sx, sy] = rectaRegla(px, py, recta);
    cursorRegla = { px, py, sx, sy, w: reglaPendiente() ? puntoRegla(px, py, recta) : null }; visor.pedir();
  };
  $('lienzo').addEventListener('pointermove', e => {
    if (!reglando || e.buttons) return;
    const r = $('lienzo').getBoundingClientRect(); seguirRegla(e.clientX - r.left, e.clientY - r.top, e.shiftKey);
  });
  $('lienzo').addEventListener('pointerleave', () => { if (cursorRegla) { cursorRegla = null; visor.pedir(); } });
  for (const tipo of ['keydown', 'keyup']) window.addEventListener(tipo, e => {
    if (e.key === 'Shift' && reglaPendiente() && cursorRegla) seguirRegla(cursorRegla.px, cursorRegla.py, tipo === 'keydown');
  });
}

// Correr la cota a un lado (como LutraCAD): con la regla prendida, agarrar su línea y arrastrar. La línea se corre en
// el plano de la vista, siempre de costado a lo medido (el largo no cambia).
// Clic en una cota = queda elegida (en naranja) y Supr la borra (Ernesto, 2026-11-13). Funciona con cualquier
// herramienta: solo hay que tocar la línea.
let clicDeRegla = false, reglaElegida = null;
function agarrarRegla(px, py) {
  const cerca = (P, Q) => {
    const vx = Q.x - P.x, vy = Q.y - P.y, l2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((px - P.x) * vx + (py - P.y) * vy) / l2));
    return Math.hypot(px - P.x - t * vx, py - P.y - t * vy);
  };
  const rg = reglas.find(r => r.b && r._seg && cerca(...r._seg) < 8); if (!rg) return null;
  clicDeRegla = true;   // soltar sin mover no pone un punto nuevo
  reglaElegida = rg; if (activo >= 0) { activo = -1; refrescarPosiciones(); }
  visor.pedir();
  const M = rg.a.map((v, i) => (v + rg.b[i]) / 2), u0 = rg.b.map((v, i) => v - rg.a[i]), lu = Math.hypot(...u0), u = u0.map(v => v / lu);
  const desp0 = rg.desp ?? [0, 0, 0];
  const enPlano = (x, y) => {   // punto del rayo en el plano de la vista que pasa por el medio de la regla
    const { o, d } = visor.rayo(x, y), dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
    const t = ((M[0] - o[0]) * d[0] + (M[1] - o[1]) * d[1] + (M[2] - o[2]) * d[2]) / dd;
    return o.map((v, i) => v + t * d[i]);
  };
  const P0 = enPlano(px, py);
  return {
    mover(x, y) {
      const P = enPlano(x, y), v = desp0.map((s, i) => s + P[i] - P0[i]), k = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];
      rg.desp = v.map((s, i) => s - k * u[i]); visor.pedir();
    },
    // si se arrastró no llega el clic: se baja la marca aquí
    soltar(movio) { if (movio) clicDeRegla = false; },
  };
}

// ---- Editar línea de corte (como LutraCAD, 2026-11-13) ----
// La línea de corte es el contorno de la plantilla. Se edita en la vista Arriba con dos modos:
//  · Mover región: clic en la línea y se mueve el ratón (o se arrastra); ese tramo sigue al ratón y se apaga suave
//    hacia los costados (el tamaño de la región se elige en mm). Otro clic deja el tramo en su lugar.
//  · Edición libre: se aprieta sobre la línea y se dibuja el tramo nuevo; al soltar sobre la línea, ese tramo
//    reemplaza al que había.
// Confirmar la guarda como contorno de la plantilla (igual que la forma de la muestra: va en la receta, se deshace
// con Ctrl+Z y "Volver a la forma de la horma" la quita). Cada pie se edita por separado (Ernesto, 2026-11-13);
// "Reflejar" copia la línea del último pie editado al otro, en espejo, como en LutraCAD.
let lc = null;   // { p: { izq, der } (cada uno [[x, y]] como pie izquierdo), hist, modo, mov, trazo, cursor, ultimo }
const copiaPerfil = P => ({ izq: { interno: Float64Array.from(P.izq.interno), externo: Float64Array.from(P.izq.externo) },
                             der: { interno: Float64Array.from(P.der.interno), externo: Float64Array.from(P.der.externo) } });
const copiaCorte = () => ({ izq: lc.p.izq.map(q => [...q]), der: lc.p.der.map(q => [...q]), perfil: copiaPerfil(lc.perfil) });
// Altura del borde (vista de costado, como LutraCAD): en las vistas Izquierda/Derecha la línea de corte se ve como
// el borde de arriba del lado que mira a la cámara; al subirla o bajarla, ese lado de la plantilla sube o baja (el
// arco por el costado). Se guarda por pie y por lado (interno/externo) como mm a lo largo, en N_PERFIL puntos.
const N_PERFIL = 201;
const perfilVacio = () => ({ interno: new Float64Array(N_PERFIL), externo: new Float64Array(N_PERFIL) });
const enPerfil = (arr, u) => { const t = Math.min(Math.max(u, 0), 1) * (N_PERFIL - 1), i = Math.min(Math.floor(t), N_PERFIL - 2), f = t - i; return arr[i] + f * (arr[i + 1] - arr[i]); };
// vista de costado: la cámara casi horizontal y mirando de lado. Devuelve +1 si la cámara está del lado +x, -1 si del -x
function vistaCostado() {
  const c = visor?.camara(); if (!c || Math.abs(c.elev) > 35) return 0;
  const s = Math.sin((c.giro * Math.PI) / 180); return Math.abs(s) > 0.8 ? Math.sign(s) : 0;
}
// el lado de un pie que mira a la cámara (en el izquierdo el interno es +x; el derecho es el espejo)
const ladoQueMira = (v, s) => ((s > 0) === (v.pie === 'izq') ? 'interno' : 'externo');
// puntos del borde de arriba de ese lado, del talón a la punta: { x, y, z (mundo, sin ox), u (fracción del largo) }
function bordeDeLado(v, lado) {
  const g = v.g, { ns, nr } = g, P = [];
  let y1 = 0; for (let i = 0; i < ns; i++) y1 = Math.max(y1, g.y[i * nr]);
  // centro de cada fila (a lo ancho) para saber de qué lado está cada punto del contorno
  const nb = 60, lo = new Float64Array(nb).fill(Infinity), hi = new Float64Array(nb).fill(-Infinity), fila = y => Math.min(nb - 1, Math.max(0, Math.floor((y / y1) * nb)));
  // (el anillo k = 0 es el contorno)
  for (let i = 0; i < ns; i++) { const q = i * nr, b = fila(g.y[q]); lo[b] = Math.min(lo[b], g.x[q]); hi[b] = Math.max(hi[b], g.x[q]); }
  const mas = (lado === 'interno') === (v.pie === 'izq');   // ese lado está en +x
  for (let i = 0; i < ns; i++) {
    const q = i * nr, b = fila(g.y[q]), c = (lo[b] + hi[b]) / 2, u = g.y[q] / y1;
    if (u < 0.04 || u > 0.96) continue;
    if (mas ? g.x[q] > c : g.x[q] < c) P.push({ x: g.x[q], y: g.y[q], z: g.z[q], u });
  }
  return P.sort((a, b) => a.y - b.y);
}
const AYUDA_CORTE = {
  region: 'Haga clic en la línea y mueva el ratón: ese tramo sigue al ratón. Otro clic lo deja en su lugar (también se puede arrastrar). Repita hasta que quede a su gusto y confirme. En las vistas Izquierda o Derecha se ve el borde de costado: súbalo o bájelo igual (rojo = como está, verde = como queda).',
  libre: 'Apriete sobre la línea y dibuje el tramo nuevo sin soltar; suelte sobre la línea. Ese tramo reemplaza al que había. Repita y confirme.',
  caja: 'Mueva los puntos del cuadro para ajustar la forma: la plantilla se estira suave con ellos. Clic en un punto lo elige (Shift + clic suma o quita); Lazo elige varios rodeándolos. Con Girar o Escala, arrastre los puntos elegidos. Confirme al terminar.',
};
const largoAcum = P => { const a = [0]; for (let i = 0; i < P.length; i++) { const [x, y] = P[i], [u, v] = P[(i + 1) % P.length]; a.push(a[i] + Math.hypot(u - x, v - y)); } return a; };
function pintarCorte() {
  const si = !!lc;
  $('accionCorte').hidden = !si; $('lineaCorte').classList.toggle('activo', si);
  document.querySelector('.visor').classList.toggle('editando-corte', si);
  pintarPanelElemento();
  if (!si) return;
  document.querySelectorAll('[data-modo-corte]').forEach(b => b.classList.toggle('activo', b.dataset.modoCorte === lc.modo));
  $('ayudaCorte').textContent = AYUDA_CORTE[lc.modo];
  $('filaRadioCorte').hidden = lc.modo !== 'region';
  $('herramientasCaja').hidden = lc.modo !== 'caja';
  document.querySelectorAll('[data-caja]').forEach(b => b.classList.toggle('activo', b.dataset.caja === (lc.cajaHerr ?? 'mover')));
  $('cortePaso').disabled = !lc.hist.length;
  $('corteReflejar').textContent = lc.ultimo === 'der' ? 'Reflejar derecho → izquierdo' : 'Reflejar izquierdo → derecho';
}
function empezarCorte() {
  if (lc || !actual || !visor) return;
  // las herramientas que usan el clic se apagan
  if (midiendo) usarHerramienta('medir'); if (cortando) usarHerramienta('corte'); if (reglando) usarHerramienta('regla');
  // el contorno de cada pie tal como está, pasado a pie izquierdo (el derecho se des-espeja)
  const borde = (g, s) => { const P = []; for (let i = 0; i < g.ns; i++) P.push([s * g.x[i * g.nr], g.y[i * g.nr]]); return contornoParaReceta(P, 480); };
  const pf = { izq: perfilVacio(), der: perfilVacio() };
  for (const pie of ['izq', 'der']) for (const lado of ['interno', 'externo']) {
    const a = alturaBordeActual?.[pie]?.[lado]; if (a?.length) for (let j = 0; j < N_PERFIL; j++) pf[pie][lado][j] = enPerfil(a, j / (N_PERFIL - 1));
  }
  lc = { p: { izq: borde(actual.izq, 1), der: borde(actual.der, -1) }, hist: [], modo: 'region', mov: null, trazo: null, cursor: null, ultimo: 'izq',
         perfil: pf, perfil0: copiaPerfil(pf), bordes: null };
  lc.p0 = { izq: lc.p.izq.map(q => [...q]), der: lc.p.der.map(q => [...q]) };
  visor.vista('arriba'); pintarCorte(); visor.pedir();
  mensaje('Editar línea de corte: en la vista Arriba se cambia el contorno; en las vistas Izquierda o Derecha se sube o baja el borde (el arco por el costado). Confirmar la guarda; Cancelar la deja como estaba.');
}
// borde de cada pie a la vista y del lado que mira a la cámara, tal como está la plantilla ahora (se guarda una vez
// por vista: la plantilla no se rehace mientras se edita)
function bordesCostado() {
  const s = vistaCostado(); if (!s) return null;
  const clave = s + '|' + enVista.map(v => v.pie).join();
  if (lc.bordes?.clave !== clave || lc.bordes.lista.some((b, i) => b.v !== enVista[i])) lc.bordes = { clave, lista: enVista.map(v => { const lado = ladoQueMira(v, s); return { v, lado, pts: bordeDeLado(v, lado) }; }) };
  return lc.bordes.lista;
}
// z del borde con lo editado en esta sesión (lo de antes ya está en la plantilla)
const zEditada = (b, p) => p.z + enPerfil(lc.perfil[b.v.pie][b.lado], p.u) - enPerfil(lc.perfil0[b.v.pie][b.lado], p.u);
function tocarPerfil(px, py, max = 12) {
  let mejor = null;
  for (const b of bordesCostado() ?? []) b.pts.forEach((p, i) => {
    const s = visor.proyectar([p.x + b.v.ox, p.y, zEditada(b, p)]); if (!s) return;
    const d = Math.hypot(s.x - px, s.y - py); if (d < max && (!mejor || d < mejor.d)) mejor = { d, i, b };
  });
  return mejor;
}
// Mover región en la vista de costado: el punto tomado sube o baja con el ratón y la región (radio en mm, a lo largo)
// lo acompaña con una campana suave (sin quiebre en las puntas). La región se ensancha si se tira mucho.
function agarrarPerfil(px, py) {
  const nada = { mover() {}, soltar() {} };
  if (lc.mov?.siguiendo) { lc.mov = null; visor.pedir(); return nada; }
  const t = tocarPerfil(px, py); if (!t) return null;
  const { b, i } = t, p = b.pts[i];
  lc.hist.push(copiaCorte()); lc.ultimo = b.v.pie; pintarCorte();
  const s0 = visor.proyectar([p.x + b.v.ox, p.y, zEditada(b, p)]), s1 = visor.proyectar([p.x + b.v.ox, p.y, zEditada(b, p) + 10]);
  const pxPorMm = Math.max(Math.hypot(s1.x - s0.x, s1.y - s0.y) / 10, 1e-3);
  let largo = 0; for (const q of b.pts) largo = Math.max(largo, q.y / Math.max(q.u, 1e-6));
  lc.mov = { perfil: true, b, i0: i, u0: p.u, py0: py, pxPorMm, base: Float64Array.from(lc.perfil[b.v.pie][b.lado]), largo, siguiendo: false };
  return {
    mover(x, y) { moverPerfil(x, y); },
    soltar(movio) { if (!lc?.mov) return; if (movio) lc.mov = null; else lc.mov.siguiendo = true; visor.pedir(); },
  };
}
function moverPerfil(px, py) {
  const m = lc?.mov; if (!m?.perfil) return;
  const dz = (m.py0 - py) / m.pxPorMm;
  const R = Math.max(num('radioCorte') || 60, 5, 4 * Math.abs(dz)) / m.largo, arr = lc.perfil[m.b.v.pie][m.b.lado];
  for (let j = 0; j < N_PERFIL; j++) {
    const t = Math.abs(j / (N_PERFIL - 1) - m.u0) / R;
    arr[j] = m.base[j] + (t < 1 ? dz * 0.5 * (1 + Math.cos(Math.PI * t)) : 0);
  }
  m.R = R * m.largo; m.dz = dz;
  visor.pedir();
}
function dibujarPerfil2D(c) {
  const lista = bordesCostado(); if (!lista) return false;
  for (const b of lista) {
    const S0 = b.pts.map(p => visor.proyectar([p.x + b.v.ox, p.y, p.z])), S = b.pts.map(p => visor.proyectar([p.x + b.v.ox, p.y, zEditada(b, p)]));
    if (S.some(s => !s) || S0.some(s => !s)) continue;
    const linea = (P, color, ancho) => { c.strokeStyle = color; c.lineWidth = ancho; c.beginPath(); P.forEach((s, i) => (i ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y))); c.stroke(); };
    // rojo: como está la plantilla; verde: como va a quedar
    linea(S0, 'rgba(220,40,30,0.9)', 1.5); linea(S, '#12b33c', 2.5);
    const m = lc.mov?.perfil && lc.mov.b.v.pie === b.v.pie ? lc.mov : null, hov = lc.cursor?.perfil;
    const centro = m ? m.i0 : lc.cursor?.perfil?.b.v.pie === b.v.pie ? hov.i : null;
    if (centro != null) {
      const R = m?.R ?? Math.max(num('radioCorte') || 60, 5), yc = b.pts[centro].y;
      c.strokeStyle = '#e0661b'; c.lineWidth = 4; c.beginPath(); let abierto = false;
      S.forEach((s, j) => { if (Math.abs(b.pts[j].y - yc) < R) { if (abierto) c.lineTo(s.x, s.y); else { c.moveTo(s.x, s.y); abierto = true; } } else abierto = false; });
      c.stroke();
      c.fillStyle = '#e0661b'; c.beginPath(); c.arc(S[centro].x, S[centro].y, 5, 0, 7); c.fill();
      if (m?.dz != null) { c.font = '600 12px system-ui, sans-serif'; c.fillText(`${m.dz >= 0 ? '+' : ''}${f1(m.dz)} mm`, S[centro].x + 9, S[centro].y - 9); }
    }
  }
  return true;
}
function terminarCorte(guardar) {
  if (!lc) return;
  const { izq, der } = lc.p, p0 = lc.p0, pf = lc.perfil;
  const cambioCont = ['izq', 'der'].some(k => lc.p[k].length !== p0[k].length || lc.p[k].some((q, i) => Math.hypot(q[0] - p0[k][i][0], q[1] - p0[k][i][1]) > 0.01));
  const cambioPerfil = ['izq', 'der'].some(k => ['interno', 'externo'].some(l => pf[k][l].some((v, j) => Math.abs(v - lc.perfil0[k][l][j]) > 0.005)));
  lc = null; pintarCorte(); visor?.pedir();
  if (!guardar || (!cambioCont && !cambioPerfil)) { if (guardar) mensaje('La línea de corte no cambió.'); return; }
  if (cambioPerfil) {
    // se guarda redondeado a 0,01 mm; un lado sin cambios no se guarda
    const lado = a => (a.some(v => Math.abs(v) > 0.005) ? Array.from(a, v => Math.round(v * 100) / 100) : undefined);
    const pie = k => { const r = { interno: lado(pf[k].interno), externo: lado(pf[k].externo) }; return r.interno || r.externo ? r : undefined; };
    const ab = { izq: pie('izq'), der: pie('der') };
    alturaBordeActual = ab.izq || ab.der ? ab : null;
    if (!cambioCont) {
      pintarContorno(); pedir();
      mensaje('Altura del borde guardada. Se deshace con Ctrl+Z o con "Volver a la forma de la horma".');
      return;
    }
  }
  // talón en y = 0, como los contornos de muestra
  const normal = P => { const y0 = Math.min(...P.map(p => p[1])); return contornoParaReceta(P.map(([x, y]) => [x, y - y0])); };
  const puntos = normal(izq), puntosDer = normal(der);
  // si los dos pies quedaron iguales, una sola línea
  const iguales = puntos.every((p, i) => Math.hypot(p[0] - puntosDer[i][0], p[1] - puntosDer[i][1]) < 0.3);
  const antes = contornoActual?.archivo && !/línea de corte editada/.test(contornoActual.archivo) ? contornoActual.archivo + ', ' : '';
  contornoActual = { archivo: antes + 'línea de corte editada', borde: 'editada', puntos, ...(iguales ? {} : { puntosDer }) };
  const h = hormaDe(hormaId(), contornoActual), largo = Math.round(h.largo * 10) / 10, ancho = Math.round(h.ancho * 10) / 10;
  if (Math.abs(largo - num('largo')) > 0.3) { $('largo').value = largo; $('talla').value = tallaDeLargo(largo); pintarNotaLargo(); }
  escalaTalon = null; talonPedido = null; $('anchoTalonAuto').checked = true; $('anchoAuto').checked = false; $('ancho').value = ancho;
  pintarContorno(); pedir();
  mensaje(`Línea de corte guardada: largo ${f1(largo)} mm, ancho ${f1(ancho)} mm. Se deshace con Ctrl+Z o con "Volver a la forma de la horma".`);
}
// pie izquierdo (mm) ↔ visor; el derecho es el espejo
const corteAMundo = (v, [x, y]) => [(v.pie === 'der' ? -x : x) + v.ox, y, 0];
const corteDeMundo = (v, P) => [v.pie === 'der' ? -(P[0] - v.ox) : P[0] - v.ox, P[1]];
function pisoDelRaton(px, py) {
  const { o, d } = visor.rayo(px, py); if (Math.abs(d[2]) < 1e-9) return null;
  const t = -o[2] / d[2]; return [o[0] + t * d[0], o[1] + t * d[1], 0];
}
// punto de la línea más cercano al ratón (en píxeles), en cualquiera de los pies a la vista
function tocarCorte(px, py, max = 12) {
  let mejor = null;
  for (const v of enVista) lc.p[v.pie].forEach((p, i) => {
    const s = visor.proyectar(corteAMundo(v, p)); if (!s) return;
    const dd = Math.hypot(s.x - px, s.y - py); if (dd < max && (!mejor || dd < mejor.d)) mejor = { d: dd, i, v };
  });
  return mejor;
}
function agarrarCorte(px, py, ev) {
  const nada = { mover() {}, soltar() {} };   // con la edición abierta, arrastrar no gira la vista
  if (lc.mov?.siguiendo) {   // segundo clic de "Mover región": deja el tramo donde está
    lc.mov = null; visor.pedir(); return nada;
  }
  // vistas de costado: se edita la altura del borde (no el contorno)
  if (vistaCostado()) return agarrarPerfil(px, py);
  if (lc.modo === 'caja') return agarrarCaja(px, py, ev);
  // fuera de la línea: arrastrar mueve la vista como siempre
  const t = tocarCorte(px, py); if (!t) return null;
  const pie = t.v.pie, base = lc.p[pie].map(p => [...p]), P0 = pisoDelRaton(px, py); if (!P0) return nada;
  lc.ultimo = pie;   // "Reflejar" copia desde este pie
  if (lc.modo === 'region') {
    lc.hist.push(copiaCorte()); pintarCorte();
    // normal de la línea en el punto tocado: el tramo se mueve solo de costado a la línea (sin deslizarse a lo largo)
    const n = base.length, a = base[(t.i - 2 + n) % n], b = base[(t.i + 2) % n], tl = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    lc.mov = { base, i0: t.i, v: t.v, P0, ac: largoAcum(base), siguiendo: false, nx: (b[1] - a[1]) / tl, ny: -(b[0] - a[0]) / tl };
    return {
      mover(x, y) { moverRegion(x, y); },
      // sin arrastrar: sigue al ratón hasta el próximo clic; arrastrando: queda al soltar
      soltar(movio) { if (!lc?.mov) return; if (movio) lc.mov = null; else lc.mov.siguiendo = true; visor.pedir(); },
    };
  }
  lc.trazo = { v: t.v, i0: t.i, pts: [base[t.i]] }; pintarCorte();
  return {
    mover(x, y) {
      const P = pisoDelRaton(x, y); if (!P || !lc?.trazo) return;
      const q = corteDeMundo(lc.trazo.v, P), u = lc.trazo.pts[lc.trazo.pts.length - 1];
      if (Math.hypot(q[0] - u[0], q[1] - u[1]) >= 1.2) { lc.trazo.pts.push(q); visor.pedir(); }
    },
    soltar() { cerrarTrazo(); },
  };
}
function moverRegion(px, py) {
  const m = lc?.mov, P = m && pisoDelRaton(px, py); if (!P) return;
  let dx = P[0] - m.P0[0]; const dy = P[1] - m.P0[1]; if (m.v.pie === 'der') dx = -dx;
  // Como LutraCAD: el punto tomado va adonde va el ratón (en cualquier dirección) y el tramo de la región se vuelve a
  // dibujar como una curva suave que pasa por él y se une con el resto de la línea sin quiebre (dos curvas de
  // Hermite: de la punta de atrás de la región al punto, y del punto a la punta de adelante, con las tangentes de la
  // línea original). La región se ensancha cuando se tira más, así nunca queda un bulto angosto.
  const B0 = m.base, n = B0.length, ac = m.ac, tot = ac[n], s0 = ac[m.i0];
  const R = Math.min(Math.max(num('radioCorte') || 60, 5, 2.5 * Math.hypot(dx, dy)), tot / 2 - 1);
  const en = s => {   // punto de la línea original a la distancia s (a lo largo, con vuelta)
    s = ((s % tot) + tot) % tot; let i = 0; while (i < n - 1 && ac[i + 1] < s) i++;
    const a = B0[i], b = B0[(i + 1) % n], f = ac[i + 1] > ac[i] ? (s - ac[i]) / (ac[i + 1] - ac[i]) : 0;
    return [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1])];
  };
  const tan = s => { const a = en(s - 1.5), b = en(s + 1.5), l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  const A = en(s0 - R), B = en(s0 + R), P0 = en(s0), M = [P0[0] + dx, P0[1] + dy];
  const tA = tan(s0 - R), tB = tan(s0 + R), tM = tan(s0);
  const herm = (p0, t0, p1, t1, u) => {
    const k = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), u2 = u * u, u3 = u2 * u;
    const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
    return [h00 * p0[0] + h10 * k * t0[0] + h01 * p1[0] + h11 * k * t1[0], h00 * p0[1] + h10 * k * t0[1] + h01 * p1[1] + h11 * k * t1[1]];
  };
  lc.p[m.v.pie] = B0.map((q, j) => {
    let o = ac[j] - s0; if (o > tot / 2) o -= tot; if (o < -tot / 2) o += tot;
    if (Math.abs(o) >= R) return q;
    return o < 0 ? herm(A, tA, M, tM, (o + R) / R) : herm(M, tM, B, tB, o / R);
  });
  m.R = R;
  visor.pedir();
}
// Edición libre: el trazo reemplaza el tramo de línea entre donde empezó y donde terminó (el del lado del trazo)
function cerrarTrazo() {
  const tr = lc?.trazo; if (!tr) return; lc.trazo = null;
  const P = lc.p[tr.v.pie], n = P.length, fin = tr.pts[tr.pts.length - 1];
  let i1 = 0, d1 = Infinity;
  P.forEach((p, i) => { const d = Math.hypot(p[0] - fin[0], p[1] - fin[1]); if (d < d1) { d1 = d; i1 = i; } });
  if (tr.pts.length < 3 || d1 > 12 || i1 === tr.i0) { mensaje('El trazo tiene que empezar y terminar sobre la línea de corte.', false); visor.pedir(); return; }
  const tramo = (a, b) => { const r = []; for (let i = a; i !== b; i = (i + 1) % n) r.push(P[i]); r.push(P[b]); return r; };
  const A = tramo(tr.i0, i1), B = tramo(i1, tr.i0), M = tr.pts[Math.floor(tr.pts.length / 2)];
  const cerca = arco => Math.min(...arco.map(p => Math.hypot(p[0] - M[0], p[1] - M[1])));
  // se reemplaza el tramo más cercano a la mitad del trazo
  const nuevo = cerca(A) <= cerca(B) ? [...tr.pts, ...B.slice(1, -1)] : [...A, ...[...tr.pts].reverse().slice(1, -1)];
  // un poco de suavizado (a ~1 mm) para que el trazo a mano no quede temblando y se una sin quiebre
  let Q = contornoParaReceta(nuevo, Math.max(200, Math.round(largoAcum(nuevo).at(-1))));
  for (let pasada = 0; pasada < 3; pasada++) Q = Q.map((p, i) => { const a = Q[(i - 1 + Q.length) % Q.length], b = Q[(i + 1) % Q.length]; return [(a[0] + 2 * p[0] + b[0]) / 4, (a[1] + 2 * p[1] + b[1]) / 4]; });
  lc.hist.push(copiaCorte()); lc.p[tr.v.pie] = contornoParaReceta(Q, 480); pintarCorte(); visor.pedir();
}
// ---- Caja (como LutraCAD): cuadro con una grilla de puntos alrededor de cada pie (3 columnas × 14 filas). Al mover
// puntos, la línea de corte se deforma suave con la grilla (lo que hay entre puntos se interpola: a lo largo con
// Catmull-Rom, a lo ancho con una parábola por las 3 columnas). Herramientas: Mover, Girar, Escala 1D, Escala 2D (sobre
// los puntos elegidos, alrededor de su centro) y Lazo (elegir varios rodeándolos). Cada pie por separado.
const CAJA_FILAS = 14, CAJA_COLS = 3;
function armarCajas() {
  lc.caja = {};
  for (const pie of ['izq', 'der']) {
    const P = lc.p[pie]; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const orig = [];
    for (let j = 0; j < CAJA_FILAS; j++) for (let k = 0; k < CAJA_COLS; k++) orig.push([x0 + (k / (CAJA_COLS - 1)) * (x1 - x0), y0 + (j / (CAJA_FILAS - 1)) * (y1 - y0)]);
    lc.caja[pie] = { x0, x1, y0, y1, orig, ctrl: orig.map(q => [...q]), base: P.map(q => [...q]) };
  }
  lc.cajaSel = new Set();   // "pie:índice"
}
// desplazamiento de la grilla en (s, t) ∈ [0, 1]²
function desplazCaja(cj, s, t) {
  const d = (j, k) => { const i = j * CAJA_COLS + k; return [cj.ctrl[i][0] - cj.orig[i][0], cj.ctrl[i][1] - cj.orig[i][1]]; };
  // a lo ancho: parábola por las 3 columnas (s = 0, 0,5, 1)
  const fila = j => {
    const a = d(j, 0), b = d(j, 1), c = d(j, 2), l0 = 2 * (s - 0.5) * (s - 1), l1 = -4 * s * (s - 1), l2 = 2 * s * (s - 0.5);
    return [l0 * a[0] + l1 * b[0] + l2 * c[0], l0 * a[1] + l1 * b[1] + l2 * c[1]];
  };
  // a lo largo: Catmull-Rom entre filas (en las puntas se repite la fila del borde)
  const f = Math.min(Math.max(t, 0), 1) * (CAJA_FILAS - 1), j = Math.min(Math.floor(f), CAJA_FILAS - 2), u = f - j;
  const F = [fila(Math.max(j - 1, 0)), fila(j), fila(j + 1), fila(Math.min(j + 2, CAJA_FILAS - 1))];
  const u2 = u * u, u3 = u2 * u;
  const w = [-0.5 * u3 + u2 - 0.5 * u, 1.5 * u3 - 2.5 * u2 + 1, -1.5 * u3 + 2 * u2 + 0.5 * u, 0.5 * u3 - 0.5 * u2];
  return [0, 1].map(e => w[0] * F[0][e] + w[1] * F[1][e] + w[2] * F[2][e] + w[3] * F[3][e]);
}
function aplicarCaja(pie) {
  const cj = lc.caja[pie], W = cj.x1 - cj.x0 || 1, H = cj.y1 - cj.y0 || 1;
  lc.p[pie] = cj.base.map(([x, y]) => { const [dx, dy] = desplazCaja(cj, (x - cj.x0) / W, (y - cj.y0) / H); return [x + dx, y + dy]; });
}
function tocarCaja(px, py, max = 10) {
  let mejor = null;
  for (const v of enVista) lc.caja[v.pie].ctrl.forEach((q, i) => {
    const s = visor.proyectar(corteAMundo(v, q)); if (!s) return;
    const d = Math.hypot(s.x - px, s.y - py); if (d < max && (!mejor || d < mejor.d)) mejor = { d, i, v };
  });
  return mejor;
}
function agarrarCaja(px, py, ev) {
  if (!lc.caja) armarCajas();
  const herr = lc.cajaHerr ?? 'mover';
  if (herr === 'lazo') {
    // se dibuja el lazo en la pantalla; al soltar quedan elegidos los puntos de adentro
    lc.lazo = [[px, py]]; if (!ev?.shiftKey) lc.cajaSel.clear();
    return {
      mover(x, y) { const u = lc.lazo.at(-1); if (Math.hypot(x - u[0], y - u[1]) > 3) { lc.lazo.push([x, y]); visor.pedir(); } },
      soltar() {
        const L = lc.lazo; lc.lazo = null;
        const adentro = (x, y) => { let si = false; for (let i = 0, j = L.length - 1; i < L.length; j = i++) { const [xi, yi] = L[i], [xj, yj] = L[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) si = !si; } return si; };
        if (L.length > 2) for (const v of enVista) lc.caja[v.pie].ctrl.forEach((q, i) => { const s = visor.proyectar(corteAMundo(v, q)); if (s && adentro(s.x, s.y)) lc.cajaSel.add(v.pie + ':' + i); });
        visor.pedir();
      },
    };
  }
  const t = tocarCaja(px, py);
  if (!t) return null;   // fuera de los puntos: arrastrar mueve la vista
  const clave = t.v.pie + ':' + t.i;
  if (ev?.shiftKey) { if (lc.cajaSel.has(clave)) lc.cajaSel.delete(clave); else lc.cajaSel.add(clave); visor.pedir(); return { mover() {}, soltar() {} }; }
  // tocar un punto no elegido: queda elegido solo ese (los elegidos del otro pie se sueltan)
  if (!lc.cajaSel.has(clave)) { lc.cajaSel.clear(); lc.cajaSel.add(clave); }
  for (const k of [...lc.cajaSel]) if (!k.startsWith(t.v.pie + ':')) lc.cajaSel.delete(k);
  const pie = t.v.pie, cj = lc.caja[pie], idx = [...lc.cajaSel].map(k => +k.split(':')[1]);
  const P0 = pisoDelRaton(px, py); if (!P0) return { mover() {}, soltar() {} };
  const q0 = corteDeMundo(t.v, P0), antes = cj.ctrl.map(q => [...q]);
  // centro para girar y escalar: el de los puntos elegidos, o el del cuadro si es uno solo
  const C = idx.length > 1 ? [idx.reduce((a, i) => a + antes[i][0], 0) / idx.length, idx.reduce((a, i) => a + antes[i][1], 0) / idx.length]
    : [(cj.x0 + cj.x1) / 2, (cj.y0 + cj.y1) / 2];
  const r0 = [q0[0] - C[0], q0[1] - C[1]], eje = Math.abs(r0[0]) > Math.abs(r0[1]) ? 0 : 1;
  let guardado = false;
  lc.ultimo = pie;
  return {
    mover(x, y) {
      const P = pisoDelRaton(x, y); if (!P) return;
      if (!guardado) { lc.hist.push(copiaCorte()); guardado = true; pintarCorte(); }
      const q = corteDeMundo(t.v, P), r = [q[0] - C[0], q[1] - C[1]];
      for (const i of idx) {
        const a = antes[i]; let n;
        if (herr === 'mover') n = [a[0] + q[0] - q0[0], a[1] + q[1] - q0[1]];
        else if (herr === 'girar') {
          const g = Math.atan2(r[1], r[0]) - Math.atan2(r0[1], r0[0]), cg = Math.cos(g), sg = Math.sin(g), dx = a[0] - C[0], dy = a[1] - C[1];
          n = [C[0] + dx * cg - dy * sg, C[1] + dx * sg + dy * cg];
        } else if (herr === 'escala2') {
          const k = Math.hypot(r[0], r[1]) / Math.max(Math.hypot(r0[0], r0[1]), 1); n = [C[0] + (a[0] - C[0]) * k, C[1] + (a[1] - C[1]) * k];
        } else {
          const k = Math.abs(r0[eje]) > 1 ? r[eje] / r0[eje] : 1; n = [...a]; n[eje] = C[eje] + (a[eje] - C[eje]) * k;
        }
        cj.ctrl[i] = n;
      }
      aplicarCaja(pie); visor.pedir();
    },
    soltar() { visor.pedir(); },
  };
}
function dibujarCaja2D(c) {
  if (lc.modo !== 'caja' || !lc.caja) return;
  for (const v of enVista) {
    const cj = lc.caja[v.pie], S = cj.ctrl.map(q => visor.proyectar(corteAMundo(v, q))); if (S.some(s => !s)) continue;
    c.save(); c.setLineDash([2, 3]); c.strokeStyle = 'rgba(30,40,60,.55)'; c.lineWidth = 1;
    for (let j = 0; j < CAJA_FILAS; j++) { c.beginPath(); for (let k = 0; k < CAJA_COLS; k++) { const s = S[j * CAJA_COLS + k]; k ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y); } c.stroke(); }
    for (let k = 0; k < CAJA_COLS; k++) { c.beginPath(); for (let j = 0; j < CAJA_FILAS; j++) { const s = S[j * CAJA_COLS + k]; j ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y); } c.stroke(); }
    c.restore();
    S.forEach((s, i) => {
      const elegido = lc.cajaSel.has(v.pie + ':' + i);
      c.beginPath(); c.arc(s.x, s.y, elegido ? 5 : 4, 0, 7);
      c.fillStyle = elegido ? '#12b33c' : '#fff'; c.fill(); c.strokeStyle = elegido ? '#0a6b24' : '#1e2a3c'; c.lineWidth = 1.5; c.stroke();
    });
  }
  if (lc.lazo?.length > 1) {
    c.save(); c.setLineDash([4, 3]); c.strokeStyle = '#e0661b'; c.lineWidth = 1.5; c.beginPath();
    lc.lazo.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.stroke(); c.restore();
  }
}
document.querySelectorAll('[data-caja]').forEach(b => b.addEventListener('click', () => { if (lc) { lc.cajaHerr = b.dataset.caja; pintarCorte(); visor?.pedir(); } }));

function dibujarCorte2D(c) {
  if (!lc) return;
  if (dibujarPerfil2D(c)) return;
  dibujarContorno2D(c); dibujarCaja2D(c);
}
function dibujarContorno2D(c) {
  for (const v of enVista) {
    const S = lc.p[v.pie].map(p => visor.proyectar(corteAMundo(v, p))); if (S.some(s => !s)) return;
    c.strokeStyle = '#12b33c'; c.lineWidth = 2.5; c.beginPath();
    S.forEach((s, i) => (i ? c.lineTo(s.x, s.y) : c.moveTo(s.x, s.y))); c.closePath(); c.stroke();
    // región que se va a mover (con el ratón encima o moviéndose)
    const m = lc.mov, hov = lc.cursor?.hit;
    const centro = m && m.v.pie === v.pie ? m.i0 : lc.modo === 'region' && !m && hov?.v.pie === v.pie ? hov.i : null;
    if (centro != null) {
      const ac = m?.ac ?? largoAcum(lc.p[v.pie]), tot = ac[ac.length - 1], R = m?.R ?? Math.max(num('radioCorte') || 60, 5);
      c.strokeStyle = '#e0661b'; c.lineWidth = 4; c.beginPath(); let abierto = false;
      S.forEach((s, j) => {
        let d = Math.abs(ac[j] - ac[centro]); d = Math.min(d, tot - d);
        if (d < R) { if (abierto) c.lineTo(s.x, s.y); else { c.moveTo(s.x, s.y); abierto = true; } } else abierto = false;
      });
      c.stroke();
      c.fillStyle = '#e0661b'; c.beginPath(); c.arc(S[centro].x, S[centro].y, 5, 0, 7); c.fill();
    } else if (hov?.v.pie === v.pie) { c.fillStyle = '#e0661b'; c.beginPath(); c.arc(S[hov.i].x, S[hov.i].y, 5, 0, 7); c.fill(); }
    // trazo de la edición libre
    if (lc.trazo?.v.pie === v.pie) {
      c.strokeStyle = '#e0661b'; c.lineWidth = 2.5; c.beginPath();
      lc.trazo.pts.forEach((p, i) => { const s = visor.proyectar(corteAMundo(v, p)); if (i) c.lineTo(s.x, s.y); else c.moveTo(s.x, s.y); });
      c.stroke();
    }
  }
}
$('lineaCorte').addEventListener('click', () => (lc ? terminarCorte(false) : empezarCorte()));
document.querySelectorAll('[data-modo-corte]').forEach(b => b.addEventListener('click', () => { if (lc) { lc.modo = b.dataset.modoCorte; lc.mov = null; if (lc.modo === 'caja') { armarCajas(); visor?.vista('arriba'); } pintarCorte(); visor?.pedir(); } }));
$('corteCancelar').addEventListener('click', () => terminarCorte(false));
$('corteConfirmar').addEventListener('click', () => terminarCorte(true));
$('cortePaso').addEventListener('click', () => pasoAtrasCorte());
$('radioCorte').addEventListener('input', () => visor?.pedir());
function pasoAtrasCorte() { if (!lc?.hist.length) return; const h = lc.hist.pop(); lc.p = { izq: h.izq, der: h.der }; lc.perfil = h.perfil; lc.mov = null; if (lc.modo === 'caja') armarCajas(); lc.trazo = null; pintarCorte(); visor?.pedir(); }
// Reflejar (como LutraCAD): la línea del último pie editado pasa al otro, en espejo
$('corteReflejar').addEventListener('click', () => {
  if (!lc) return;
  const de = lc.ultimo, a = de === 'izq' ? 'der' : 'izq';
  // contorno y altura del borde (la altura va por lado interno/externo, así queda en espejo sola)
  lc.hist.push(copiaCorte()); lc.p[a] = lc.p[de].map(q => [...q]);
  // lo editado en esta sesión en el pie de origen pasa al otro (lo que cada pie ya tenía guardado se respeta)
  for (const l of ['interno', 'externo']) lc.perfil[a][l] = Float64Array.from(lc.perfil[de][l], (v, j) => lc.perfil0[a][l][j] + v - lc.perfil0[de][l][j]);
  lc.mov = null; if (lc.modo === 'caja') armarCajas(); pintarCorte(); visor?.pedir();
  mensaje(`Línea de corte del pie ${de === 'izq' ? 'izquierdo' : 'derecho'} reflejada en el ${a === 'izq' ? 'izquierdo' : 'derecho'}.`);
});
$('lienzo').addEventListener('pointermove', e => {
  if (!lc || e.buttons) return;
  const r = $('lienzo').getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  if (lc.mov?.siguiendo) { if (lc.mov.perfil) moverPerfil(px, py); else moverRegion(px, py); return; }
  lc.cursor = vistaCostado() ? { perfil: tocarPerfil(px, py) } : lc.modo === 'caja' ? {} : { hit: tocarCorte(px, py) }; visor.pedir();
});

// ---- Mover elementos con el ratón (módulos Base y Diseño) ----
// Se agarra el elemento que más sube en el punto tocado y se corre sobre un plano horizontal a la altura de ese
// punto. En el pie derecho "hacia interno" es hacia -X, porque es el espejo del izquierdo.
function agarrarElemento(px, py, ev) {
  if (fijoModulo() || !elegidos.length) return null;
  const toque = puntoDelClic(px, py); if (!toque) return null;
  const v = enVista.find(e => e.pie === toque.pie), g = v.g;
  let q0 = 0, dmin = Infinity;
  for (let q = 0; q < g.x.length; q++) { const dd = (g.x[q] - toque.x) ** 2 + (g.y[q] - toque.y) ** 2; if (dd < dmin) { dmin = dd; q0 = q; } }
  let k = -1, max = 0.3;   // menos de 0,3 mm de elemento en ese punto: no se agarra, la vista gira
  g.aportes.forEach((a, i) => { if (a[q0] > max) { max = a[q0]; k = i; } });
  if (k < 0) return null;
  const ref = g.p.elementos[k].ref, e = elegidos[ref], pie = toque.pie, otro = pie === 'izq' ? 'der' : 'izq';
  const inicio = [...e.mov[pie]], signo = pie === 'izq' ? 1 : -1;
  // qué hace arrastrar: lo elegido en el panel del elemento; Ctrl (o Alt) + arrastrar = girar, como antes
  const modo = ev?.ctrlKey || ev?.altKey ? 'girar' : modoElem, girar = modo === 'girar', giro0 = e.giro[pie], tam0 = [...e.tam[pie]];
  // centro del elemento (promedio pesado de lo que sube): ahí se gira y se agranda
  let cx = 0, cy = 0, sw = 0;
  { const a = g.aportes[k]; for (let q = 0; q < a.length; q++) if (a[q] > 0) { cx += a[q] * g.x[q]; cy += a[q] * g.y[q]; sw += a[q]; } cx /= sw; cy /= sw; }
  const a0 = Math.atan2(toque.x - cx, toque.y - cy);
  // eje largo del elemento en la plantilla (girado): en el derecho el interno es hacia -X
  const gr = (giro0 * Math.PI) / 180, eje = [signo * Math.sin(gr), Math.cos(gr)], perp = [eje[1], -eje[0]];
  const dX0 = toque.x - cx, dY0 = toque.y - cy, l0 = Math.abs(dX0 * eje[0] + dY0 * eje[1]), w0 = Math.abs(dX0 * perp[0] + dY0 * perp[1]), r0 = Math.hypot(dX0, dY0);
  const aLoLargo = l0 >= w0;   // Escala 1D: a lo largo si se agarró más hacia una punta, a lo ancho si hacia un costado
  activo = ref; activoPie = pie; refrescarPosiciones();
  document.querySelector('.visor').classList.add('moviendo');
  return {
    mover(mx, my) {
      const { o, d } = visor.rayo(mx, my); if (Math.abs(d[2]) < 1e-4) return;
      const t = (toque.z - o[2]) / d[2]; if (!(t > 0)) return;
      const X = o[0] + t * d[0] - v.ox, Y = o[1] + t * d[1];
      const tamOk = v => Math.max(40, Math.min(250, Math.round(v)));
      if (modo === 'escala2' && r0 > 1) {
        const f = Math.hypot(X - cx, Y - cy) / r0;
        e.tam[pie] = [tamOk(tam0[0] * f), tamOk(tam0[1] * f)];
        if ($('moverJuntos').checked) e.tam[otro] = [...e.tam[pie]];
      } else if (modo === 'escala1') {
        const dx = X - cx, dy = Y - cy;
        if (aLoLargo && l0 > 1) e.tam[pie] = [tamOk(tam0[0] * Math.abs(dx * eje[0] + dy * eje[1]) / l0), tam0[1]];
        else if (w0 > 1) e.tam[pie] = [tam0[0], tamOk(tam0[1] * Math.abs(dx * perp[0] + dy * perp[1]) / w0)];
        if ($('moverJuntos').checked) e.tam[otro] = [...e.tam[pie]];
      } else if (girar) {
        // ángulo alrededor del centro del elemento, medido en la pantalla del plano; en el pie derecho el
        // sentido se invierte porque es el espejo
        const a = Math.atan2(X - cx, Y - cy), d = ((a - a0) * 180) / Math.PI;
        let gnuevo = giro0 + signo * d;
        gnuevo = ((gnuevo + 540) % 360) - 180;
        e.giro[pie] = Math.max(-90, Math.min(90, Math.round(gnuevo)));
        if ($('moverJuntos').checked) e.giro[otro] = e.giro[pie];
      } else {
        // de medio en medio milímetro, como en la biblioteca
        const r = val => Math.max(-80, Math.min(80, Math.round(val * 2) / 2));
        e.mov[pie] = [r(inicio[0] + (Y - toque.y)), r(inicio[1] + signo * (X - toque.x))];
        if ($('moverJuntos').checked) e.mov[otro] = [...e.mov[pie]];
      }
      refrescarPosiciones(); pedir();
    },
    soltar() { document.querySelector('.visor').classList.remove('moviendo'); },
  };
}

// ---- Panel del elemento elegido (como "Configuración de recursos" de LutraCAD) ----
function pintarPanelElemento() {
  // al cargar la página puede llamarse antes de que existan modulo / lc (están más abajo): entonces no hace nada
  let si;
  try { si = !!elegidos[activo] && !fijoModulo() && !lc; } catch (err) { if (err instanceof ReferenceError) return; throw err; }
  const e = elegidos[activo];
  $('panelElemento').hidden = !si; pintarPanelPlantilla(); if (!si) return;
  const p = activoPie, def = catalogo.find(x => x.id === e.id);
  $('peNombre').textContent = def?.nombre ?? e.id;
  // en una descarga el número es la profundidad
  $('peAltura').closest('label').firstChild.textContent = def?.descarga ? 'Profundidad ' : 'Altura ';
  $('pePie').textContent = `· pie ${p === 'izq' ? 'izquierdo' : 'derecho'}${$('moverJuntos').checked ? ' (y el otro igual)' : ''}`;
  for (const [id, v] of [['peAltura', e[p]], ['peGiro', e.giro[p]], ['peLargo', e.tam[p][0]], ['peAncho', e.tam[p][1]]])
    if (document.activeElement !== $(id)) $(id).value = fmtMov(v);
  document.querySelectorAll('[data-modo-elem]').forEach(b => b.classList.toggle('activo', b.dataset.modoElem === modoElem));
  $('peBiblioteca').disabled = !inicio?.agregarABiblioteca;
}
document.querySelectorAll('[data-modo-elem]').forEach(b => b.addEventListener('click', () => { modoElem = b.dataset.modoElem; pintarPanelElemento(); }));
for (const [id, poner] of [
  ['peAltura', (e, p, v) => { e[p] = Math.max(0, Math.min(15, v)); }],
  ['peGiro', (e, p, v) => { e.giro[p] = Math.max(-90, Math.min(90, v)); }],
  ['peLargo', (e, p, v) => { e.tam[p] = [Math.max(40, Math.min(250, v)), e.tam[p][1]]; }],
  ['peAncho', (e, p, v) => { e.tam[p] = [e.tam[p][0], Math.max(40, Math.min(250, v))]; }],
]) $(id).addEventListener('input', () => {
  const e = elegidos[activo], v = parseFloat($(id).value); if (!e || !Number.isFinite(v)) return;
  poner(e, activoPie, v);
  if ($('moverJuntos').checked) poner(e, activoPie === 'izq' ? 'der' : 'izq', v);
  pintarElementos(); pedir();
});
// Reflejar: lo de este pie (altura, posición, giro y tamaño) pasa al otro, en espejo
$('peReflejar').addEventListener('click', () => {
  const e = elegidos[activo]; if (!e) return;
  const de = activoPie, a = de === 'izq' ? 'der' : 'izq';
  e[a] = e[de]; e.mov[a] = [...e.mov[de]]; e.giro[a] = e.giro[de]; e.tam[a] = [...e.tam[de]];
  pintarElementos(); pedir(); mensaje(`Elemento reflejado del pie ${de === 'izq' ? 'izquierdo' : 'derecho'} al ${a === 'izq' ? 'izquierdo' : 'derecho'}.`);
});
$('peBorrar').addEventListener('click', () => { if (activo < 0) return; elegidos.splice(activo, 1); activo = -1; abiertos.clear(); pintarElementos(); pedir(); });
// Añadir a la biblioteca: queda como elemento propio con el tamaño, giro, posición y altura de este pie
$('peBiblioteca').addEventListener('click', async () => {
  const e = elegidos[activo]; if (!e || !inicio?.agregarABiblioteca) return;
  const base = catalogo.find(x => x.id === e.id), p = activoPie;
  const nombre = prompt('Nombre del elemento en la biblioteca:', `${base.nombre} (${e[p]} mm)`); if (!nombre?.trim()) return;
  const def = JSON.parse(JSON.stringify(base)); delete def.propio;
  def.id = 'propio_' + nombre.normalize('NFD').replace(/[^\w]+/g, '_').toLowerCase().slice(0, 30) + '_' + Date.now().toString(36);
  def.nombre = nombre.trim();
  def.inicial = { altura: e[p], mov: [...e.mov[p]], giro: e.giro[p], tam: [...e.tam[p]] };
  try { await inicio.agregarABiblioteca(def); mensaje(`"${def.nombre}" quedó en la biblioteca (con su tamaño, giro y posición).`); }
  catch (err) { mensaje('No se pudo guardar en la biblioteca: ' + err.message, false); }
});

// ---- Plantilla elegida (Ernesto, 2026-11-16) ----
// Clic en una plantilla (fuera de los elementos) la elige: aparece su panel con "Línea de corte" y "Reflejar", como
// en LutraCAD. Clic en el fondo o Esc la suelta.
let plantillaElegida = null;
const nombrePie = p => (p === 'izq' ? 'izquierda' : 'derecha');
function pintarPanelPlantilla() {
  let si;
  try { si = !!plantillaElegida && !elegidos[activo] && !fijoModulo() && !lc; } catch (err) { if (err instanceof ReferenceError) return; throw err; }
  $('panelPlantilla').hidden = !si; if (!si) return;
  const de = plantillaElegida, a = de === 'izq' ? 'der' : 'izq';
  $('ppNombre').textContent = `Plantilla ${nombrePie(de)}`;
  $('ppReflejar').textContent = `Reflejar en la ${nombrePie(a)}`;
  $('ppReflejar').title = `La plantilla ${nombrePie(a)} queda igual a la ${nombrePie(de)}, en espejo`;
  $('ppNota').textContent = `Reflejar copia a la ${nombrePie(a)} solo la plantilla: alturas, línea de corte y altura del borde. Los elementos no cambian (cada uno se refleja desde su panel). Se deshace con Ctrl+Z.`;
}
function elegirPlantilla(px, py) {
  const p = puntoDelClic(px, py);
  // sobre un elemento: el clic es del elemento (ya quedó elegido al agarrarlo)
  if (p) {
    const v = enVista.find(e => e.pie === p.pie), g = v.g; let q0 = 0, dmin = Infinity;
    for (let q = 0; q < g.x.length; q++) { const dd = (g.x[q] - p.x) ** 2 + (g.y[q] - p.y) ** 2; if (dd < dmin) { dmin = dd; q0 = q; } }
    if (g.aportes.some(ap => ap[q0] > 0.3)) { plantillaElegida = null; pintarPanelPlantilla(); return; }
    activo = -1; refrescarPosiciones();
  }
  plantillaElegida = p ? p.pie : null; pintarPanelPlantilla();
}
function reflejarPlantilla(de) {
  const a = de === 'izq' ? 'der' : 'izq';
  // valores por pie: quedan iguales (los del pie de origen) y el candado se cierra
  for (const id of POR_PIE) if (separado.has(id)) { if (de === 'der') $(id).value = $(id + 'Der').value; ponerSeparado(id, false); }
  // los elementos no: lo elegido es la plantilla (Ernesto, 2026-11-16); cada elemento se refleja desde su panel
  // línea de corte: la del derecho propia (puntosDer) se quita o pasa a ser la de los dos
  if (contornoActual?.puntosDer) {
    if (de === 'der') {
      const h = hormaDe(hormaId(), contornoActual), hD = hormaDe(hormaId(), { puntos: contornoActual.puntosDer });
      $('largo').value = Math.round(num('largo') * hD.largo / h.largo * 10) / 10; $('talla').value = tallaDeLargo(num('largo')); pintarNotaLargo();
      if (!$('anchoAuto').checked) $('ancho').value = (num('ancho') * hD.ancho / h.ancho).toFixed(2);
      contornoActual = { ...contornoActual, puntos: contornoActual.puntosDer };
    }
    contornoActual = { ...contornoActual }; delete contornoActual.puntosDer; pintarContorno();
  }
  // altura del borde editada (va por lado interno/externo: queda en espejo sola)
  if (alturaBordeActual) alturaBordeActual = { ...alturaBordeActual, [a]: alturaBordeActual[de] ? JSON.parse(JSON.stringify(alturaBordeActual[de])) : null };
  pintarElementos(); pedir();
  mensaje(`Plantilla ${nombrePie(de)} reflejada en la ${nombrePie(a)} (alturas, línea de corte y altura del borde; los elementos no cambian). Se deshace con Ctrl+Z.`);
}
$('ppReflejar').addEventListener('click', () => { if (plantillaElegida) reflejarPlantilla(plantillaElegida); });
$('ppCorte').addEventListener('click', () => { if (!lc) empezarCorte(); });
$('ppCerrar').addEventListener('click', () => { plantillaElegida = null; pintarPanelPlantilla(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && plantillaElegida && !lc) { plantillaElegida = null; pintarPanelPlantilla(); } });

// ---- Módulos (como LutraCAD, 2026-11-17): 1. Base y 2. Diseño se editan y la plantilla se ve como lámina;
// 3. EVA o Imprimir (según el método de producción) y 4. Exportar dejan el diseño fijo y la muestran sólida ----
let modulo = 'base';
const fijoModulo = () => modulo === 'exportar' || modulo === 'produccion';
const enLamina = () => modulo === 'base' || modulo === 'diseno';
const NOTAS = {
  base: 'Paciente, talla y alturas. Los elementos se pueden arrastrar en el 3D. La plantilla se ve como lámina.',
  diseno: 'Agregue elementos y arrástrelos en el 3D para ubicarlos (Ctrl + arrastrar para girarlos).',
  produccion: 'Diseño fijo: la plantilla se ve sólida, como sale de la máquina. Ajustes de la producción.',
  exportar: 'Diseño fijo: los elementos ya no se mueven. Revise las medidas y exporte.',
};
function ponerModulo(m) {
  const antes = modulo; modulo = m;
  document.querySelectorAll('[data-modulo]').forEach(b => { b.classList.toggle('activo', b.dataset.modulo === m); b.setAttribute('aria-selected', b.dataset.modulo === m); });
  document.querySelectorAll('aside [data-en]').forEach(s => { s.hidden = !s.dataset.en.split(' ').includes(m); });
  pintarModuloProduccion();
  $('notaModulo').textContent = NOTAS[m];
  // con el diseño fijo: si se estaba editando la línea de corte, se guarda lo hecho y se cierra
  // (auditoría 2026-11-16: quedaba abierta y se podía seguir editando en Exportar)
  if (fijoModulo()) { if (lc) terminarCorte(true); activo = -1; plantillaElegida = null; refrescarPosiciones(); }
  pintarPanelElemento(); bloquearMedidas();
  // lámina ↔ sólido: se vuelve a dibujar
  if (antes !== m && (antes === 'base' || antes === 'diseno') !== enLamina()) pedir();
}
document.querySelectorAll('[data-modulo]').forEach(b => b.addEventListener('click', () => ponerModulo(b.dataset.modulo)));
ponerModulo('base');
document.querySelectorAll('[data-herr]').forEach(b => b.addEventListener('click', () => usarHerramienta(b.dataset.herr)));
function usarHerramienta(h) {
  // medir y corte usan el clic: prender uno apaga el otro
  if (h === 'medir' || h === 'corte' || h === 'regla') {
    const prender = !{ medir: midiendo, corte: cortando, regla: reglando }[h];
    midiendo = prender && h === 'medir'; cortando = prender && h === 'corte'; reglando = prender && h === 'regla';
    // una regla a medio poner (un solo punto) se descarta al apagar la herramienta
    if (!reglando && reglas.length && !reglas[reglas.length - 1].b) { reglas.pop(); visor?.pedir(); }
    for (const [k, si] of [['medir', midiendo], ['corte', cortando], ['regla', reglando]])
      document.querySelector(`[data-herr=${k}]`).classList.toggle('activo', si);
    document.querySelector('.visor').classList.toggle('midiendo', midiendo || reglando);
    document.querySelector('.visor').classList.toggle('cortando', cortando);
    return;
  }
  // los dos mapas se excluyen: elegir uno apaga el otro
  ponerMapa(modoMapa === (h === 'mapa' ? 'alturas' : 'ajuste') ? null : (h === 'mapa' ? 'alturas' : 'ajuste'));
}
const rgb = c => `rgb(${c.map(v => Math.round(v * 255)).join(',')})`;
function ponerMapa(m) {
  modoMapa = m;
  document.querySelector('[data-herr=mapa]').classList.toggle('activo', m === 'alturas');
  document.querySelector('[data-herr=ajuste]').classList.toggle('activo', m === 'ajuste');
  $('leyenda').hidden = !m;
  // leyenda: de arriba a abajo
  if (m === 'alturas') $('leyenda').innerHTML = `<div class="escala" style="background:linear-gradient(to top, ${PASOS_MAPA.map(rgb).join(',')})"></div>` +
    [ALTO_MAPA, 16, 12, 8, 4, 0].map(v => `<span>${v === ALTO_MAPA ? v + '+ ' : v + ' '}mm</span>`).join('');
  if (m === 'ajuste') $('leyenda').innerHTML = `<div class="escala" style="background:linear-gradient(to top, ${rgb(PASOS_AJUSTE[0])} 0%, ${rgb(PASOS_AJUSTE[1])} 33%, ${rgb(PASOS_AJUSTE[2])} 100%)"></div>` +
    ['+6 hueco', '+4', '+2', '0 toca', '−1,5', '−3 más alta'].map(v => `<span>${v} mm</span>`).join('');
  pedir();
}
$('borrarMedidas').addEventListener('click', () => { medidasTomadas = []; reglas = []; reglaElegida = null; $('borrarMedidas').hidden = true; visor?.pedir(); });

// ---- Vistas ----
document.querySelectorAll('[data-vista]').forEach(b => b.addEventListener('click', () => visor?.vista(b.dataset.vista)));
// cubo de vistas (como Bambu Studio) y perspectiva
if (visor) crearCubo($('cuboVistas'), visor);
$('perspectiva').addEventListener('click', () => {
  const si = !$('perspectiva').classList.contains('activo');
  $('perspectiva').classList.toggle('activo', si); visor?.perspectivaSiNo(si);
});
// mostrar u ocultar cada pie (al menos uno queda a la vista)
document.querySelectorAll('[data-ver-pie]').forEach(b => b.addEventListener('click', () => {
  const otro = document.querySelector(`[data-ver-pie="${b.dataset.verPie === 'izq' ? 'der' : 'izq'}"]`);
  if (b.classList.contains('activo') && !otro.classList.contains('activo')) otro.classList.add('activo');
  b.classList.toggle('activo');
  const iz = document.querySelector('[data-ver-pie="izq"]').classList.contains('activo'), de = document.querySelector('[data-ver-pie="der"]').classList.contains('activo');
  pies = iz && de ? 'ambos' : iz ? 'izq' : 'der'; cambioPies = true; pedir();
}));

// ---- Archivos ----
const mensaje = (texto, ok = true) => { const m = $('mensaje'); m.textContent = texto; m.className = 'mensaje ' + (ok ? 'ok' : 'mal'); };
let inicio = null;   // pantalla de inicio y carpeta de trabajo (inicio.js); se crea al final
// deja la pantalla sin paciente: sin escaneo, muestra, contorno, elementos ni orden
function limpiarPaciente() {
  escaneos.izq = null; escaneos.der = null; contornoActual = null; alturaBordeActual = null; pintarContorno();
  elegidos = []; activo = -1; abiertos.clear(); ordenActual = null; pintarOrden(); pintarElementos();
  muestra = null; muestrasCarpeta = []; $('datosMuestra').hidden = true; pintarListaMuestras();
  pintarEscaneo(); document.querySelector('[data-herr=ajuste]').hidden = true;
}
function nombreBase(d) {
  const limpio = s => s.normalize('NFC').replace(/[^\p{L}\p{N} _.-]/gu, '').replace(/\s+/g, ' ').trim();
  const prod = d.producto === 'resina' ? 'resina' : d.producto;
  const t = d.talla == null ? d.largo + 'mm' : d.cuadro === 'hombre' ? `US${d.talla}H` : d.cuadro === 'dama' ? `US${d.talla}D` : 'T' + d.talla;
  return limpio(`${d.paciente || 'sin nombre'} ${prod} ${t}`);
}
// Los archivos que se generan van a la carpeta del proyecto, en la carpeta de trabajo compartida (OneDrive)
async function guardar(nombre, cuerpo) { await inicio.guardarArchivo(nombre, cuerpo); }
// con un casillero fuera de rango la pantalla muestra lo último válido: no se exporta eso (auditoría 2026-11-18)
function hayFueraDeRango() {
  const f = valoresFuera();
  // y la plantilla que de verdad se exporta (QA-02: una receta con ancho 99999 daba 99998 mm de antepié)
  // los dos pies (QA-02c: con línea de corte propia el derecho puede salir distinto)
  for (const [pie, m] of [['izq', actual?.m], ['der', actual?.mDer ?? actual?.m]]) {
    if (!m) continue;
    if (!(m.anchoAntepie >= 40 && m.anchoAntepie <= 140)) f.push(`Ancho antepié de la plantilla ${pie} (${f1(m.anchoAntepie)} mm; de 40 a 140)`);
    if (!(m.anchoTalon >= 30 && m.anchoTalon <= 110)) f.push(`Ancho talón de la plantilla ${pie} (${f1(m.anchoTalon)} mm; de 30 a 110)`);
  }
  if (f.length) mensaje("No se exportó: revise " + f.join(", ") + ".", false); return f.length > 0; }
const dondeSeGuarda = () => inicio?.carpetaProyecto() ?? '';

$('exportar').addEventListener('click', async () => {
  if (!actual || hayFueraDeRango()) return;
  try {
    const base = nombreBase(actual.d), archivos = [`${base} izq.stl`, `${base} der.stl`, `${base} receta.json`];
    for (const lado of ['izq', 'der']) {
      const nombre = `${base} ${lado}.stl`;
      await guardar(nombre, aSTL(solido(actual[lado]), nombre));
    }
    await guardar(`${base} receta.json`, JSON.stringify({ ...actual.d, fecha: new Date().toISOString() }, null, 2));
    await inicio.exportado(archivos);
    mensaje(`Guardados en ${dondeSeGuarda()}: "${base} izq.stl", "${base} der.stl" y la receta.`);
    marcarExportado();
  } catch (e) { mensaje('No se guardó: ' + e.message, false); }
});

// ---- G-code para la fresadora de EVA (Sensor Medica VX1R con EdingCNC; Ernesto 2026-11-17) ----
// El par en un bloque de 350 × 260 mm, como los trabajos que ya fresa la máquina (motor/fresado.js). Se guarda como
// .iso en la carpeta del proyecto, junto a los STL.
$('exportarGcode').addEventListener('click', async () => {
  if (!actual || hayFueraDeRango()) return;
  try {
    // auditoría 2026-11-18: vacío o con letras ya no se toma 26 por su cuenta; se pide el alto real del bloque
    const alto = parseFloat($('altoBloque').value), base = nombreBase(actual.d);
    if (!Number.isFinite(alto) || alto < 10 || alto > 60) { mensaje('No se generó el G-code: escriba el alto real del bloque de EVA (de 10 a 60 mm).', false); $('altoBloque').focus(); return; }
    const r = gcodeEVA(actual.izq, actual.der, { nombre: base, bloque: { alto } });
    if (r.avisos.length) { mensaje('No se generó el G-code: ' + r.avisos.join(' '), false); return; }
    const nombre = `${base} fresadora.iso`;
    await guardar(nombre, r.texto);
    mensaje(`Guardado en ${dondeSeGuarda()}: "${nombre}" (${r.lineas.toLocaleString('es')} líneas, alto máximo ${r.alturaMax.toFixed(1).replace('.', ',')} mm). Antes de fresar: revíselo en la vista de EdingCNC y páselo primero en el aire.`);
  } catch (e) { mensaje('No se generó el G-code: ' + e.message, false); }
});

// ---- Hoja del diseño ----
// Página para imprimir o guardar en PDF: paciente, medidas, elementos por pie, avisos y tres vistas del 3D.
// Se guarda en salida/ junto a los STL y se abre en otra pestaña.
function hojaHTML() {
  const d = actual.d, m = actual.m, prod = producto();
  // valores distintos por pie: "izq / der"
  const dd = { ...d, ...d.der }, mDer = actual.mDer ?? m;
  const dosH = (f, k) => d.der && dd[k] !== d[k] ? `${f(d[k])} izq / ${f(dd[k])} der` : f(d[k]);
  const dosM = (f, k) => d.der ? `${f(m[k])} izq / ${f(mDer[k])} der` : f(m[k]);
  const volPar = volumen(solido(actual.izq)) + volumen(solido(actual.der));
  const vistas = visor ? [['3D', visor.captura('3d')], ['Arriba', visor.captura('arriba')], ['Lado', visor.captura('lado')]] : [];
  const fila = (a, b) => `<tr><th>${esc(a)}</th><td>${esc(b)}</td></tr>`;
  const ajustes = (e, p) => {
    const t = [];
    if (e.mov[p][0]) t.push(`${e.mov[p][0] > 0 ? '+' : ''}${fmtMov(e.mov[p][0])} mm a los dedos`);
    if (e.mov[p][1]) t.push(`${e.mov[p][1] > 0 ? '+' : ''}${fmtMov(e.mov[p][1])} mm a interno`);
    if (e.giro[p]) t.push(`giro ${e.giro[p]}°`);
    if (e.tam[p][0] !== 100 || e.tam[p][1] !== 100) t.push(`tamaño ${e.tam[p][0]} × ${e.tam[p][1]} %`);
    return t.join(', ') || 'en su lugar';
  };
  const elementos = d.elementos.length ? d.elementos.map(e => `<tr><td>${esc(nombreElemento(e.id))}</td><td>${f1(e.izq)} mm</td><td>${esc(ajustes(e, 'izq'))}</td><td>${f1(e.der)} mm</td><td>${esc(ajustes(e, 'der'))}</td></tr>`).join('')
    : '<tr><td colspan="5">Sin elementos.</td></tr>';
  const avisos = [...document.querySelectorAll('#avisos li')].map(li => li.textContent).filter(t => t !== 'Sin observaciones.');
  const escTxt = d.escaneo ? [d.escaneo.izq, d.escaneo.der].filter(Boolean).join(', ') : 'sin escaneo';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Hoja de diseño ${esc(d.paciente || '')}</title>
<style>
  body { font: 13px/1.45 system-ui, "Segoe UI", sans-serif; color: #1c2430; margin: 24px; background: #fff; }
  h1 { font-size: 20px; margin: 0 0 2px; } .sub { color: #5d6878; margin-bottom: 14px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  table { border-collapse: collapse; width: 100%; } th, td { text-align: left; padding: 4px 6px; border-bottom: 1px solid #e3e7ec; vertical-align: top; }
  th { color: #5d6878; font-weight: 600; width: 45%; } h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #5d6878; margin: 16px 0 6px; }
  .vistas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 8px; }
  .vistas figure { margin: 0; border: 1px solid #e3e7ec; border-radius: 8px; background: #f3f5f8; }
  .vistas img { width: 100%; display: block; } .vistas figcaption { padding: 4px 8px; color: #5d6878; }
  .aviso { background: #fff6dc; border: 1px solid #e6c25a; border-radius: 6px; padding: 5px 8px; margin: 4px 0; }
  .firma { margin-top: 28px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; } .firma div { border-top: 1px solid #1c2430; padding-top: 4px; color: #5d6878; }
  .imprimir { position: fixed; top: 14px; right: 14px; height: 34px; padding: 0 14px; border-radius: 6px; border: 0; background: #1d5fbf; color: #fff; font-weight: 600; cursor: pointer; }
  @media print { .imprimir { display: none; } body { margin: 10mm; } }
</style></head><body>
<button class="imprimir" onclick="print()">Imprimir / guardar PDF</button>
<h1>${esc(d.paciente || 'Paciente sin nombre')}</h1>
<div class="sub">${esc(prod.nombre)} · ${new Date().toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' })}</div>
<div class="grid">
  <div><h2>Plantilla</h2><table>
    ${fila('Talla', d.talla ? `${CUADROS[d.cuadro]?.tallas.find(t => t.talla === String(d.talla))?.corta ?? d.talla} (${d.largo} mm${margenPulido() ? `, con ${margenPulido()} mm para pulir` : ''})` : 'personalizada')}${fila('Largo', f1(m.largo) + ' mm')}
    ${fila('Ancho antepié', f1(m.anchoAntepie) + ' mm')}${fila('Ancho talón', f1(m.anchoTalon) + ' mm')}
    ${fila('Copa del talón', dosH(f1, 'copa') + ' mm')}${fila('Espesor antepié', dosH(f2, 'antepie') + ' mm')}
    ${fila('Arco', `${dosM(f1, 'arco')} mm a ${dosM(v => String(Math.round(v * 100)), 'arcoDesdeTalon')} % del talón`)}${fila('Canto del borde', dosH(f1, 'canto') + ' mm')}
    ${fila('Material del par', f1(volPar) + ' cm³' + (prod.densidad ? ` · ${Math.round(volPar * prod.densidad)} g macizo` : ''))}${fila('Escaneo', escTxt)}${fila('Horma', hormaInfo[d.horma]?.nombre ?? hormaInfo[prod.horma]?.nombre ?? '')}${fila('Forma', d.contorno ? 'contorno de la muestra ' + d.contorno.archivo : 'la de la horma')}
  </table></div>
  <div><h2>Revisión</h2>${avisos.length ? avisos.map(a => `<div class="aviso">${esc(a)}</div>`).join('') : '<p>Sin observaciones.</p>'}</div>
</div>
<h2>Elementos</h2>
<table><tr><th style="width:auto">Elemento</th><th style="width:auto">Izq</th><th style="width:auto">Ubicación izq</th><th style="width:auto">Der</th><th style="width:auto">Ubicación der</th></tr>${elementos}</table>
<div class="vistas">${vistas.map(([t, u]) => `<figure><img src="${u}" alt="Vista ${t}"><figcaption>${t}</figcaption></figure>`).join('')}</div>
<div class="firma"><div>Diseñó</div><div>Revisó</div></div>
</body></html>`;
}
$('hojaDiseno').addEventListener('click', async () => {
  if (!actual || hayFueraDeRango()) return;
  const ventana = window.open('', '_blank');   // se abre ya (dentro del clic) para que el navegador no la bloquee
  try {
    const nombre = `${nombreBase(actual.d)} hoja.html`, html = hojaHTML();
    await guardar(nombre, html);
    if (ventana) { ventana.document.open(); ventana.document.write(html); ventana.document.close(); }
    mensaje(`Hoja guardada en ${dondeSeGuarda()}: "${nombre}". En la pestaña nueva se imprime o se guarda en PDF.`);
  } catch (e) { ventana?.close(); mensaje('No se guardó: ' + e.message, false); }
});

$('guardarReceta').addEventListener('click', async () => {
  if (!actual || hayFueraDeRango()) return;
  try {
    const nombre = `${nombreBase(actual.d)} receta.json`;
    await guardar(nombre, JSON.stringify({ ...actual.d, fecha: new Date().toISOString() }, null, 2));
    mensaje(`Receta guardada en ${dondeSeGuarda()}: "${nombre}".`);
  } catch (e) { mensaje('No se guardó: ' + e.message, false); }
});

$('abrirReceta').addEventListener('click', () => $('archivoReceta').click());
$('archivoReceta').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const r = JSON.parse(await f.text()), desconocidos = aplicarReceta(r);
    mensaje(`Receta abierta: ${f.name}` + (desconocidos.length ? `. Elementos que no existen y se omitieron: ${desconocidos.join(', ')}` : '') +
      (r.escaneo ? `. Escaneo usado: ${[r.escaneo.izq, r.escaneo.der].filter(Boolean).join(' y ')} (ábralo de la carpeta del paciente).` : ''), !desconocidos.length);
  } catch (err) { mensaje('No se pudo abrir la receta: ' + err.message, false); }
  e.target.value = '';
});

// Auditoría 2026-11-16: una receta dañada (a mano, de otra versión o cortada) dejaba la pantalla a medio cargar
// (largo y copa en blanco) o el programa trabado (línea de corte rota). Ahora se limpia antes de usarla: lo que no
// tiene el formato esperado se descarta, y si igual falla, la pantalla vuelve al diseño que estaba.
const esObj = v => v && typeof v === 'object' && !Array.isArray(v);
const numFin = v => typeof v === 'number' ? Number.isFinite(v) : typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v);
function puntosValidos(P) {
  if (!Array.isArray(P) || P.length < 20 || !P.every(p => Array.isArray(p) && numFin(p[0]) && numFin(p[1]))) return false;
  const xs = P.map(p => +p[0]), ys = P.map(p => +p[1]);
  return Math.max(...xs) - Math.min(...xs) > 20 && Math.max(...ys) - Math.min(...ys) > 80;
}
function limpiarReceta(r) {
  if (!esObj(r)) throw new Error('el archivo no es una receta del programa');
  const c = { ...r };
  for (const k of ['largo', 'ancho', 'copa', 'antepie', 'arco', 'arcoPos', 'canto', 'escalaTalon', 'contacto'])
    if (c[k] != null && !numFin(c[k])) delete c[k]; else if (c[k] != null) c[k] = +c[k];
  if (c.der != null) {
    if (!esObj(c.der)) delete c.der;
    else c.der = Object.fromEntries(Object.entries(c.der).filter(([k, v]) => POR_PIE.includes(k) && numFin(v)).map(([k, v]) => [k, +v]));
  }
  if (c.separados != null && !(Array.isArray(c.separados) && c.separados.every(s => typeof s === 'string'))) delete c.separados;
  c.elementos = Array.isArray(c.elementos) ? c.elementos.filter(e => esObj(e) && typeof e.id === 'string') : [];
  if (c.contorno != null) {
    if (!esObj(c.contorno) || !puntosValidos(c.contorno.puntos)) c.contorno = null;
    else if (c.contorno.puntosDer != null && !puntosValidos(c.contorno.puntosDer)) { c.contorno = { ...c.contorno }; delete c.contorno.puntosDer; }
  }
  if (c.alturaBorde != null) {
    const lado = v => esObj(v) && ['interno', 'externo'].every(l => v[l] == null || (Array.isArray(v[l]) && v[l].every(numFin))) ? v : null;
    c.alturaBorde = esObj(c.alturaBorde) ? { izq: lado(c.alturaBorde.izq), der: lado(c.alturaBorde.der) } : null;
  }
  if (c.talla != null && typeof c.talla !== 'string' && typeof c.talla !== 'number') delete c.talla;
  if (c.cuadro != null && !CUADROS[c.cuadro]) delete c.cuadro;
  if (c.paciente != null && typeof c.paciente !== 'string') c.paciente = String(c.paciente);
  // correcciones (auditoría 2026-11-18): dos números por corrección, dentro de los límites del panel
  if (c.correcciones != null) {
    const par = (v, lo, hi) => Array.isArray(v) ? [0, 1].map(k => numFin(v[k]) ? Math.min(Math.max(+v[k], lo), hi) : 0) : [0, 0];
    c.correcciones = esObj(c.correcciones) ? { arcoMedial: par(c.correcciones.arcoMedial, -10, 15), moverApice: par(c.correcciones.moverApice, -40, 40) } : null;
  }
  if (c.orden != null && !esObj(c.orden)) c.orden = null;
  // ancho de la receta (QA-02): fuera de lo posible se rechaza la receta, no se genera una plantilla gigante
  if (c.ancho != null && !(c.ancho >= 40 && c.ancho <= 160)) throw new Error(`ancho fuera de rango en la receta (${c.ancho} mm; de 40 a 160)`);
  return c;
}
// Pone en la pantalla un diseño (receta). Lo usan abrir receta, deshacer/rehacer, recuperar y la orden del
// doctor. Devuelve los elementos que no existen en la biblioteca (se omiten).
function aplicarReceta(r) {
  const limpia = limpiarReceta(r), antes = actual ? diseno() : null;
  try { return aplicarRecetaSinRed(limpia); }
  catch (err) {
    if (antes) { try { aplicarRecetaSinRed(limpiarReceta(antes)); } catch { /* queda lo que se pudo */ } }
    throw err;
  }
}
function aplicarRecetaSinRed(r) {
  if (!bib.productos.some(p => p.id === r.producto)) throw new Error('producto desconocido: ' + r.producto);
  const prod = bib.productos.find(p => p.id === r.producto);
  $('paciente').value = r.paciente ?? ''; $('producto').value = r.producto;
  // recetas de antes de la biblioteca de hormas (2026-11-16): la horma del producto
  $('horma').value = hormas[r.horma] ? r.horma : prod.horma;
  // tipo de diseño (2026-11-16); en recetas de antes sale de la horma, de la copa o del producto
  // (en recetas de antes la copa guardada manda: la guía de tallas ahora es estándar, pero una resina vieja con copa
  // 10 sigue siendo delgada)
  const tipoD = [r.tipoDiseno, r.copa != null ? (r.copa >= 12 ? 'estandar' : 'delgado') : null, hormaInfo[hormaId()]?.tipo, prod.tipo]
    .find(t => t && bib.tiposHorma?.[t]?.copa);
  if (tipoD) $('tipoDiseno').value = tipoD;
  const tH = tipoHorma(), vH = hormaInfo[hormaId()]?.valores ?? {};
  // recetas de antes del 2026-11-13: talla en número = tabla Baroflex (EU)
  if (r.cuadro || typeof r.talla === 'number') ponerCuadro(r.cuadro ?? 'eu');
  ponerMedidaDesde(r.medidaDesde ?? (r.escaneo || r.contorno ? 'muestra' : 'guia'), false);
  if (r.largo != null) $('largo').value = r.largo; else if (r.talla != null) ponerTalla(r.talla);
  const tr = r.talla == null ? null : String(r.talla);
  $('talla').value = tallas.some(t => t.talla === tr && t.largo + margenPulido() === +$('largo').value) ? tr : tallaDeLargo(+$('largo').value);
  pintarNotaLargo();
  $('anchoAuto').checked = r.ancho == null; if (r.ancho != null) $('ancho').value = r.ancho;
  $('copa').value = r.copa ?? vH.copa ?? tH?.copa ?? prod.copa; $('antepie').value = r.antepie ?? vH.antepie ?? tH?.antepie ?? prod.antepie; $('canto').value = r.canto ?? prod.canto ?? 1.2;
  // tipo de arco (2026-11-16): recetas de antes sin arco = proporcional a la copa (como se hicieron); con arco = a mano
  $('tipoArco').value = TIPOS_ARCO[r.tipoArco] || ['mano', 'horma'].includes(r.tipoArco) ? r.tipoArco : r.arco == null ? 'horma' : 'mano';
  if (r.arco != null) $('arco').value = r.arco;
  escalaTalon = r.escalaTalon > 0 ? Math.min(Math.max(+r.escalaTalon, 0.6), 1.5) : null; talonPedido = null; $('anchoTalonAuto').checked = !escalaTalon;
  $('arcoPosAuto').checked = r.arcoPos == null; if (r.arcoPos != null) $('arcoPos').value = Math.round(r.arcoPos * 100);
  // correcciones como LutraCAD (2026-11-17); las recetas de antes no traen: 0
  { const c = r.correcciones ?? {}; $('corrArcoIzq').value = c.arcoMedial?.[0] ?? 0; $('corrArcoDer').value = c.arcoMedial?.[1] ?? 0;
    $('corrApiceIzq').value = c.moverApice?.[0] ?? 0; $('corrApiceDer').value = c.moverApice?.[1] ?? 0; }
  for (const id of POR_PIE) ponerSeparado(id, false);
  for (const id of POR_PIE) ponerSeparado(id, Array.isArray(r.separados) ? r.separados.includes(id) : id in (r.der ?? {}));
  for (const [k, v] of Object.entries(r.der ?? {})) if (POR_PIE.includes(k)) $(k + 'Der').value = k === 'arcoPos' ? Math.round(v * 100) : v;
  pintarTipoArco();
  const lista = Array.isArray(r.elementos) ? r.elementos : [], desconocidos = lista.filter(e => !formas[e.id]).map(e => e.id);
  elegidos = lista.filter(e => formas[e.id]).map(normalizarElemento);
  ordenActual = r.orden ?? null; pintarOrden();
  contornoActual = r.contorno?.puntos?.length > 20 ? r.contorno : null; pintarContorno();
  alturaBordeActual = r.alturaBorde && (r.alturaBorde.izq || r.alturaBorde.der) ? r.alturaBorde : null;
  // recetas viejas (sin el dato): contacto total, que es lo de siempre con escaneo
  $('contactoActivo').checked = r.contacto !== null; if (r.contacto > 0) $('contactoPct').value = r.contacto;
  $('contactoForma').value = r.contactoForma === 'fiel' ? 'fiel' : 'natural';
  if (activo >= elegidos.length) activo = -1;
  pintarElementos(); pedir();
  return desconocidos;
}
// Orden del doctor que vino con la receta (de app/orden.html): se muestra en Base y viaja en la receta exportada.
let ordenActual = null;
function pintarOrden() {
  const o = ordenActual;
  $('orden').hidden = !o;
  if (!o) return;
  $('orden').innerHTML = `<strong>Orden del doctor</strong>${o.doctor ? ' · ' + esc(o.doctor) : ''}${o.fecha ? ' · ' + esc(o.fecha) : ''}` +
    (o.segunEscaneo ? '<br>Talla: según escaneo (abra el escaneo del paciente).' : '') + (o.notas ? `<br>${esc(o.notas)}` : '');
}
// Elemento de una receta con todos sus campos (las recetas viejas no traen posición).
function normalizarElemento(e) {
  const par = (m, def) => (Array.isArray(m) ? [Number.isFinite(+m[0]) ? +m[0] : def, Number.isFinite(+m[1]) ? +m[1] : def] : [def, def]);
  const num1 = (v, def) => (Number.isFinite(+v) && v !== null && v !== '' ? +v : def);
  // dentro de los mismos límites que el panel del elemento (auditoría 2026-11-16)
  const lim = (v, a, b) => Math.min(Math.max(v, a), b), parLim = (p, a, b) => p.map(v => lim(v, a, b));
  return { id: e.id, izq: lim(+e.izq || 0, 0, 15), der: lim(+e.der || 0, 0, 15),
           mov: { izq: parLim(par(e.mov?.izq, 0), -80, 80), der: parLim(par(e.mov?.der, 0), -80, 80) },
           giro: { izq: lim(num1(e.giro?.izq, 0), -90, 90), der: lim(num1(e.giro?.der, 0), -90, 90) },
           tam: { izq: parLim(par(e.tam?.izq, 100), 40, 250), der: parLim(par(e.tam?.der, 100), 40, 250) } };
}

// ---- Combinaciones guardadas de elementos ----
// Un grupo de elementos con sus alturas, posición, giro y tamaño, con un nombre (por ejemplo "pie plano
// estándar"). Se guardan en biblioteca/combinaciones.json: las ve cualquier PC que use esta carpeta.
let combinaciones = [];
async function leerCombinaciones() {
  try { const r = await fetch('../biblioteca/combinaciones.json', { cache: 'no-store' }); combinaciones = r.ok ? (await r.json()).combinaciones ?? [] : []; }
  catch { combinaciones = []; }
  const sel = $('combinacion'), elegida = sel.value;
  sel.length = 1;
  for (const c of combinaciones) sel.add(new Option(`${c.nombre} (${c.elementos.length})`, c.nombre));
  sel.value = combinaciones.some(c => c.nombre === elegida) ? elegida : '';
}
async function escribirCombinaciones() {
  const r = await fetch('../biblioteca/combinaciones.json', { method: 'PUT', body: JSON.stringify({ combinaciones }, null, 2) });
  if (r.status !== 204) throw new Error(`no se pudo guardar (respuesta ${r.status}); reinicie el programa con "Abrir programa.cmd"`);
}
$('aplicarCombo').addEventListener('click', () => {
  const c = combinaciones.find(x => x.nombre === $('combinacion').value);
  if (!c) { mensaje('Elija una combinación de la lista.', false); return; }
  if (elegidos.length && !confirm(`Se reemplazan los ${elegidos.length} elementos actuales por "${c.nombre}". ¿Seguir?`)) return;
  elegidos = c.elementos.filter(e => formas[e.id]).map(normalizarElemento); activo = -1; abiertos.clear();
  pintarElementos(); pedir(); mensaje(`Combinación "${c.nombre}" aplicada (se puede deshacer con Ctrl+Z).`);
});
$('guardarCombo').addEventListener('click', async () => {
  if (!elegidos.length) { mensaje('Agregue elementos antes de guardar una combinación.', false); return; }
  const nombre = (prompt('Nombre de la combinación (por ejemplo: pie plano estándar):') ?? '').trim();
  if (!nombre) return;
  const existe = combinaciones.findIndex(c => c.nombre.toLowerCase() === nombre.toLowerCase());
  if (existe >= 0 && !confirm(`Ya hay una combinación "${combinaciones[existe].nombre}". ¿Reemplazarla?`)) return;
  const nueva = { nombre, elementos: JSON.parse(JSON.stringify(elegidos)), fecha: new Date().toISOString() };
  try {
    await leerCombinaciones();   // por si otra PC guardó una mientras tanto
    const i = combinaciones.findIndex(c => c.nombre.toLowerCase() === nombre.toLowerCase());
    if (i >= 0) combinaciones[i] = nueva; else combinaciones.push(nueva);
    combinaciones.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    await escribirCombinaciones(); await leerCombinaciones(); $('combinacion').value = nombre;
    mensaje(`Combinación "${nombre}" guardada.`);
  } catch (err) { mensaje('Error: ' + err.message, false); }
});
$('borrarCombo').addEventListener('click', async () => {
  const nombre = $('combinacion').value; if (!nombre) return;
  if (!confirm(`¿Borrar la combinación "${nombre}"? No se puede deshacer.`)) return;
  try {
    await leerCombinaciones(); combinaciones = combinaciones.filter(c => c.nombre !== nombre);
    await escribirCombinaciones(); await leerCombinaciones(); mensaje(`Combinación "${nombre}" borrada.`);
  } catch (err) { mensaje('Error: ' + err.message, false); }
});
leerCombinaciones();

// ---- Deshacer / rehacer y autoguardado ----
// Cada diseño estable (sin cambios por 0,4 s) se guarda en una pila. El último también se guarda en el
// navegador, para recuperarlo si se cierra la página o se corta la luz.
const CLAVE_AUTO = 'plantillas.autoguardado.v1';
const historial = { pila: [], pos: -1 };
let tHistorial = null, autoguardarListo = false;
function leerAuto() { try { return JSON.parse(localStorage.getItem(CLAVE_AUTO) || 'null'); } catch { return null; } }
function escribirAuto(datos) { try { localStorage.setItem(CLAVE_AUTO, JSON.stringify(datos)); } catch { /* sin almacenamiento: se sigue sin autoguardado */ } }
function anotarHistorial() {
  clearTimeout(tHistorial); tHistorial = null;
  const s = JSON.stringify(diseno());
  if (historial.pila[historial.pos] === s) return;
  historial.pila.splice(historial.pos + 1); historial.pila.push(s);
  if (historial.pila.length > 150) historial.pila.shift();
  historial.pos = historial.pila.length - 1;
  // el primer diseño es el de arranque: no pisa uno pendiente de recuperar
  if (autoguardarListo && historial.pila.length > 1) escribirAuto({ fecha: new Date().toISOString(), receta: JSON.parse(s), exportado: false });
  // con un proyecto abierto, el diseño se guarda solo en su carpeta
  if (historial.pila.length > 1) inicio?.alCambiar(JSON.parse(s));
  pintarHistorial();
}
function registrarHistorial() { clearTimeout(tHistorial); tHistorial = setTimeout(anotarHistorial, 400); }
// Auditoría 2026-11-16: un cambio de hace menos de 0,4 s todavía no estaba anotado; al ir a Inicio o abrir otro
// proyecto se perdía (o podía terminar en el otro proyecto). Antes de salir se anota y se guarda ya.
function volcarHistorial() {
  if (!tHistorial && !espera) return;
  clearTimeout(tHistorial);
  if (espera) { clearTimeout(espera); espera = null; try { actualizar(); } catch { /* se anota igual el diseño */ } }
  anotarHistorial();
}
function pintarHistorial() {
  $('deshacer').disabled = historial.pos <= 0;
  $('rehacer').disabled = historial.pos >= historial.pila.length - 1;
}
function moverHistorial(paso) {
  const n = historial.pos + paso; if (n < 0 || n >= historial.pila.length) return;
  clearTimeout(tHistorial);
  historial.pos = n; aplicarReceta(JSON.parse(historial.pila[n])); pintarHistorial();
}
$('deshacer').addEventListener('click', () => moverHistorial(-1));
$('rehacer').addEventListener('click', () => moverHistorial(1));
// al abrir: si quedó un diseño sin exportar, se ofrece recuperarlo
const pendiente = leerAuto();
if (pendiente?.receta && !pendiente.exportado) {
  const hora = new Date(pendiente.fecha).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
  $('recuperar').hidden = false;
  $('recuperarTexto').textContent = `Hay un diseño sin exportar de ${pendiente.receta.paciente || 'paciente sin nombre'} (${hora}).`;
  $('recuperarSi').addEventListener('click', () => {
    $('recuperar').hidden = true; autoguardarListo = true;
    try { aplicarReceta(pendiente.receta); mensaje('Diseño recuperado.'); } catch (err) { mensaje('No se pudo recuperar: ' + err.message, false); }
  });
  $('recuperarNo').addEventListener('click', () => { $('recuperar').hidden = true; autoguardarListo = true; marcarExportado(); });
  // si se empieza a diseñar sin contestar, el diseño nuevo pasa a ser el que se autoguarda
  const alCambiar = () => { if (!autoguardarListo && historial.pila.length > 1) { autoguardarListo = true; $('recuperar').hidden = true; } };
  setInterval(alCambiar, 1000);
} else autoguardarListo = true;
// ---- Arrastrar y soltar archivos sobre el 3D ----
// .stl = escaneo del pie (uno o los dos); .json = receta. Así se pueden traer directo desde la carpeta del paciente.
const zonaVisor = document.querySelector('.visor');
zonaVisor.addEventListener('dragover', ev => { if ([...ev.dataTransfer.types].includes('Files')) { ev.preventDefault(); zonaVisor.classList.add('soltando'); } });
zonaVisor.addEventListener('dragleave', ev => { if (!zonaVisor.contains(ev.relatedTarget)) zonaVisor.classList.remove('soltando'); });
zonaVisor.addEventListener('drop', async ev => {
  ev.preventDefault(); zonaVisor.classList.remove('soltando');
  // una carpeta soltada = la carpeta del paciente
  const dir = [...ev.dataTransfer.items].map(it => it.webkitGetAsEntry?.()).find(e => e?.isDirectory);
  if (dir) {
    const entradas = await new Promise((ok, mal) => { const r = dir.createReader(), todas = [];
      const leer = () => r.readEntries(es => { if (!es.length) ok(todas); else { todas.push(...es); leer(); } }, mal); leer(); });
    const archivosDir = await Promise.all(entradas.filter(e => e.isFile).map(e => new Promise((ok, mal) => e.file(f => {
      Object.defineProperty(f, 'webkitRelativePath', { value: dir.name + '/' + f.name }); ok(f); }, mal))));
    if (archivosDir.length) await abrirCarpeta(archivosDir);
    return;
  }
  const archivos = [...ev.dataTransfer.files];
  const stl = archivos.filter(f => /\.stl$/i.test(f.name)), json = archivos.filter(f => /\.json$/i.test(f.name));
  const png = archivos.filter(f => /\.(png|pdf)$/i.test(f.name));
  if (png.length) await cargarMuestra(png[0]);
  const otros = archivos.filter(f => !stl.includes(f) && !json.includes(f) && !png.includes(f));
  let recetaConMedidas = false;
  if (json.length) {
    try {
      const r = JSON.parse(await json[0].text()), desconocidos = aplicarReceta(r);
      recetaConMedidas = r.largo != null;
      mensaje(`Receta abierta: ${json[0].name}` + (desconocidos.length ? `. Elementos que no existen: ${desconocidos.join(', ')}` : ''), !desconocidos.length);
    } catch (err) { mensaje('No se pudo abrir la receta: ' + err.message, false); }
  }
  // con receta y escaneo juntos, si la receta trae medidas mandan ellas y el escaneo solo se muestra; si es una
  // orden "según escaneo", las medidas salen del escaneo
  if (stl.length) await cargarEscaneos(stl, !recetaConMedidas);
  if (otros.length && !stl.length && !json.length && !png.length) mensaje(`No se abre ${otros.map(f => f.name).join(', ')}: arrastre la carpeta del paciente, el STL del escaneo, la muestra (PDF o PNG) o una receta (.json).`, false);
});

// ---- Atajos de teclado ----
// Ctrl+Z / Ctrl+Y (o Ctrl+Mayús+Z) deshacer y rehacer; 1 a 5 vistas; M medir; A mapa de alturas; J ajuste al
// pie; Supr quita el elemento elegido; Esc suelta el elemento y deja de medir. Con el cursor en un campo de texto
// solo valen Ctrl+Z / Ctrl+Y.
const VISTAS_TECLA = { 1: '3d', 2: 'arriba', 3: 'lado', 4: 'atras', 5: 'abajo' };
document.addEventListener('keydown', ev => {
  const enCampo = ev.target.closest?.('input, select, textarea');
  const k = ev.key.toLowerCase();
  // editando la línea de corte: Ctrl+Z deshace un paso de la línea, Esc suelta el tramo que se mueve, Enter confirma
  if (lc && !(enCampo && ev.target.type !== 'checkbox' && ev.key !== 'Escape')) {
    if ((ev.ctrlKey || ev.metaKey) && k === 'z') { ev.preventDefault(); pasoAtrasCorte(); return; }
    if (ev.key === 'Escape') {
      if (lc.mov) { lc.p = lc.hist.pop(); lc.mov = null; }
      else if (lc.trazo) lc.trazo = null;
      else terminarCorte(false);
      pintarCorte(); visor?.pedir(); return;
    }
    if (ev.key === 'Enter') { terminarCorte(true); return; }
  }
  if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {
    if (k === 'z' && !ev.shiftKey) { ev.preventDefault(); moverHistorial(-1); }
    else if (k === 'y' || (k === 'z' && ev.shiftKey)) { ev.preventDefault(); moverHistorial(1); }
    return;
  }
  if (enCampo || ev.altKey) return;
  if (VISTAS_TECLA[ev.key]) visor?.vista(VISTAS_TECLA[ev.key]);
  else if (k === 'm') usarHerramienta('medir');
  else if (k === 'c') usarHerramienta('corte');
  else if (k === 'r') usarHerramienta('regla');
  else if (ev.key === 'Escape' && reglando && reglas.length && !reglas[reglas.length - 1].b) { reglas.pop(); cursorRegla = null; visor?.pedir(); }
  else if (k === 'a') usarHerramienta('mapa');
  else if (k === 'j' && !document.querySelector('[data-herr=ajuste]').hidden) usarHerramienta('ajuste');
  else if ((ev.key === 'Delete' || ev.key === 'Supr') && reglaElegida) {
    reglas = reglas.filter(r => r !== reglaElegida); reglaElegida = null;
    if (!reglas.length && !medidasTomadas.length) $('borrarMedidas').hidden = true;
    visor?.pedir();
  } else if ((ev.key === 'Delete' || ev.key === 'Supr') && activo >= 0 && !fijoModulo()) {
    elegidos.splice(activo, 1); activo = -1; pintarElementos(); pedir();
  } else if (ev.key === 'Escape') {
    activo = -1; refrescarPosiciones();
    if (reglaElegida) { reglaElegida = null; visor?.pedir(); }
    if (midiendo) usarHerramienta('medir');
    if (cortando) usarHerramienta('corte');
    if (corte) { corte = null; $('panelCorte').hidden = true; visor?.pedir(); }
  } else return;
  ev.preventDefault();
});

function marcarExportado() { const a = leerAuto(); if (a) { a.exportado = true; escribirAuto(a); } }

// ---- Pantalla de inicio: diseñadores, proyectos y carpeta de trabajo (inicio.js) ----
inicio = crearInicio({
  // abrir un proyecto: su diseño en pantalla; uno nuevo empieza sin paciente cargado. Deshacer empieza de cero.
  aplicarReceta: (r, nuevo) => {
    clearTimeout(tHistorial); tHistorial = null;   // lo que esperaba era del proyecto anterior (ya se guardó)
    if (lc) terminarCorte(false);
    if (nuevo) limpiarPaciente(); else { escaneos.izq = null; escaneos.der = null; muestra = null; muestrasCarpeta = []; $('datosMuestra').hidden = true; pintarListaMuestras(); pintarEscaneo(); }
    aplicarReceta(r);
    historial.pila = []; historial.pos = -1; registrarHistorial();
    $('recuperar').hidden = true; autoguardarListo = true;
  },
  // proyecto nuevo: guía de tallas con su tipo (estándar) y arco neutro
  recetaNueva: paciente => ({ version: 1, producto: 'resina', horma: 'guia_tallas', tipoArco: 'neutro', paciente, elementos: [] }),
  mensaje,
  antesDeSalir: () => { if (lc) terminarCorte(true); volcarHistorial(); },
  biblioteca: { catalogo: () => catalogo, miniatura: miniaturaElemento, recuadro: recuadroElemento, vista3D: vista3DElemento, aplicar: ponerElementosPropios, hormas: listaHormas,
                aplicarHormas: ponerHormasPropias, editorHorma },
});
// un cambio que todavía no pasó al historial (0,4 s): al cerrar, recargar o cambiar de ventana se guarda ya
const cambioSinGuardar = () => tHistorial && inicio.proyecto() && historial.pila[historial.pos] !== JSON.stringify(diseno());
window.addEventListener('beforeunload', e => { if (cambioSinGuardar()) { inicio.guardarAhora(diseno()); e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && cambioSinGuardar()) inicio.guardarAhora(diseno()); });

actualizar();
// para revisar desde la consola: el diseño actual y las medidas tomadas con su lectura
window.app = {
  diseno, abrirCarpeta, actual: () => actual, elegidos: () => elegidos, modulo: () => modulo, visor, enVista: () => enVista,
  cargarEscaneos, ponerMapa, escaneos, cargarMuestra, puntoDelClic, puntoDelClicExacto, lineaCorte: () => lc,
  medidas: () => medidasTomadas.map(m => { const v = enVista.find(e => e.pie === m.pie); return { ...m, ...(v ? leerPunto(v.g, m.x, m.y) : {}) }; }),
};
