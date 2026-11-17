// Biblioteca de elementos (apartado de la pantalla de inicio, Ernesto 2026-11-13).
// Tarjetas por categoría con el dibujo de cada elemento, favoritos, y elementos propios de Lima Blue: se crean desde
// una forma base (gota, óvalo, cuñas, barra) o duplicando uno que ya existe, con campos entendibles y vista previa.
// Los propios y los favoritos se guardan en la carpeta compartida (Biblioteca/elementos.json).

import { curvaPuntos } from '../motor/plantilla.js';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CATEGORIAS = ['Cuñas', 'Barras y olivas', 'Arcos', 'Talón', 'Otros'];
const copia = o => JSON.parse(JSON.stringify(o));

// Formas base para crear un elemento nuevo
const BASES = {
  gota: { nombre: 'Gota', categoria: 'Barras y olivas', altura: 4, suavizado: 2.5,
          pieza: { frente: 0.72, largo: 0.25, ancho: 0.5, centro: 0.52, anchoMax: 0.72, pico: 0.73, cola: 1.6, caida: 2.2, boveda: 3.5, giro: 0 } },
  ovalo: { nombre: 'Óvalo', categoria: 'Otros', altura: 3, suavizado: 3,
           pieza: { frente: 0.6, largo: 0.22, ancho: 0.45, centro: 0.5, anchoMax: 0.5, pico: 0.5, cola: 1.6, caida: 1.6, boveda: 3, giro: 0 } },
  cunaRetro: { nombre: 'Cuña de retropié', categoria: 'Cuñas', altura: 4, suavizado: 6,
               largo: { tipo: 'talon', hasta: 0.37, rampa: 0.17, diagonal: 0.1 }, ancho: { tipo: 'cuna', lado: 'interno', hasta: 0.95 } },
  cunaAnte: { nombre: 'Cuña de antepié', categoria: 'Cuñas', altura: 3, suavizado: 6, relleno: true,
              largo: { tipo: 'frente', desde: 0.57, rampa: 0.06, diagonal: 0.14 }, ancho: { tipo: 'cuna', lado: 'interno', hasta: 1, perfil: 'degradado', finSuave: 0.08 } },
  cunaLarga: { nombre: 'Cuña larga', categoria: 'Cuñas', altura: 3, suavizado: 6,
               largo: { tipo: 'lente', desde: 0.02, hasta: 0.76, meseta: 0.4 }, ancho: { tipo: 'cuna', lado: 'externo', hasta: 0.55 } },
  arcoLateral: { nombre: 'Arco lateral', categoria: 'Arcos', altura: 3, suavizado: 5,
                 largo: { tipo: 'arco', desde: 0.24, hasta: 0.62, pico: 0.5, punta: 0.7, subida: 2 },
                 ancho: { tipo: 'cuna', lado: 'externo', hasta: 0.37, perfil: 'degradado', finSuave: 0.3 } },
  barraMeta: { nombre: 'Barra metatarsal', categoria: 'Barras y olivas', altura: 3, suavizado: 3,
               pieza: { planta: 'campana', frente: 0.72, largo: 0.22, ancho: 0.66, centro: 0.5, pico: 0.6, cola: 1.6, caida: 2.2, boveda: 3,
                        hombro: 0.79, cupula: 0.26, concavo: 0.1, angosta: 0.07, giro: 0 } },
  barra: { nombre: 'Barra', categoria: 'Barras y olivas', altura: 3, suavizado: 7,
           largo: { tipo: 'rampa', desde: 0.47, pico: 0.64, hasta: 0.73 }, ancho: { tipo: 'plano', borde: 0 } },
};
// Formas base para una descarga nueva (hunden la plantilla; altura = profundidad)
const BASES_DESCARGA = {
  dOvalo: { nombre: 'Descarga ovalada', categoria: 'Descargas', descarga: true, altura: 1.5, suavizado: 2.5,
            pieza: { frente: 0.78, largo: 0.12, ancho: 0.32, centro: 0.5, anchoMax: 0.5, pico: 0.5, cola: 1.6, caida: 1.6, boveda: 3.5, giro: 0 } },
  dGota: { nombre: 'Descarga en gota', categoria: 'Descargas', descarga: true, altura: 1.5, suavizado: 2.5,
           pieza: { frente: 0.78, largo: 0.14, ancho: 0.3, centro: 0.5, anchoMax: 0.7, pico: 0.6, cola: 1.6, caida: 2.2, boveda: 3.5, giro: 0 } },
  dTalon: { nombre: 'Descarga de talón', categoria: 'Descargas', descarga: true, altura: 2, suavizado: 3,
            pieza: { frente: 0.2, largo: 0.13, ancho: 0.45, centro: 0.5, anchoMax: 0.5, pico: 0.5, cola: 1.6, caida: 1.6, boveda: 3, giro: 0 } },
};
const NOMBRE_BASE_DESCARGA = { dOvalo: 'Ovalada', dGota: 'En gota', dTalon: 'De talón' };
const NOMBRE_BASE = { gota: 'Gota (como la oliva)', ovalo: 'Óvalo', cunaRetro: 'Cuña de retropié', cunaAnte: 'Cuña de antepié', cunaLarga: 'Cuña larga', arcoLateral: 'Arco lateral', barraMeta: 'Barra metatarsal (pad)', barra: 'Barra de lado a lado' };

// Campos que se pueden cambiar según el tipo de elemento. pct = se muestra en % (se guarda como fracción).
const pct = (ruta, etq, min, max) => ({ ruta, etq, min, max, paso: 1, pct: true });
const num = (ruta, etq, min, max, paso) => ({ ruta, etq, min, max, paso });
function camposDe(def) {
  const comunes = [def.descarga ? num('altura', 'Profundidad por defecto (mm)', 0.5, 6, 0.5) : num('altura', 'Altura por defecto (mm)', 0.5, 15, 0.5),
                   num('suavizado', 'Suavidad del borde (mm)', 1, 12, 0.5)];
  if (def.pieza) return [...comunes,
    pct('pieza.largo', 'Largo (% del largo de la plantilla)', 5, 60), pct('pieza.ancho', 'Ancho (% del ancho)', 10, 100),
    pct('pieza.frente', 'Punta de adelante (% desde el talón)', 15, 98), pct('pieza.centro', 'Centro a lo ancho (0 externo · 100 interno)', 0, 100),
    ...(def.pieza.planta === 'campana'
      ? [pct('pieza.hombro', 'Hombros (% del largo de la pieza)', 50, 98), pct('pieza.cupula', 'Ancho de la cúpula (%)', 5, 50),
         pct('pieza.concavo', 'Curva del borde de atrás (%)', 0, 30), pct('pieza.angosta', 'Más angosta atrás (%)', 0, 30)]
      : [pct('pieza.anchoMax', 'Parte más ancha (50 = óvalo · 72 = gota)', 30, 90)]),
    pct('pieza.pico', 'Parte más alta (% desde atrás)', 20, 90),
    num('pieza.boveda', 'Llenura (más = más plana arriba)', 1.5, 8, 0.5), num('pieza.giro', 'Giro (°, + punta hacia interno)', -60, 60, 1),
    num('pieza.cola', 'Subida desde atrás (más = sube más rápido)', 1, 4, 0.1), num('pieza.caida', 'Bajada hacia adelante (más = baja más tarde)', 1, 5, 0.1)];
  const L = def.largo ?? {}, r = [...comunes];
  if (def.ancho?.tipo === 'cuna') r.push({ ruta: 'ancho.lado', etq: 'Lado', opciones: [['interno', 'Interno'], ['externo', 'Externo']] },
                                        pct('ancho.hasta', 'Alcance a lo ancho (%)', 15, 100));
  if (L.tipo === 'talon') r.push(pct('largo.hasta', 'Llega hasta (% desde el talón)', 10, 70), pct('largo.rampa', 'Bajada al frente (% del largo)', 2, 40));
  if (L.tipo === 'frente') r.push(pct('largo.desde', 'Empieza en (% desde el talón)', 30, 90), pct('largo.rampa', 'Subida (% del largo)', 2, 30));
  if (L.tipo === 'lente') r.push(pct('largo.desde', 'Desde (% desde el talón)', 0, 80), pct('largo.hasta', 'Hasta (% desde el talón)', 20, 100), pct('largo.meseta', 'Parte pareja (%)', 0, 90));
  if (L.tipo === 'arco') r.push(pct('largo.desde', 'Empieza en (% desde el talón)', 0, 80), pct('largo.hasta', 'Termina en (% desde el talón)', 20, 100),
                                pct('largo.pico', 'Parte más ancha (% del tramo)', 15, 85), num('largo.punta', 'Puntas (más = más finas)', 0.2, 2, 0.1),
                                num('largo.subida', 'Alto a lo largo (más = solo alto en el medio)', 0, 4, 0.1));
  if (L.tipo === 'talon' || L.tipo === 'frente') r.push(pct('largo.diagonal', 'Borde en diagonal (% del largo, 0 = recto)', 0, 30));
  if (L.tipo === 'rampa') r.push(pct('largo.desde', 'Desde (% desde el talón)', 20, 90), pct('largo.pico', 'Más alta en (% desde el talón)', 25, 95), pct('largo.hasta', 'Hasta (% desde el talón)', 30, 100));
  return r;
}
const leerRuta = (o, r) => r.split('.').reduce((a, k) => a?.[k], o);
const ponerRuta = (o, r, v) => { const k = r.split('.'), u = k.pop(); k.reduce((a, x) => (a[x] ??= {}), o)[u] = v; };

// ctx: { catalogo(), datos() → { elementos, favoritos }, guardar(datos), miniatura(def, canvas) }
export function pintarBiblioteca(cuerpo, ctx) {
  let editando = null;   // { def, origen }
  let filtro = '';
  // Menú a la izquierda como la biblioteca de LutraCAD (Ernesto, 2026-11-16): Hormas, y en Elementos dos tipos,
  // Elementos y Descargas. La sección elegida se recuerda.
  let seccion = (() => { try { return localStorage.getItem('plantillas.bibSeccion') || 'elementos'; } catch { return 'elementos'; } })();
  const esDescarga = e => e.descarga === true || e.categoria === 'Descargas';

  function pintar() {
    const lista = ctx.catalogo(), { favoritos = [] } = ctx.datos();
    const hormas = ctx.hormas ? ctx.hormas() : [];
    const deSeccion = lista.filter(e => (seccion === 'descargas') === esDescarga(e));
    const cats = [...CATEGORIAS, ...new Set(deSeccion.map(e => e.categoria).filter(c => c && !CATEGORIAS.includes(c)))];
    const visibles = deSeccion.filter(e => !filtro || e.nombre.toLowerCase().includes(filtro));
    const cuenta = { hormas: hormas.length, elementos: lista.filter(e => !esDescarga(e)).length, descargas: lista.filter(esDescarga).length };
    const item = (id, nombre) => `<button class="bib-item ${seccion === id ? 'activo' : ''}" data-seccion="${id}" aria-current="${seccion === id}"><span>${nombre}</span><span class="bib-cuenta">${cuenta[id]}</span></button>`;
    const fila = e => `
      <div class="bib-fila" title="${e.propio ? 'Propio de Lima Blue' : e.modificado ? 'Del programa (modificado)' : 'Del programa'} · ${String(e.altura).replace('.', ',')} mm${esDescarga(e) ? ' de profundidad' : ''}">
        <canvas width="64" height="90" data-mini="${esc(e.id)}" aria-label="Dibujo de ${esc(e.nombre)}"></canvas>
        <div class="bf-texto"><div class="bf-nombre">${esc(e.nombre)}</div></div>
        <div class="bf-acciones">
          <button class="estrella ${favoritos.includes(e.id) ? 'si' : ''}" data-fav="${esc(e.id)}" title="Favorito: sale primero en Agregar elemento" aria-label="Favorito: ${esc(e.nombre)}" aria-pressed="${favoritos.includes(e.id)}">★</button>
          <button data-editar="${esc(e.id)}" title="Cambiar la forma; al guardar elige si es un elemento nuevo o si sobrescribe este">Editar</button>${e.propio
            ? `<button data-duplicar="${esc(e.id)}" title="Hacer una copia con otro nombre">Duplicar</button><button data-borrar="${esc(e.id)}" class="peligro">Borrar</button>`
            : e.modificado ? `<button data-original="${esc(e.id)}" title="Deshacer la modificación: vuelve a la forma con que viene el programa">Volver al original</button>` : ''}
        </div>
      </div>`;
    const titulo = { hormas: 'Hormas', elementos: 'Elementos', descargas: 'Descargas' }[seccion];
    const contenido = seccion === 'hormas' ? pintarHormas()
      : `<p class="bib-nota">${seccion === 'descargas'
          ? 'Descargas: zonas que se hunden en la plantilla para quitar presión. Los propios se guardan en la carpeta compartida.'
          : 'Los elementos propios y los favoritos se guardan en la carpeta compartida: los ven las tres PC. ★ = sale primero en "Agregar elemento".'}</p>
        ${cats.map(c => {
          const es = visibles.filter(e => (e.categoria || 'Otros') === c); if (!es.length) return '';
          return `<h3 class="bib-cat">${esc(c)}</h3><div class="bib-lista">${es.map(fila).join('')}</div>`;
        }).join('') || `<p class="bib-vacio">${filtro ? 'Nada coincide con la búsqueda.' : seccion === 'descargas' ? 'Todavía no hay descargas.' : 'Todavía no hay elementos.'}</p>`}`;
    cuerpo.innerHTML = `<div class="bib-layout">
        <nav class="bib-menu" aria-label="Secciones de la biblioteca">
          <div class="bib-grupo">Hormas</div>${item('hormas', 'Hormas')}
          <div class="bib-grupo">Elementos</div>${item('elementos', 'Elementos')}${item('descargas', 'Descargas')}
        </nav>
        <div class="bib-contenido">
          <div class="inicio-titulo"><h2>${titulo}</h2>
            ${seccion === 'hormas' ? '' : `<input type="search" id="buscarElemento" placeholder="Buscar ${seccion === 'descargas' ? 'descarga' : 'elemento'}…" aria-label="Buscar" value="${esc(filtro)}">
            <button class="primario" id="nuevoElemento" data-descarga="${seccion === 'descargas'}">${seccion === 'descargas' ? '+ Nueva descarga' : '+ Nuevo elemento'}</button>`}</div>
          ${contenido}
        </div>
      </div>
      <div id="editorElemento"></div>`;
    cuerpo.querySelectorAll('[data-seccion]').forEach(b => b.onclick = () => {
      seccion = b.dataset.seccion; filtro = ''; try { localStorage.setItem('plantillas.bibSeccion', seccion); } catch { /* sin almacenamiento */ }
      pintar();
    });
    cuerpo.querySelectorAll('[data-mini-horma]').forEach(cv => ctx.hormas().find(h => h.id === cv.dataset.miniHorma)?.dibujar(cv));
    // dibujos (de a uno, para no trabar la pantalla)
    const minis = [...cuerpo.querySelectorAll('[data-mini]')];
    const sig = () => { const cv = minis.shift(); if (!cv) return; ctx.miniatura(lista.find(e => e.id === cv.dataset.mini), cv, { silueta: true }); requestAnimationFrame(sig); };
    requestAnimationFrame(sig);
    const buscar = cuerpo.querySelector('#buscarElemento');
    if (buscar) buscar.oninput = e => { filtro = e.target.value.trim().toLowerCase(); const p = e.target.selectionStart; pintar(); const b = cuerpo.querySelector('#buscarElemento'); b.focus(); b.setSelectionRange(p, p); };
    const nuevo = cuerpo.querySelector('#nuevoElemento'); if (nuevo) nuevo.onclick = () => elegirBase(nuevo.dataset.descarga === 'true');
    cuerpo.querySelectorAll('[data-fav]').forEach(b => b.onclick = () => {
      const d = ctx.datos(), f = new Set(d.favoritos ?? []), id = b.dataset.fav;
      f.has(id) ? f.delete(id) : f.add(id); ctx.guardar({ ...d, favoritos: [...f] }); pintar();
    });
    const sinMarcas = o => { const def = copia(o); delete def.propio; delete def.modificado; delete def.id; return def; };
    cuerpo.querySelectorAll('[data-duplicar]').forEach(b => b.onclick = () => {
      const o = lista.find(e => e.id === b.dataset.duplicar), def = sinMarcas(o);
      def.nombre = 'Copia de ' + o.nombre; abrirEditor(def, null);
    });
    // Editar (Ernesto, 2026-11-14): cualquier elemento; al guardar se elige "Guardar como nuevo" o "Sobrescribir"
    cuerpo.querySelectorAll('[data-editar]').forEach(b => b.onclick = () => {
      const o = lista.find(e => e.id === b.dataset.editar);
      abrirEditor(sinMarcas(o), { id: o.id, nombre: o.nombre, programa: !o.propio });
    });
    cuerpo.querySelectorAll('[data-original]').forEach(b => b.onclick = () => {
      const o = lista.find(e => e.id === b.dataset.original);
      if (!confirm(`¿Volver "${o.nombre}" a la forma con que viene el programa? Los diseños que lo usan cambian al abrirse.`)) return;
      const d = ctx.datos(); ctx.guardar({ ...d, elementos: (d.elementos ?? []).filter(e => e.id !== o.id) }); pintar();
    });
    // hormas (2026-11-17): editar, duplicar, borrar las propias y volver al original las del programa
    const nombreH = id => ctx.hormas().find(h => h.id === id)?.nombre ?? id;
    cuerpo.querySelectorAll('[data-editar-horma]').forEach(b => b.onclick = () => {
      const id = b.dataset.editarHorma; abrirEditorHorma(ctx.editorHorma.def(id), { id, nombre: nombreH(id), programa: !ctx.hormas().find(h => h.id === id)?.propia });
    });
    cuerpo.querySelectorAll('[data-duplicar-horma]').forEach(b => b.onclick = () => {
      const id = b.dataset.duplicarHorma, def = ctx.editorHorma.def(id); def.nombre = 'Copia de ' + nombreH(id); delete def.id; abrirEditorHorma(def, null);
    });
    cuerpo.querySelectorAll('[data-borrar-horma]').forEach(b => b.onclick = () => {
      const id = b.dataset.borrarHorma; if (!confirm(`¿Borrar la horma "${nombreH(id)}"? Los diseños que la usan pasan a la guía de tallas al abrirse.`)) return;
      const d = ctx.datosHormas(); ctx.guardarHormas({ ...d, hormas: (d.hormas ?? []).filter(h => h.id !== id) }); pintar();
    });
    cuerpo.querySelectorAll('[data-original-horma]').forEach(b => b.onclick = () => {
      const id = b.dataset.originalHorma; if (!confirm(`¿Volver "${nombreH(id)}" a la forma con que viene el programa? Los diseños que la usan cambian al abrirse.`)) return;
      const d = ctx.datosHormas(); ctx.guardarHormas({ ...d, hormas: (d.hormas ?? []).filter(h => h.id !== id) }); pintar();
    });
    cuerpo.querySelectorAll('[data-borrar]').forEach(b => b.onclick = () => {
      const o = lista.find(e => e.id === b.dataset.borrar);
      if (!confirm(`¿Borrar "${o.nombre}" de la biblioteca? Los diseños que ya lo usan lo pierden al abrirse.`)) return;
      const d = ctx.datos();
      ctx.guardar({ ...d, elementos: (d.elementos ?? []).filter(e => e.id !== o.id), favoritos: (d.favoritos ?? []).filter(id => id !== o.id) }); pintar();
    });
    if (editando) pintarEditor();
  }

  // Hormas (2026-11-16): delgadas, estándar y las que sirven para las dos. Se eligen en el diseño ("Horma").
  function pintarHormas() {
    if (!ctx.hormas) return '';
    const hs = ctx.hormas(); if (!hs.length) return '<p class="bib-vacio">Todavía no hay hormas.</p>';
    const grupos = [...new Set(hs.map(h => h.tipoNombre))];
    const n1 = v => String(v).replace('.', ',');
    return `<p class="bib-nota">La horma se elige en el diseño ("Horma"). Delgadas: copa 10 y espesor 1,5 mm; estándar: copa 14 y espesor 2 mm. Pasa el mouse sobre una horma para ver su copa, espesor y arco.</p>
      ${grupos.map(gn => {
        const lista = hs.filter(h => h.tipoNombre === gn), calz = lista[0].calzados;
        return `<h3 class="bib-cat">${esc(gn)}${calz.length ? `<small class="bib-calzados"> · ${esc(calz.join(', '))}</small>` : ''}</h3>
          <div class="bib-lista">${lista.map(h => `
            <div class="bib-fila" title="${h.propia ? 'Propia de Lima Blue' : h.modificado ? 'Del programa (modificada)' : 'Del programa'} · copa ${n1(h.copa)} · espesor ${n1(h.antepie)} mm · arco al ${Math.round(h.arcoPos * 100)} %${h.nota ? ' — ' + esc(h.nota) : ''}">
              <canvas width="64" height="90" data-mini-horma="${esc(h.id)}" aria-label="Dibujo de la horma ${esc(h.nombre)}"></canvas>
              <div class="bf-texto"><div class="bf-nombre">${esc(h.nombre)}</div></div>
              <div class="bf-acciones">${h.editable ? `
                <button data-editar-horma="${esc(h.id)}" title="Cambiar el contorno y el relieve; al guardar elige si es una horma nueva o si sobrescribe esta">Editar</button>
                <button data-duplicar-horma="${esc(h.id)}" title="Hacer una horma nueva a partir de esta">Duplicar</button>
                ${h.propia ? `<button data-borrar-horma="${esc(h.id)}" class="peligro">Borrar</button>`
                  : h.modificado ? `<button data-original-horma="${esc(h.id)}" title="Deshacer la modificación: vuelve a la forma con que viene el programa">Volver al original</button>` : ''}` : ''}</div>
            </div>`).join('')}</div>`;
      }).join('')}`;
  }

  // ---- Editor de hormas (Ernesto, 2026-11-17): como el de elementos, en pantalla completa ----
  // Arriba: el contorno; se arrastran los puntos azules y la línea se mueve suave alrededor (radio en mm). Costado:
  // rojo = lo más alto del lado interno, amarillo = el borde externo; se arrastran los puntos para subir o bajar en
  // ese tramo (cambia los factores de relieve de la horma). La copa y el arco quedan en los valores del diseño:
  // lo que cambia es la forma entre ellos. Guardar como nueva o sobrescribir (en la carpeta compartida).
  function abrirEditorHorma(def, origen) {
    const E = ctx.editorHorma, caja = cuerpo.querySelector('#editorElemento');
    def = JSON.parse(JSON.stringify(def)); def.valores ??= {}; def.relieve ??= {};
    const tipos = E.tipos(), hist = [];
    const guardarPaso = () => { hist.push(JSON.stringify({ puntos: def.puntos, relieve: def.relieve, valores: def.valores, tipo: def.tipo })); if (hist.length > 40) hist.shift(); };
    caja.innerHTML = `<div class="editor-elem completo" role="dialog" aria-modal="true" aria-label="Editar horma">
      <div class="editor-cab">
        <div><h3>${origen ? 'Editar horma: ' + esc(origen.nombre) : 'Nueva horma'}</h3>
          <p class="bib-nota">La copa y el alto de arco quedan en los valores del diseño; aquí se cambia la forma: el contorno (arriba) y cómo sube y baja (costado).${origen ? ` Al terminar: <b>Guardar como nueva</b> (con otro nombre) o <b>Sobrescribir</b> ${esc(origen.nombre)}.` : ''}</p></div>
        <div class="editor-botones"><button id="eh-cancelar">Cancelar</button>${origen
          ? `<button id="eh-sobrescribir" title="Reemplaza a ${esc(origen.nombre)}${origen.programa ? ' (se puede volver al original)' : ''}">Sobrescribir ${esc(origen.nombre)}</button><button class="primario" id="eh-nuevo">Guardar como nueva</button>`
          : '<button class="primario" id="eh-nuevo">Guardar en la biblioteca</button>'}</div>
      </div>
      <div class="editor-grid">
        <div class="editor-campos">
          <label>Nombre <input type="text" id="eh-nombre" value="${esc(def.nombre)}"></label>
          <label>Tipo <select id="eh-tipo">${Object.entries(tipos).map(([id, t]) => `<option value="${id}" ${def.tipo === id ? 'selected' : ''}>${id === 'estandar' ? 'Estándar' : 'Delgada'} · copa ${t.copa} · espesor ${String(t.antepie).replace('.', ',')}</option>`).join('')}</select></label>
          <label>Cima del arco (% desde el talón) <input type="number" id="eh-arcopos" min="28" max="52" step="1" value="${Math.round((def.valores.arcoPos ?? 0.35) * 100)}"></label>
          <label>Radio al mover el contorno (mm) <input type="number" id="eh-radio" min="10" max="120" step="5" value="45"></label>
          <button id="eh-deshacer" disabled>↶ Deshacer el último cambio</button>
          <p class="bib-nota">Arriba: arrastre un punto azul y el borde se mueve suave alrededor (más radio = tramo más largo).<br>
            Costado: arrastre un punto hacia arriba o abajo para subir o bajar la plantilla en ese tramo. Rojo = lado interno (arco); amarillo = borde externo (copa).</p>
          <p class="bib-nota" id="eh-medidas"></p>
        </div>
        <div class="editor-3d"><canvas id="eh-3d"></canvas><canvas class="ed-cubo" id="eh-cubo" width="120" height="120"></canvas>
          <div class="ed-ayuda-3d">Plantilla izquierda de 260 mm · Arrastrar: mover · Clic derecho + arrastrar: girar · Rueda: acercar</div></div>
        <div class="editor-vista">
          <span>Vista de arriba (dedos arriba, interno a la derecha)</span>
          <canvas id="eh-arriba" width="300" height="350"></canvas>
          <span>Costado (talón a la izquierda)</span>
          <canvas id="eh-costado" width="300" height="180"></canvas>
        </div>
      </div>
    </div>`;
    const $c = s => caja.querySelector(s), arriba = $c('#eh-arriba'), costado = $c('#eh-costado');
    const v3 = E.vista3D($c('#eh-3d'), $c('#eh-cubo'));
    vista3dCerrar = () => v3.cerrar(); editando = null;
    let g = null, per = null, tPend = null;
    const reconstruir = () => {
      try { const h = E.construir(def); g = E.generar(h, def); per = E.perfil(g); v3.poner(g); }
      catch (e) { $c('#eh-medidas').textContent = 'No se pudo armar la horma: ' + e.message; return; }
      const v = E.valores(def);
      $c('#eh-medidas').textContent = `Con ${def.tipo === 'estandar' ? 'estándar' : 'delgada'}: copa ${String(v.copa).replace('.', ',')} mm, espesor ${String(v.antepie).replace('.', ',')} mm y arco ${v.arco} mm (neutro).`;
      dibujarArriba(); dibujarCostado();
      $c('#eh-deshacer').disabled = !hist.length;
    };
    const pronto = () => { clearTimeout(tPend); tPend = setTimeout(reconstruir, 60); };

    // --- vista de arriba: contorno y 24 puntos para arrastrar ---
    const NP = 24;
    let mapaA = null, manijas = [], arrastre = null;
    const largoAcum = P => { const a = [0]; for (let i = 1; i <= P.length; i++) a.push(a[i - 1] + Math.hypot(P[i % P.length][0] - P[i - 1][0], P[i % P.length][1] - P[i - 1][1])); return a; };
    function dibujarArriba() {
      const P = def.puntos, c = arriba.getContext('2d'), W = arriba.width, H = arriba.height;
      c.clearRect(0, 0, W, H);
      if (!P?.length) { c.fillStyle = '#5d6878'; c.font = '13px system-ui'; c.fillText('Esta horma no tiene contorno propio.', 10, 24); return; }
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      if (!mapaA || arrastre == null) {
        const k = Math.min((W - 40) / (x1 - x0), (H - 40) / (y1 - y0));
        mapaA = { k, ox: (W - k * (x1 - x0)) / 2 - x0 * k, oy: (H + k * (y1 - y0)) / 2 + y0 * k };
      }
      const { k, ox, oy } = mapaA, aPx = ([x, y]) => [ox + x * k, oy - y * k];
      c.fillStyle = '#f4f6f9'; c.strokeStyle = '#1d5fbf'; c.lineWidth = 1.6; c.beginPath();
      P.forEach((p, i) => { const [X, Y] = aPx(p); i ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.closePath(); c.fill(); c.stroke();
      // manijas repartidas a lo largo del contorno
      const ac = largoAcum(P), tot = ac[P.length]; manijas = [];
      for (let m = 0; m < NP; m++) { const s = (m / NP) * tot; let i = 0; while (i < P.length - 1 && ac[i + 1] < s) i++; manijas.push(i); }
      for (const i of manijas) { const [X, Y] = aPx(P[i]); c.fillStyle = arrastre?.i === i ? '#e0661b' : '#1d5fbf'; c.beginPath(); c.arc(X, Y, 5, 0, 7); c.fill(); }
    }
    const posA = ev => { const r = arriba.getBoundingClientRect(); return [(ev.clientX - r.left) * arriba.width / r.width, (ev.clientY - r.top) * arriba.height / r.height]; };
    arriba.addEventListener('pointerdown', ev => {
      if (!def.puntos?.length || !mapaA) return;
      const [X, Y] = posA(ev), { k, ox, oy } = mapaA;
      let mejor = -1, dmin = 12;
      for (const i of manijas) { const p = def.puntos[i], d = Math.hypot(ox + p[0] * k - X, oy - p[1] * k - Y); if (d < dmin) { dmin = d; mejor = i; } }
      if (mejor < 0) return;
      guardarPaso();
      arrastre = { i: mejor, P0: def.puntos.map(p => [...p]), ac: largoAcum(def.puntos), X0: X, Y0: Y, R: Math.max(parseFloat($c('#eh-radio').value) || 45, 5) };
      try { arriba.setPointerCapture(ev.pointerId); } catch { /* sin captura */ }
      dibujarArriba();
    });
    arriba.addEventListener('pointermove', ev => {
      if (!arrastre) return;
      const [X, Y] = posA(ev), { k } = mapaA, dx = (X - arrastre.X0) / k, dy = -(Y - arrastre.Y0) / k;
      const { P0, ac, i, R } = arrastre, n = P0.length, tot = ac[n];
      def.puntos = P0.map((p, j) => {
        let d = Math.abs(ac[j] - ac[i]); d = Math.min(d, tot - d);
        const w = d < R ? 0.5 * (1 + Math.cos(Math.PI * d / R)) : 0;
        return [p[0] + w * dx, p[1] + w * dy];
      });
      dibujarArriba();
    });
    const soltarA = () => { if (!arrastre) return; arrastre = null; mapaA = null; pronto(); };
    arriba.addEventListener('pointerup', soltarA); arriba.addEventListener('pointercancel', soltarA);

    // --- costado: rojo (interno) y amarillo (borde externo) con puntos para subir o bajar ---
    const NODOS = { interno: [0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6], externo: [0.1, 0.2, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55] };
    const FIN = { interno: 0.72, externo: 0.62 };
    const cX = t => 18 + t * (costado.width - 30), cY = z => costado.height - 18 - z * (costado.height - 34) / 24;
    let arrC = null;
    function dibujarCostado() {
      const c = costado.getContext('2d'), W = costado.width, H = costado.height; c.clearRect(0, 0, W, H);
      c.strokeStyle = '#dfe4ea'; c.lineWidth = 1; c.fillStyle = '#7a8594'; c.font = '10px system-ui';
      for (let z = 0; z <= 24; z += 6) { c.beginPath(); c.moveTo(cX(0), cY(z)); c.lineTo(cX(1), cY(z)); c.stroke(); c.fillText(String(z), 2, cY(z) + 3); }
      if (!per) return;
      for (const [arr, color] of [[per.sil, '#d9301c'], [per.ext, '#d4a600']]) {
        c.strokeStyle = color; c.lineWidth = 2; c.beginPath();
        arr.forEach((z, k) => { const X = cX(k / per.N), Y = cY(z); k ? c.lineTo(X, Y) : c.moveTo(X, Y); }); c.stroke();
      }
      for (const lado of ['interno', 'externo']) for (const t of NODOS[lado]) {
        const z = (lado === 'interno' ? per.sil : per.ext)[Math.round(t * per.N)], X = cX(t), Y = arrC?.lado === lado && arrC.t === t ? arrC.Y : cY(z);
        c.fillStyle = lado === 'interno' ? '#d9301c' : '#d4a600'; c.strokeStyle = '#fff'; c.lineWidth = 1.5;
        c.beginPath(); c.arc(X, Y, 5, 0, 7); c.fill(); c.stroke();
      }
      if (arrC) { c.fillStyle = '#1c2430'; c.font = '600 11px system-ui'; c.fillText(`${(cYinv(arrC.Y)).toFixed(1)} mm`, Math.min(cX(arrC.t) + 8, W - 48), arrC.Y - 8); }
    }
    const cYinv = Y => (costado.height - 18 - Y) * 24 / (costado.height - 34);
    const posC = ev => { const r = costado.getBoundingClientRect(); return [(ev.clientX - r.left) * costado.width / r.width, (ev.clientY - r.top) * costado.height / r.height]; };
    costado.addEventListener('pointerdown', ev => {
      if (!per) return;
      const [X, Y] = posC(ev); let mejor = null, dmin = 12;
      for (const lado of ['interno', 'externo']) for (const t of NODOS[lado]) {
        const z = (lado === 'interno' ? per.sil : per.ext)[Math.round(t * per.N)], d = Math.hypot(cX(t) - X, cY(z) - Y);
        if (d < dmin) { dmin = d; mejor = { lado, t, Y: cY(z), z0: z }; }
      }
      if (!mejor) return;
      arrC = mejor; try { costado.setPointerCapture(ev.pointerId); } catch { /* sin captura */ } dibujarCostado();
    });
    costado.addEventListener('pointermove', ev => { if (!arrC) return; arrC.Y = Math.min(Math.max(posC(ev)[1], 8), costado.height - 10); dibujarCostado(); });
    const soltarC = () => {
      if (!arrC) return;
      const { lado, t, Y, z0 } = arrC; arrC = null;
      const objetivo = cYinv(Y); if (Math.abs(objetivo - z0) < 0.15) { dibujarCostado(); return; }
      // la cima del arco siempre queda en el alto de arco del diseño: moverla no cambiaría nada
      if (lado === 'interno' && z0 >= E.valores(def).arco - 0.3) {
        $c('#eh-medidas').textContent = 'La cima del arco queda siempre en el alto de arco del diseño (Neutro, Plano, Cavo o a mano). Aquí se cambia cómo sube y baja: mueva los puntos de los costados de la cima.';
        dibujarCostado(); return;
      }
      guardarPaso(); llevarAltura(lado, t, objetivo); reconstruir();
    };
    costado.addEventListener('pointerup', soltarC); costado.addEventListener('pointercancel', soltarC);
    // sube o baja el tramo alrededor de t hasta que la altura (en la plantilla de muestra) quede en `objetivo`:
    // se multiplica el factor de relieve de ese lado por una campana suave de ±10 % del largo, con puntos cada 2 %
    // para que la curva siga la campana sin quiebres (nunca en la punta del talón)
    const RADIO = 0.1;
    function llevarAltura(lado, t, objetivo) {
      const esp = E.valores(def).antepie;
      if (!def.relieve[lado]?.length) def.relieve[lado] = [[0, 1], [FIN[lado], 1]];
      for (let it = 0; it < 3; it++) {
        const gg = E.generar(E.construir(def), def, true), pp = E.perfil(gg), act = (lado === 'interno' ? pp.sil : pp.ext)[Math.round(t * pp.N)];
        if (Math.abs(act - objetivo) < 0.15) break;
        const kk = Math.min(Math.max((objetivo - esp + 0.05) / (act - esp + 0.05), 0.5), 2);
        const viejo = def.relieve[lado], f = curvaPuntos(viejo);
        // puntos nuevos en la zona de la campana; afuera quedan los de antes
        const fuera = viejo.filter(([a]) => Math.abs(a - t) >= RADIO || a <= 0.05);
        const dentro = [];
        for (let tt = t - RADIO + 0.02; tt < t + RADIO - 0.001; tt += 0.02) {
          if (tt <= 0.05) continue;
          const dd = Math.abs(tt - t), w = 0.5 * (1 + Math.cos(Math.PI * dd / RADIO));
          dentro.push([+tt.toFixed(3), +(f(tt) * (1 + (kk - 1) * w)).toFixed(4)]);
        }
        def.relieve[lado] = [...fuera, ...dentro].sort((a, b) => a[0] - b[0]);
      }
    }

    // --- campos y botones ---
    $c('#eh-tipo').onchange = () => { guardarPaso(); def.tipo = $c('#eh-tipo').value; pronto(); };
    $c('#eh-arcopos').oninput = () => { const v = parseFloat($c('#eh-arcopos').value); if (v >= 28 && v <= 52) { def.valores.arcoPos = v / 100; pronto(); } };
    $c('#eh-deshacer').onclick = () => { const s = hist.pop(); if (!s) return; Object.assign(def, JSON.parse(s)); $c('#eh-tipo').value = def.tipo; $c('#eh-arcopos').value = Math.round((def.valores.arcoPos ?? 0.35) * 100); mapaA = null; reconstruir(); };
    $c('#eh-cancelar').onclick = cerrarVentana;
    const guardarH = id => {
      const nombre = $c('#eh-nombre').value.trim() || origen?.nombre || 'Horma sin nombre';
      const r1 = v => Math.round(v * 10) / 10, r3 = v => Math.round(v * 1000) / 1000;
      const limpia = { ...def, nombre, puntos: def.puntos?.map(([x, y]) => [r1(x), r1(y)]),
        relieve: Object.fromEntries(Object.entries(def.relieve).filter(([, a]) => a?.length).map(([k, a]) => [k, a.map(([t, f]) => [r3(t), r3(f)])])) };
      limpia.id = id ?? 'horma_' + nombre.normalize('NFD').replace(/[^\w]+/g, '_').toLowerCase().slice(0, 30) + '_' + Date.now().toString(36);
      delete limpia.oculta;
      const d = ctx.datosHormas();
      ctx.guardarHormas({ ...d, hormas: [...(d.hormas ?? []).filter(h => h.id !== limpia.id), limpia] });
      cerrarVentana(); pintar();
    };
    $c('#eh-nuevo').onclick = () => {
      const nombre = $c('#eh-nombre').value.trim();
      if (origen && (!nombre || nombre === origen.nombre)) { alert(`Para guardarla como horma nueva póngale otro nombre (distinto de "${origen.nombre}").`); $c('#eh-nombre').select(); return; }
      if (!nombre) { $c('#eh-nombre').focus(); return; }
      guardarH(null);
    };
    $c('#eh-sobrescribir')?.addEventListener('click', () => {
      if (!confirm(`¿Sobrescribir la horma "${origen.nombre}"?\n\nLos diseños que la usan toman la forma nueva al abrirse.${origen.programa ? ' Se puede volver al original desde la Biblioteca.' : ''}`)) return;
      guardarH(origen.id);
    });
    reconstruir();
    $c('#eh-nombre').focus();
  }

  function elegirBase(descarga = false) {
    const caja = cuerpo.querySelector('#editorElemento'), bases = descarga ? BASES_DESCARGA : BASES, nombres = descarga ? NOMBRE_BASE_DESCARGA : NOMBRE_BASE;
    caja.innerHTML = `<div class="editor-elem"><h3>${descarga ? 'Nueva descarga' : 'Nuevo elemento'}: elija la forma base</h3>
      <div class="bases">${Object.keys(bases).map(k => `<button data-base="${k}"><canvas width="90" height="126" data-mini-base="${k}"></canvas><span>${nombres[k]}</span></button>`).join('')}</div>
      <button id="cerrarBase">Cancelar</button></div>`;
    caja.querySelectorAll('[data-mini-base]').forEach(cv => ctx.miniatura(bases[cv.dataset.miniBase], cv));
    caja.querySelectorAll('[data-base]').forEach(b => b.onclick = () => abrirEditor(copia(bases[b.dataset.base]), null));
    caja.querySelector('#cerrarBase').onclick = cerrarVentana;
  }
  // el editor va en una ventana aparte, sobre la biblioteca (Ernesto, 2026-11-14): Esc o Cancelar la cierran
  let vista3dCerrar = () => {};
  function cerrarVentana() { editando = null; vista3dCerrar(); vista3dCerrar = () => {}; const c = cuerpo.querySelector('#editorElemento'); if (c) c.innerHTML = ''; }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && cuerpo.querySelector('#editorElemento')?.childElementCount) cerrarVentana(); });

  // origen = { id, nombre, programa } cuando se edita uno que existe (se puede sobrescribir), o null si es nuevo
  function abrirEditor(def, origen) { editando = { def, origen }; pintarEditor(); }
  function pintarEditor() {
    const caja = cuerpo.querySelector('#editorElemento'), { def, origen } = editando, campos = camposDe(def);
    // pantalla completa (Ernesto, 2026-11-14): campos a la izquierda, la plantilla en 3D al centro (se gira como en
    // el diseño) y la caja 2D a la derecha; los botones de guardar arriba
    caja.innerHTML = `<div class="editor-elem completo" role="dialog" aria-modal="true" aria-label="Editar elemento">
      <div class="editor-cab">
        <div><h3>${origen ? 'Editar: ' + esc(origen.nombre) : def.descarga ? 'Nueva descarga' : 'Nuevo elemento'}</h3>
          ${origen ? `<p class="bib-nota">Al terminar elija: <b>Guardar como nuevo</b> (con otro nombre; ${esc(origen.nombre)} queda igual) o <b>Sobrescribir</b> ${esc(origen.nombre)}.</p>` : ''}</div>
        <div class="editor-botones"><button id="ed-cancelar">Cancelar</button>${origen
          ? `<button id="ed-sobrescribir" title="Reemplaza a ${esc(origen.nombre)}${origen.programa ? ' (se puede volver al original desde su tarjeta)' : ''}">Sobrescribir ${esc(origen.nombre)}</button><button class="primario" id="ed-nuevo">Guardar como nuevo</button>`
          : '<button class="primario" id="ed-nuevo">Guardar en la biblioteca</button>'}</div>
      </div>
      <div class="editor-grid">
        <div class="editor-campos">
          <label>Nombre <input type="text" id="ed-nombre" value="${esc(def.nombre)}"></label>
          ${def.descarga ? '<input type="hidden" id="ed-cat" value="Descargas">'
            : `<label>Categoría <select id="ed-cat">${CATEGORIAS.map(c => `<option ${c === (def.categoria || 'Otros') ? 'selected' : ''}>${c}</option>`).join('')}</select></label>`}
          ${campos.map((c, i) => c.opciones
            ? `<label>${c.etq} <select data-campo="${i}">${c.opciones.map(([v, t]) => `<option value="${v}" ${leerRuta(def, c.ruta) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>`
            : `<label>${c.etq} <input type="number" data-campo="${i}" min="${c.min}" max="${c.max}" step="${c.paso}" value="${c.pct ? Math.round((leerRuta(def, c.ruta) ?? 0) * 100) : (leerRuta(def, c.ruta) ?? c.min)}"></label>`).join('')}
        </div>
        <div class="editor-3d">
          <canvas id="ed-3d" aria-label="Plantilla con el elemento en 3D"></canvas>
          <canvas id="ed-3d-capa" class="ed-3d-capa" aria-hidden="true"></canvas>
          <canvas id="ed-cubo" class="ed-cubo" title="Clic en una cara o esquina para mirar desde ahí; arrastrar para girar" aria-label="Cubo de vistas"></canvas>
          <span class="ed-ayuda-3d" id="ed-ayuda-3d">Arrastrar: mover · Clic derecho + arrastrar: girar · Rueda: acercar</span>
        </div>
        <div class="editor-vista"><canvas id="ed-mini" width="300" height="420" aria-label="Vista de arriba para la caja"></canvas>
          <span id="ed-ayuda-vista">Vista de arriba (pie izquierdo, 240 mm)</span>
          <div class="ed-caja-herr" id="ed-caja-herr" role="group" aria-label="Herramienta de la caja" hidden>
            <button data-herr="mover" class="activo">Mover</button><button data-herr="girar">Girar</button><button data-herr="escala1">Escala 1D</button><button data-herr="escala2">Escala 2D</button></div>
          <div class="ed-caja-botones"><button id="ed-caja" aria-pressed="false">Editar forma con la caja</button><button id="ed-caja-reset" ${def.caja ? '' : 'hidden'}>Restablecer forma</button></div></div>
      </div>
    </div>`;
    // 3D: se rehace junto con la vista de arriba (cada cambio de un campo o de la caja)
    let v3 = null;
    try { v3 = ctx.vista3D?.(caja.querySelector('#ed-3d'), caja.querySelector('#ed-cubo')); } catch { caja.querySelector('.ed-ayuda-3d').textContent = 'Este navegador no puede mostrar 3D.'; }
    vista3dCerrar = () => v3?.cerrar();
    // ---- Caja (como "Editar 2D" de la biblioteca de LutraCAD): cuadro de 5 × 5 puntos sobre el elemento. Clic en un
    // punto lo elige (Shift + clic suma o quita), arrastrar en vacío elige los de adentro del rectángulo, y arrastrar
    // un punto elegido mueve todos los elegidos. La forma se deforma suave con la grilla (lo hace el motor).
    const cv = caja.querySelector('#ed-mini'), NF = 5, NC = 5;
    let conCaja = false, sel = new Set(), rect = null, tVista = null, herr = 'mover';
    const puntoInicial = i => { const c = def.caja, j = Math.floor(i / NC), k = i % NC; return [c.u0 + (j / (NF - 1)) * (c.u1 - c.u0), c.v0 + (k / (NC - 1)) * (c.v1 - c.v0)]; };
    // m = { aPx(u, v) → [x, y], dePx(x, y) → [u, v] }: el dibujo de la derecha (cv._mapa) o la vista Arriba del 3D
    const puntoEn = (m, i) => { const [u, v] = puntoInicial(i), d = def.caja.d[i]; return m.aPx(u + d[0], v + d[1]); };
    const puntoPx = i => puntoEn(cv._mapa, i);
    const pintarGrilla = (c, m, rectAqui) => {
      const P = def.caja.d.map((_, i) => puntoEn(m, i));
      c.save(); c.setLineDash([2, 3]); c.strokeStyle = 'rgba(20,30,50,.7)'; c.lineWidth = 1;
      for (let j = 0; j < NF; j++) { c.beginPath(); for (let k = 0; k < NC; k++) { const [x, y] = P[j * NC + k]; k ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
      for (let k = 0; k < NC; k++) { c.beginPath(); for (let j = 0; j < NF; j++) { const [x, y] = P[j * NC + k]; j ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
      c.restore();
      P.forEach(([x, y], i) => { c.beginPath(); c.arc(x, y, sel.has(i) ? 5 : 4, 0, 7); c.fillStyle = sel.has(i) ? '#12b33c' : '#fff'; c.fill(); c.strokeStyle = '#1e2a3c'; c.lineWidth = 1.4; c.stroke(); });
      if (rectAqui) { c.save(); c.setLineDash([4, 3]); c.strokeStyle = '#e0661b'; c.strokeRect(Math.min(rectAqui[0], rectAqui[2]), Math.min(rectAqui[1], rectAqui[3]), Math.abs(rectAqui[2] - rectAqui[0]), Math.abs(rectAqui[3] - rectAqui[1])); c.restore(); }
    };
    const dibujarCaja = () => {
      if (!conCaja || !cv._mapa || !def.caja) return;
      pintarGrilla(cv.getContext('2d'), cv._mapa, rect?.en === '2d' ? rect : null);
      v3?.visor.pedir();
    };
    // Arrastre de los puntos de arriba (en el dibujo o en el 3D): Mover, Girar, Escala 1D/2D en píxeles (mm a
    // escala, igual en las dos direcciones), alrededor del centro de los elegidos (o de toda la caja si es uno solo).
    // Devuelve null si no se tocó un punto.
    const tocarPunto = (m, px, py) => { let hit = -1, dmin = 9; def.caja.d.forEach((_, i) => { const [x, y] = puntoEn(m, i), d = Math.hypot(x - px, y - py); if (d < dmin) { dmin = d; hit = i; } }); return hit; };
    const arrastrarPuntos = (m, px, py) => {
      const P0 = def.caja.d.map((_, i) => puntoEn(m, i)), idx = [...sel];
      const grupo = idx.length > 1 ? idx : P0.map((_, i) => i);
      const C = [grupo.reduce((a, i) => a + P0[i][0], 0) / grupo.length, grupo.reduce((a, i) => a + P0[i][1], 0) / grupo.length];
      const r0 = [px - C[0], py - C[1]], eje = Math.abs(r0[0]) > Math.abs(r0[1]) ? 0 : 1;
      return (mx, my) => {
        const r = [mx - C[0], my - C[1]];
        for (const i of idx) {
          const a = P0[i]; let n;
          if (herr === 'mover') n = [a[0] + mx - px, a[1] + my - py];
          else if (herr === 'girar') {
            const g = Math.atan2(r[1], r[0]) - Math.atan2(r0[1], r0[0]), cg = Math.cos(g), sg = Math.sin(g), dx = a[0] - C[0], dy = a[1] - C[1];
            n = [C[0] + dx * cg - dy * sg, C[1] + dx * sg + dy * cg];
          } else if (herr === 'escala2') {
            const k = Math.hypot(...r) / Math.max(Math.hypot(...r0), 1); n = [C[0] + (a[0] - C[0]) * k, C[1] + (a[1] - C[1]) * k];
          } else {
            const k = Math.abs(r0[eje]) > 2 ? r[eje] / r0[eje] : 1; n = [...a]; n[eje] = C[eje] + (a[eje] - C[eje]) * k;
          }
          const uv = m.dePx(n[0], n[1]); if (!uv || !Number.isFinite(uv[0]) || !Number.isFinite(uv[1])) continue;
          const u0 = puntoInicial(i); def.caja.d[i] = [uv[0] - u0[0], uv[1] - u0[1]];
        }
        vistaPronto();
      };
    };
    const elegirEnRect = (m, R) => def.caja.d.forEach((_, i) => { const [x, y] = puntoEn(m, i); if (x >= Math.min(R[0], R[2]) && x <= Math.max(R[0], R[2]) && y >= Math.min(R[1], R[3]) && y <= Math.max(R[1], R[3])) sel.add(i); });
    let imagen = null;   // el dibujo sin la caja, para repintar solo la caja encima
    // con la caja se acerca al elemento: el tramo de la plantilla donde está, con margen (se fija al abrir la caja
    // para que la vista no salte mientras se arrastra)
    let zona = null;
    const fijarZona = () => {
      const c = def.caja, us = c.d.map((d, i) => puntoInicial(i)[0] + d[0]);
      const a = Math.min(...us), b = Math.max(...us), m = Math.max(0.12, (b - a) * 0.6);
      zona = { u0: Math.max(a - m, 0), u1: Math.min(b + m, 1) };
    };
    const vista = () => { v3?.poner(def); ctx.miniatura(def, cv, conCaja ? { sinInicial: true, zona } : { sinInicial: true }); imagen = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height); dibujarCaja(); };
    // durante el arrastre la forma se rehace como mucho cada 90 ms
    const vistaPronto = () => { if (!tVista) tVista = setTimeout(() => { tVista = null; vista(); }, 90); };
    const pintarBotonesCaja = () => {
      const b = caja.querySelector('#ed-caja'); b.setAttribute('aria-pressed', conCaja); b.classList.toggle('activo', conCaja);
      b.textContent = conCaja ? 'Terminar la caja' : 'Editar forma con la caja';
      caja.querySelector('#ed-caja-reset').hidden = !def.caja && !def.perfil;
      caja.querySelector('#ed-caja-herr').hidden = !conCaja;
      caja.querySelectorAll('[data-herr]').forEach(x => x.classList.toggle('activo', x.dataset.herr === herr));
      caja.querySelector('#ed-ayuda-vista').textContent = conCaja ? 'Clic en un punto lo elige (Shift suma) · arrastre en vacío para elegir varios · arrastre los elegidos para dar forma' : 'Vista previa (pie izquierdo, 240 mm)';
    };
    caja.querySelector('#ed-caja').onclick = () => {
      conCaja = !conCaja; sel.clear();
      if (conCaja && !def.caja) { const r = ctx.recuadro(def); def.caja = { ...r, nf: NF, nc: NC, d: Array.from({ length: NF * NC }, () => [0, 0]) }; }
      // caja de costado (alto a lo largo): en el mismo tramo que la caja de arriba
      if (conCaja && !def.perfil) def.perfil = { u0: def.caja.u0, u1: def.caja.u1, f: Array(NP).fill(1) };
      if (!conCaja && def.caja?.d.every(d => !d[0] && !d[1])) delete def.caja;
      if (!conCaja && def.perfil?.f.every(f => Math.abs(f - 1) < 1e-3)) delete def.perfil;
      if (conCaja) { fijarZona(); v3?.acercar(zona.u0, zona.u1); v3?.vista('arriba'); }
      selP.clear(); pintarBotonesCaja(); vista();
    };
    caja.querySelectorAll('[data-herr]').forEach(x => x.onclick = () => { herr = x.dataset.herr; pintarBotonesCaja(); });
    caja.querySelector('#ed-caja-reset').onclick = () => { delete def.caja; delete def.perfil; sel.clear(); selP.clear(); conCaja = false; pintarBotonesCaja(); vista(); };
    const enCanvas = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) * (cv.width / r.width), (e.clientY - r.top) * (cv.height / r.height)]; };
    cv.onpointerdown = e => {
      if (!conCaja || !cv._mapa) return;
      const [px, py] = enCanvas(e), hit = tocarPunto(cv._mapa, px, py);
      cv.setPointerCapture(e.pointerId);
      if (hit < 0) { rect = [px, py, px, py]; rect.en = '2d'; if (!e.shiftKey) sel.clear(); dibujarCaja(); return; }
      if (e.shiftKey) { sel.has(hit) ? sel.delete(hit) : sel.add(hit); vista(); return; }
      if (!sel.has(hit)) { sel.clear(); sel.add(hit); }
      const mover = arrastrarPuntos(cv._mapa, px, py);
      cv.onpointermove = ev => mover(...enCanvas(ev));
    };
    cv.addEventListener('pointermove', e => { if (rect?.en === '2d') { const [px, py] = enCanvas(e); rect[2] = px; rect[3] = py; if (imagen) cv.getContext('2d').putImageData(imagen, 0, 0); dibujarCaja(); } });
    cv.onpointerup = () => {
      cv.onpointermove = null;
      if (rect?.en === '2d') { elegirEnRect(cv._mapa, rect); rect = null; }
      terminarArrastre();
    };
    const terminarArrastre = () => {
      // si se tiró un punto fuera del dibujo de la derecha, se vuelve a encuadrar
      const fuera = def.caja?.d.some((_, i) => { const [x, y] = puntoPx(i); return x < 4 || y < 4 || x > cv.width - 4 || y > cv.height - 4; });
      if (fuera) fijarZona();
      clearTimeout(tVista); tVista = null; vista(); pintarBotonesCaja();
    };

    // ---- La caja también en el 3D (Ernesto, 2026-11-14, como LutraCAD) ----
    // · Vista Arriba: los mismos puntos que en el dibujo de la derecha, con las mismas herramientas.
    // · Vistas de costado (Interno / Externo): la caja de costado, 5 puntos arriba a lo largo del elemento. Subir o
    //   bajar uno sube o baja el elemento en ese tramo (perfil de alto, `def.perfil`); con varios elegidos, todos.
    const NP = 5, capa = caja.querySelector('#ed-3d-capa'), cv3 = caja.querySelector('#ed-3d');
    let selP = new Set();
    const modo3D = () => {
      const c = v3?.visor.camara(); if (!c) return null;
      if (c.elev > 60) return 'arriba';
      return Math.abs(c.elev) < 35 && Math.abs(Math.sin((c.giro * Math.PI) / 180)) > 0.8 ? 'costado' : null;
    };
    // la vista Arriba del 3D como "dibujo": de (u, v) a píxeles del lienzo y de vuelta (por el piso, z = 0)
    const mapa3D = () => {
      const m = v3?.mapa(); if (!m) return null;
      const V = v3.visor;
      return {
        aPx: (u, v) => { const [x, y] = m.aMundo(u, v), s = V.proyectar([x, y, 0]); return [s.x, s.y]; },
        dePx: (px, py) => { const { o, d } = V.rayo(px, py); if (Math.abs(d[2]) < 1e-9) return null; const t = -o[2] / d[2]; return m.deMundo(o[0] + t * d[0], o[1] + t * d[1]); },
      };
    };
    const uPerfil = j => def.perfil.u0 + (j / (NP - 1)) * (def.perfil.u1 - def.perfil.u0);
    const puntosPerfil = () => {
      const V = v3.visor, out = [];
      for (let j = 0; j < NP; j++) {
        const c = v3.cresta(uPerfil(j)); if (!c) { out.push(null); continue; }
        const a = V.proyectar([c.x, c.y, c.z]), b = V.proyectar([c.x, c.y, c.base]);
        out.push({ ...c, arriba: [a.x, a.y], abajo: [b.x, b.y] });
      }
      return out;
    };
    const dibujar3D = () => {
      // la ventana del editor ya se cerró pero el visor alcanzó a pedir un último cuadro (auditoría 2026-11-16)
      if (!capa || !capa.isConnected || !caja.querySelector('#ed-ayuda-3d')) return;
      const dpr = window.devicePixelRatio || 1, w = capa.clientWidth, h = capa.clientHeight;
      if (capa.width !== Math.round(w * dpr) || capa.height !== Math.round(h * dpr)) { capa.width = Math.round(w * dpr); capa.height = Math.round(h * dpr); }
      const c = capa.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      const modo = conCaja ? modo3D() : null;
      caja.querySelector('#ed-ayuda-3d').textContent = !conCaja ? 'Arrastrar: mover · Clic derecho + arrastrar: girar · Rueda: acercar'
        : modo === 'arriba' ? 'Caja: arrastre los puntos para dar forma (Shift suma, arrastrar en vacío elige varios) · Clic derecho: girar la vista'
        : modo === 'costado' ? 'Caja de costado: suba o baje los puntos de arriba para cambiar el alto (Shift suma) · Clic derecho: girar la vista'
        : 'Para usar la caja en el 3D, mire desde Arriba o de costado (Interno / Externo)';
      if (modo === 'arriba' && def.caja) { const m = mapa3D(); if (m) pintarGrilla(c, m, rect?.en === '3d' ? rect : null); }
      if (modo === 'costado' && def.perfil) {
        const P = puntosPerfil(), ok = P.filter(Boolean);
        c.save(); c.setLineDash([2, 3]); c.strokeStyle = 'rgba(20,30,50,.75)'; c.lineWidth = 1;
        for (const k of ['arriba', 'abajo']) { c.beginPath(); ok.forEach((p, i) => (i ? c.lineTo(...p[k]) : c.moveTo(...p[k]))); c.stroke(); }
        for (const p of ok) { c.beginPath(); c.moveTo(...p.arriba); c.lineTo(...p.abajo); c.stroke(); }
        c.restore();
        P.forEach((p, j) => {
          if (!p) return;
          c.beginPath(); c.arc(...p.abajo, 3, 0, 7); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#1e2a3c'; c.lineWidth = 1.2; c.stroke();
          c.beginPath(); c.arc(...p.arriba, selP.has(j) ? 6 : 5, 0, 7); c.fillStyle = selP.has(j) ? '#12b33c' : '#fff'; c.fill(); c.lineWidth = 1.5; c.stroke();
          if (selP.has(j)) { c.fillStyle = '#0d1a36'; c.font = '600 12px system-ui, sans-serif'; c.fillText(`${p.alto.toFixed(1).replace('.', ',')} mm`, p.arriba[0] + 8, p.arriba[1] - 8); }
        });
      }
    };
    v3?.visor.alDibujar(dibujar3D);
    v3?.visor.alAgarrar((px, py, e) => {
      if (!conCaja) return null;
      const modo = modo3D();
      if (modo === 'arriba' && def.caja) {
        const m = mapa3D(); if (!m) return null;
        const hit = tocarPunto(m, px, py);
        if (hit < 0) {
          // arrastrar en vacío elige los puntos de adentro (como en el dibujo); para mover la vista, clic derecho
          rect = [px, py, px, py]; rect.en = '3d'; if (!e.shiftKey) sel.clear(); v3.visor.pedir();
          return { mover(x, y) { rect[2] = x; rect[3] = y; v3.visor.pedir(); }, soltar() { elegirEnRect(m, rect); rect = null; vista(); } };
        }
        if (e.shiftKey) { sel.has(hit) ? sel.delete(hit) : sel.add(hit); vista(); return { mover() {}, soltar() {} }; }
        if (!sel.has(hit)) { sel.clear(); sel.add(hit); }
        const mover = arrastrarPuntos(m, px, py);
        return { mover, soltar: terminarArrastre };
      }
      if (modo === 'costado' && def.perfil) {
        const P = puntosPerfil(); let hit = -1, dmin = 10;
        P.forEach((p, j) => { if (p) { const d = Math.hypot(p.arriba[0] - px, p.arriba[1] - py); if (d < dmin) { dmin = d; hit = j; } } });
        if (hit < 0) return null;
        if (e.shiftKey) { selP.has(hit) ? selP.delete(hit) : selP.add(hit); v3.visor.pedir(); return { mover() {}, soltar() {} }; }
        if (!selP.has(hit)) { selP.clear(); selP.add(hit); }
        // mm por píxel en la vertical de la pantalla, y el alto de cada punto elegido al empezar
        const p = P[hit], V = v3.visor, s1 = V.proyectar([p.x, p.y, p.z + 10]), pxMm = Math.max(Math.hypot(s1.x - p.arriba[0], s1.y - p.arriba[1]) / 10, 1e-3);
        const f0 = [...def.perfil.f], alto0 = P.map(q => q?.alto ?? 0);
        return {
          mover(x, y) {
            const dz = (py - y) / pxMm;
            for (const j of selP) if (alto0[j] > 0.15) def.perfil.f[j] = Math.max(f0[j] * (alto0[j] + dz) / alto0[j], 0);
            vistaPronto();
          },
          soltar: () => { clearTimeout(tVista); tVista = null; vista(); },
        };
      }
      return null;
    });
    let t = null;
    caja.querySelectorAll('[data-campo]').forEach(inp => inp.oninput = inp.onchange = () => {
      const c = campos[+inp.dataset.campo];
      if (c.opciones) ponerRuta(def, c.ruta, inp.value);
      else { const v = parseFloat(inp.value); if (!Number.isFinite(v)) return; ponerRuta(def, c.ruta, c.pct ? Math.min(Math.max(v, c.min), c.max) / 100 : Math.min(Math.max(v, c.min), c.max)); }
      clearTimeout(t); t = setTimeout(vista, 120);
    });
    caja.querySelector('#ed-cancelar').onclick = cerrarVentana;
    // Guardar como nuevo (id nuevo, el de origen queda igual) o Sobrescribir (mismo id: los diseños que lo usan
    // cambian al abrirse). Sobrescribir uno del programa lo guarda en la biblioteca compartida con su mismo id.
    caja.querySelector('#ed-nuevo').onclick = () => {
      const nombre = caja.querySelector('#ed-nombre').value.trim();
      if (origen && (!nombre || nombre === origen.nombre)) {
        alert(`Para guardarlo como elemento nuevo póngale otro nombre (distinto de "${origen.nombre}").`);
        caja.querySelector('#ed-nombre').focus(); caja.querySelector('#ed-nombre').select(); return;
      }
      guardarDef(null);
    };
    caja.querySelector('#ed-sobrescribir')?.addEventListener('click', () => {
      if (!confirm(`¿Sobrescribir "${origen.nombre}" con esta forma?\n\nLos diseños que ya lo usan toman la forma nueva al abrirse.${origen.programa ? ' Se puede volver al original desde su tarjeta.' : ''}`)) return;
      guardarDef(origen.id);
    });
    const guardarDef = id => {
      def.nombre = caja.querySelector('#ed-nombre').value.trim() || origen?.nombre || 'Elemento sin nombre';
      def.categoria = caja.querySelector('#ed-cat').value;
      // caja sin cambios: no se guarda; con cambios, redondeada (no hace falta más precisión)
      if (def.caja) {
        if (def.caja.d.every(d => !d[0] && !d[1])) delete def.caja;
        else { const r = v => Math.round(v * 1e5) / 1e5; def.caja = { ...def.caja, u0: r(def.caja.u0), u1: r(def.caja.u1), v0: r(def.caja.v0), v1: r(def.caja.v1), d: def.caja.d.map(d => d.map(r)) }; }
      }
      if (def.perfil) {
        if (def.perfil.f.every(f => Math.abs(f - 1) < 1e-3)) delete def.perfil;
        else def.perfil = { u0: Math.round(def.perfil.u0 * 1e5) / 1e5, u1: Math.round(def.perfil.u1 * 1e5) / 1e5, f: def.perfil.f.map(f => Math.round(f * 1000) / 1000) };
      }
      def.id = id ?? 'propio_' + def.nombre.normalize('NFD').replace(/[^\w]+/g, '_').toLowerCase().slice(0, 30) + '_' + Date.now().toString(36);
      const d = ctx.datos(), otros = (d.elementos ?? []).filter(e => e.id !== def.id);
      ctx.guardar({ ...d, elementos: [...otros, def] });
      cerrarVentana(); pintar();
    };
    vista();
    caja.querySelector('#ed-nombre').focus();
  }

  pintar();
}
