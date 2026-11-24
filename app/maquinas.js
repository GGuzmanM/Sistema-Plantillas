// Máquinas (Ernesto, 2026-11-19, como la "mesa de trabajo" de LutraCAD): varias mesas de trabajo para la fresadora de EVA
// y perfiles de impresora 3D. Se editan en Inicio → Máquinas y se guardan en la carpeta compartida
// (Biblioteca/maquinas.json), así las tres PC ven las mismas. En el diseño solo se elige cuál usar.
//
// Los valores de fábrica de la VX1R salen de los trabajos reales de la máquina (.iso de EdingCNC hechos con LutraCAD:
// S24000, F14400 / F900 / F1800, filas cada 0,5 mm, puntos cada 2 mm, Z 55, contorno a Z 15 y Z 1); la fresa de bola
// de 10 mm la indicó Ernesto.

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// campos de una mesa de trabajo (fresadora de EVA). g = título de grupo; t = 'si' para casillas
export const CAMPOS_MESA = [
  { g: 'Bloque de EVA' },
  { k: 'largo', etq: 'Largo del bloque', u: 'mm', min: 150, max: 600, paso: 1, def: 350 },
  { k: 'ancho', etq: 'Ancho del bloque', u: 'mm', min: 100, max: 500, paso: 1, def: 260 },
  { k: 'alto', etq: 'Alto del bloque (por defecto)', u: 'mm', min: 10, max: 60, paso: 0.5, def: 26, ayuda: 'En cada diseño se puede cambiar por el del bloque que se use.' },
  { g: 'Fresa' },
  { k: 'diametro', etq: 'Diámetro (punta redonda)', u: 'mm', min: 2, max: 25, paso: 0.5, def: 10 },
  { k: 'husillo', etq: 'Giro de la fresa', u: 'rpm', min: 1000, max: 40000, paso: 500, def: 24000 },
  { g: 'Velocidades de avance' },
  { k: 'trasladar', etq: 'Trasladar (en el aire)', u: 'mm/min', min: 100, max: 30000, paso: 100, def: 14400 },
  { k: 'bajar', etq: 'Bajar (entrar al EVA)', u: 'mm/min', min: 50, max: 10000, paso: 50, def: 900 },
  // cortar y relieve (2026-11-23, Ernesto): ya no están en la mesa; dependen de la dureza y están en Materiales EVA
  { k: 'entradaLenta', etq: 'Ancho que entra despacio', u: 'mm', min: 0, max: 50, paso: 0.5, def: 3.5, ayuda: 'Primeros mm de cada plantilla a la velocidad de cortar del material, mientras la fresa entra en el bloque.' },
  { g: 'Relieve (pasadas)' },
  { k: 'pasoY', etq: 'Paso entre filas (a lo ancho)', u: 'mm', min: 0.1, max: 5, paso: 0.1, def: 0.5, ayuda: 'Más chico = más liso y más lento.' },
  { k: 'pasoX', etq: 'Paso entre puntos (a lo largo)', u: 'mm', min: 0.2, max: 10, paso: 0.1, def: 2 },
  { k: 'sobreespesor', etq: 'Dejar de más arriba', u: 'mm', min: 0, max: 3, paso: 0.1, def: 0, ayuda: 'Material que queda sobre la plantilla para lijar o pulir (0 = exacto).' },
  { g: 'Contorno (corte del borde)' },
  { k: 'contorno', etq: 'Cortar el contorno', t: 'si', def: true },
  { k: 'zContorno1', etq: '1.ª vuelta a', u: 'mm', min: 0, max: 60, paso: 0.5, def: 15 },
  { k: 'zContorno2', etq: '2.ª vuelta a (sin cortar del todo)', u: 'mm', min: 0, max: 60, paso: 0.5, def: 1, ayuda: 'Lo que queda sin cortar para que las plantillas no se suelten.' },
  { k: 'margenContorno', etq: 'Corte más afuera del borde', u: 'mm', min: 0, max: 10, paso: 0.5, def: 0 },
  { g: 'Ubicación en el bloque' },
  { k: 'separacion', etq: 'Borde interno al centro del bloque', u: 'mm', min: 0, max: 60, paso: 0.5, def: 7 },
  { k: 'zSeguro', etq: 'Altura segura (para trasladar)', u: 'mm', min: 20, max: 150, paso: 1, def: 55 },
];
// campos de una impresora 3D: el programa avisa si la plantilla no entra en su área
export const CAMPOS_IMPRESORA = [
  { g: 'Área de impresión' },
  { k: 'x', etq: 'Largo (X)', u: 'mm', min: 50, max: 1000, paso: 1, def: 325 },
  { k: 'y', etq: 'Ancho (Y)', u: 'mm', min: 50, max: 1000, paso: 1, def: 320 },
  { k: 'z', etq: 'Alto (Z)', u: 'mm', min: 20, max: 1000, paso: 1, def: 325 },
  { g: 'Notas' },
  { k: 'notas', etq: 'Material, perfil del laminador…', t: 'texto', def: '' },
];
// materiales EVA (Ernesto, 2026-11-21: fresa tres densidades, Relax S20, Protection S40 y Dynamic S50). Cada uno
// lleva sus velocidades; en el diseño se elige el material y esas velocidades reemplazan a las de la mesa. De
// fábrica (punto medio, 2026-11-21): entrada y contorno a 1800 como LutraCAD; relieve 6600 / 6000 / 5400 según la
// dureza (todo a 1800 eran 40 min; LutraCAD 14400). Se afinan en Inicio → Máquinas tras probar cada uno.
export const CAMPOS_MATERIAL = [
  { g: 'Material' },
  { k: 'shore', etq: 'Dureza (Shore A)', u: 'S', min: 5, max: 90, paso: 1, def: 40 },
  { g: 'Velocidades con este material' },
  { k: 'cortar', etq: 'Cortar (entrada y contorno)', u: 'mm/min', min: 100, max: 20000, paso: 100, def: 1800, ayuda: 'Al entrar en el EVA (primeras filas de cada plantilla) y al cortar el borde.' },
  { k: 'relieve', etq: 'Fresar el relieve', u: 'mm/min', min: 100, max: 30000, paso: 100, def: 6000, ayuda: 'El resto de la superficie. Más duro = más carga en la fresa: un poco más lento. Si el EVA se rasga o queda con pelusa, bajarla.' },
  { g: 'Notas' },
  { k: 'notas', etq: 'Color, proveedor, observaciones…', t: 'texto', def: '' },
];
// materiales de impresión 3D (resinas, Ernesto 2026-11-22): Class TPU, Glam TPU y 3D. Sin velocidades (las pone la
// impresora); la densidad es para el peso aproximado del par
export const CAMPOS_RESINA = [
  { g: 'Material' },
  { k: 'densidad', etq: 'Densidad', u: 'g/cm³', min: 0.1, max: 3, paso: 0.01, def: 1.2, ayuda: 'Del material macizo, para el peso aproximado del par. A confirmar con el material real.' },
  { g: 'Notas' },
  { k: 'notas', etq: 'Color, proveedor, perfil de impresión…', t: 'texto', def: '' },
];
// impresoras de cinta sin fin (BETA, Ernesto 2026-11-23): el perfil con que el programa lamina (motor/cinta.js). De
// fábrica, la PodoTec3D Model 1 con los perfiles de ideaMaker de Ernesto: máquina "PLANTAR3D- 08- OCT25" (1.printer),
// filamento PLANTAR3D TPU F 95A (2.filament; flujo 70 %, confirmado por Ernesto) y lo que hace el perfil de laminado
// (3.bin está cifrado: los valores salen del G-code de referencia "PRUEBA ERNESTO PT2").
export const CAMPOS_CINTA = [
  { g: 'Máquina' },
  { k: 'angulo', etq: 'Ángulo del cabezal', u: '°', min: 15, max: 60, paso: 1, def: 30 },
  { k: 'ancho', etq: 'Ancho de impresión (X)', u: 'mm', min: 50, max: 1000, paso: 1, def: 210 },
  { k: 'alto', etq: 'Alto de impresión', u: 'mm', min: 20, max: 1000, paso: 1, def: 180 },
  { k: 'centroX', etq: 'Centro de las plantillas (X)', u: 'mm', min: 20, max: 500, paso: 0.5, def: 105 },
  { k: 'separacion', etq: 'Separación entre plantillas', u: 'mm', min: 0, max: 100, paso: 1, def: 10, ayuda: 'En la cinta, del talón de una a la punta de la siguiente.' },
  { g: 'Filamento' },
  { k: 'temp', etq: 'Temperatura de la boquilla', u: '°C', min: 150, max: 310, paso: 1, def: 250 },
  { k: 'flujo', etq: 'Flujo (M221)', u: '%', min: 30, max: 150, paso: 1, def: 70 },
  { k: 'filamento', etq: 'Diámetro del filamento', u: 'mm', min: 1, max: 3, paso: 0.05, def: 1.75 },
  { k: 'densidad', etq: 'Densidad', u: 'kg/m³', min: 100, max: 3000, paso: 1, def: 710, ayuda: 'Para el peso en gramos (TPU espumado PLANTAR3D: 710).' },
  { g: 'Capas y líneas' },
  { k: 'paso', etq: 'Avance de cinta por capa', u: 'mm', min: 0.2, max: 2, paso: 0.05, def: 0.9, ayuda: 'Espesor de capa = avance × sen(ángulo): 0,9 mm → 0,45 mm. La primera capa avanza el doble.' },
  { k: 'linea', etq: 'Ancho de línea', u: 'mm', min: 0.3, max: 1.5, paso: 0.01, def: 0.8 },
  { k: 'primera', etq: 'Ancho en la primera capa', u: 'mm', min: 0.3, max: 2, paso: 0.01, def: 0.88 },
  { k: 'paredes', etq: 'Cantidad de paredes', u: '', min: 1, max: 6, paso: 1, def: 2, ayuda: 'Líneas alrededor de cada capa (la exterior y las de adentro). El perfil de ideaMaker usa 2.' },
  { k: 'relleno', etq: 'Relleno (densidad)', u: '%', min: 0, max: 100, paso: 1, def: 60, ayuda: 'Cuánto material lleva el relleno: 0 = sin relleno (solo paredes), 100 = macizo. El perfil de ideaMaker usa 60.' },
  { k: 'pasoRelleno', etq: 'Separación de las líneas del relleno', u: 'mm', min: 0.3, max: 5, paso: 0.05, def: 0.8, ayuda: 'Más separación = relleno más abierto y más rápido.' },
  { g: 'Velocidades' },
  { k: 'vPrimera', etq: 'Primera capa', u: 'mm/min', min: 60, max: 9000, paso: 10, def: 600 },
  { k: 'vExterior', etq: 'Pared exterior', u: 'mm/min', min: 60, max: 9000, paso: 10, def: 1500 },
  { k: 'vInterior', etq: 'Pared interior', u: 'mm/min', min: 60, max: 9000, paso: 10, def: 3000 },
  { k: 'vRelleno', etq: 'Relleno', u: 'mm/min', min: 60, max: 9000, paso: 10, def: 1800 },
  { k: 'vViaje', etq: 'Viaje (sin imprimir)', u: 'mm/min', min: 300, max: 9000, paso: 10, def: 6000 },
  { k: 'vZ', etq: 'Avance de cinta', u: 'mm/min', min: 60, max: 3000, paso: 10, def: 1200 },
  { g: 'Retracción' },
  { k: 'retraccion', etq: 'Retracción', u: 'mm', min: 0, max: 5, paso: 0.05, def: 0.8 },
  { k: 'vRetraer', etq: 'Velocidad al retraer', u: 'mm/min', min: 60, max: 6000, paso: 10, def: 1800 },
  { k: 'vVolver', etq: 'Velocidad al volver', u: 'mm/min', min: 60, max: 6000, paso: 10, def: 1500 },
  { k: 'limpieza', etq: 'Limpieza al cerrar la pared', u: 'mm', min: 0, max: 5, paso: 0.1, def: 1 },
  { g: 'Notas' },
  { k: 'notas', etq: 'Perfil de ideaMaker, observaciones…', t: 'texto', def: '' },
];
// perfil de una impresora de cinta → opciones de gcodeCinta (motor/cinta.js)
export function opcionesCinta(c) {
  return { nombre: c.nombre, angulo: c.angulo, ancho: c.ancho, alto: c.alto, centroX: c.centroX, separacion: c.separacion, temp: c.temp, flujo: c.flujo,
    filamento: c.filamento, densidad: c.densidad, paso: c.paso, linea: c.linea, primera: c.primera, paredes: c.paredes, flujoRelleno: c.relleno / 100, pasoRelleno: c.pasoRelleno,
    retraccion: c.retraccion, limpieza: c.limpieza,
    F: { primera: c.vPrimera, exterior: c.vExterior, interior: c.vInterior, relleno: c.vRelleno, viaje: c.vViaje, z: c.vZ, retraer: c.vRetraer, volver: c.vVolver } };
}
const porDefecto = campos => Object.fromEntries(campos.filter(c => c.k).map(c => [c.k, c.def]));
// las de fábrica: siempre están; si se editan, la versión editada (mismo id) va en maquinas.json
export const MESAS_FABRICA = [{ id: 'vx1r', nombre: 'Sensor Medica VX1R (EdingCNC)', fabrica: true, ...porDefecto(CAMPOS_MESA) }];
// Bambu Lab H2D con los mods oficiales para TPU (Ernesto, 2026-11-21). El TPU va por una sola boquilla: 325 × 320 × 325
// mm (con las dos boquillas el área común es 300 × 320; 350 de ancho solo sumando las dos con el mismo filamento).
export const IMPRESORAS_FABRICA = [{ id: 'impresora', nombre: 'Bambu Lab H2D (TPU)', fabrica: true, ...porDefecto(CAMPOS_IMPRESORA),
  x: 325, y: 320, z: 325, notas: 'TPU con los mods oficiales de Bambu; una sola boquilla (325 × 320 mm)' }];
export const MATERIALES_FABRICA = [
  { id: 'relax', nombre: 'Relax S20', fabrica: true, ...porDefecto(CAMPOS_MATERIAL), shore: 20, relieve: 6600 },
  { id: 'protection', nombre: 'Protection S40', fabrica: true, ...porDefecto(CAMPOS_MATERIAL), shore: 40, relieve: 6000 },
  { id: 'dynamic', nombre: 'Dynamic S50', fabrica: true, ...porDefecto(CAMPOS_MATERIAL), shore: 50, relieve: 5400 },
];
export const CINTAS_FABRICA = [{ id: 'podotec3d', nombre: 'PodoTec3D Model 1 (PLANTAR3D 08-OCT25)', fabrica: true, ...porDefecto(CAMPOS_CINTA),
  notas: 'Boquilla 0,8 mm. Filamento PLANTAR3D TPU F 95A 1,75 mm. Perfiles de ideaMaker: 1.printer, 2.filament, 3.bin.' }];
export const RESINAS_FABRICA = [
  { id: 'class_tpu', nombre: 'Class TPU', fabrica: true, ...porDefecto(CAMPOS_RESINA) },
  { id: 'glam_tpu', nombre: 'Glam TPU', fabrica: true, ...porDefecto(CAMPOS_RESINA) },
  { id: 'resina_3d', nombre: '3D', fabrica: true, ...porDefecto(CAMPOS_RESINA) },
];

// lista completa: las de fábrica (o su versión editada) y las propias
export function listaMaquinas(datos) {
  const une = (fab, propias = []) => [...fab.map(f => ({ ...f, ...(propias.find(p => p.id === f.id) ?? {}), fabrica: true })), ...propias.filter(p => !fab.some(f => f.id === p.id))];
  return { mesas: une(MESAS_FABRICA, datos?.mesas), impresoras: une(IMPRESORAS_FABRICA, datos?.impresoras), materiales: une(MATERIALES_FABRICA, datos?.materiales), resinas: une(RESINAS_FABRICA, datos?.resinas), cintas: une(CINTAS_FABRICA, datos?.cintas) };
}
// valores con los límites de cada campo (lo que llegue de un archivo editado a mano no rompe el G-code)
export function limpiarMaquina(m, campos) {
  const r = { id: String(m.id), nombre: String(m.nombre || 'Sin nombre').slice(0, 80) };
  for (const c of campos) if (c.k) {
    if (c.t === 'si') r[c.k] = m[c.k] == null ? c.def : !!m[c.k];
    else if (c.t === 'texto') r[c.k] = String(m[c.k] ?? c.def).slice(0, 400);
    else { const v = parseFloat(m[c.k]); r[c.k] = Number.isFinite(v) ? Math.min(Math.max(v, c.min), c.max) : c.def; }
  }
  return r;
}
// opciones de gcodeEVA (motor/fresado.js) a partir de una mesa y el material EVA: la mesa da la máquina y la fresa;
// el material, las velocidades de cortar y del relieve (sin material: 1800 y 6000, los de fábrica)
export function opcionesGcode(mesa, alto, material = null) {
  return { radio: mesa.diametro / 2, bloque: { largo: mesa.largo, ancho: mesa.ancho, alto }, husillo: mesa.husillo,
           velocidades: { trasladar: mesa.trasladar, bajar: mesa.bajar, cortar: material?.cortar ?? 1800, relieve: material?.relieve ?? 6000 }, entradaLenta: mesa.entradaLenta ?? 3.5, pasoY: mesa.pasoY, pasoX: mesa.pasoX,
           // auditoría 2026-11-19: si en el archivo la 2.ª vuelta quedó más alta que la 1.ª, se cortaba primero lo más hondo
           separacion: mesa.separacion, zSeguro: mesa.zSeguro, zContorno: mesa.contorno === false ? [] : [mesa.zContorno1, mesa.zContorno2].sort((a, b) => b - a),
           sobreespesor: mesa.sobreespesor, margenContorno: mesa.margenContorno };
}

// campos agrupados por título: [[título, [campos]], …] (cada grupo es una tarjeta; van en columnas a lo ancho)
const grupos = campos => { const r = []; for (const c of campos) { if (c.g) r.push([c.g, []]); else r.at(-1)?.[1].push(c); } return r; };

// los tres tipos de la pantalla: campos, de fábrica, resumen en la lista y nombre de uno nuevo
const TIPOS = {
  mesas: { titulo: 'Mesas de trabajo (EVA)', campos: CAMPOS_MESA, fabrica: MESAS_FABRICA, nueva: 'Nueva mesa de trabajo', nombre: 'Mesa nueva',
           resumen: x => `${x.largo} × ${x.ancho} mm · fresa ${String(x.diametro).replace('.', ',')} mm` },
  materiales: { titulo: 'Materiales EVA', campos: CAMPOS_MATERIAL, fabrica: MATERIALES_FABRICA, nueva: 'Nuevo material', nombre: 'Material nuevo',
                resumen: x => `Shore ${x.shore} · relieve F${x.relieve}` },
  resinas: { titulo: 'Materiales impresión 3D', campos: CAMPOS_RESINA, fabrica: RESINAS_FABRICA, nueva: 'Nuevo material', nombre: 'Material nuevo',
             resumen: x => `${String(x.densidad).replace('.', ',')} g/cm³` },
  impresoras: { titulo: 'Impresoras 3D', campos: CAMPOS_IMPRESORA, fabrica: IMPRESORAS_FABRICA, nueva: 'Nueva impresora', nombre: 'Impresora nueva',
                resumen: x => `${x.x} × ${x.y} × ${x.z} mm` },
  cintas: { titulo: 'Impresoras de cinta (beta)', campos: CAMPOS_CINTA, fabrica: CINTAS_FABRICA, nueva: 'Nueva impresora de cinta', nombre: 'Impresora de cinta nueva',
            resumen: x => `${x.angulo}° · ${x.temp} °C · ${x.paredes} paredes · relleno ${x.relleno} %` },
};

// ---- Pantalla Inicio → Máquinas ----
// ctx = { datos() → { mesas, materiales, impresoras } (lo guardado), guardar(datos) }
export function pintarMaquinas(cuerpo, ctx) {
  let tipo = 'mesas', elegida = null;
  const campos = () => TIPOS[tipo].campos;
  const pintar = () => {
    const lista = listaMaquinas(ctx.datos())[tipo];
    if (!lista.some(m => m.id === elegida)) elegida = lista[0]?.id ?? null;
    const m = lista.find(x => x.id === elegida);
    cuerpo.innerHTML = `<div class="inicio-titulo maq-cab"><h2>Máquinas</h2>
        <div class="maq-tipos" role="tablist">
          ${Object.entries(TIPOS).map(([id, t]) => `<button data-maq-tipo="${id}" class="${tipo === id ? 'activo' : ''}">${t.titulo}</button>`).join('')}
        </div>
        <p class="maq-intro">Se guardan en la carpeta compartida (las ven las tres PC). En cada diseño se elige cuál usar: la mesa y el material en 3. EVA, la impresora y su material en 3. Imprimir (o el material en Inicio, en los diseños del paciente).</p>
      </div>
      <div class="maq-grilla">
        <div class="maq-lista">
          ${lista.map(x => `<button class="maq-item${x.id === elegida ? ' activo' : ''}" data-maq="${esc(x.id)}"><b>${esc(x.nombre)}</b><span>${TIPOS[tipo].resumen(x)}${x.fabrica ? ' · de fábrica' : ''}</span></button>`).join('')}
          <button class="maq-nueva" id="maqNueva">+ ${TIPOS[tipo].nueva}</button>
        </div>
        ${m ? `<form class="maq-form" id="maqForm" autocomplete="off">
          <label class="maq-nombre">Nombre <input type="text" name="nombre" value="${esc(m.nombre)}" maxlength="80"></label>
          <div class="maq-grupos">${grupos(campos()).map(([titulo, cs]) => `<fieldset class="maq-grupo"><legend>${esc(titulo)}</legend>${cs.map(c => c.t === 'si'
            ? `<label class="maq-si"><input type="checkbox" name="${c.k}"${m[c.k] !== false ? ' checked' : ''}> ${esc(c.etq)}</label>`
            : c.t === 'texto' ? `<label class="maq-campo maq-texto"><span>${esc(c.etq)}</span><textarea name="${c.k}" rows="2" maxlength="400">${esc(m[c.k])}</textarea></label>`
            : `<label class="maq-campo"${c.ayuda ? ` title="${esc(c.ayuda)}"` : ''}><span>${esc(c.etq)}${c.ayuda ? ' <i class="maq-ayuda">?</i>' : ''}</span><span class="maq-valor"><input type="number" name="${c.k}" min="${c.min}" max="${c.max}" step="${c.paso}" value="${m[c.k]}"><em>${c.u}</em></span></label>`).join('')}</fieldset>`).join('')}</div>
          <div class="maq-botones">
            <button type="submit" class="primario">Guardar</button>
            <button type="button" id="maqDuplicar">Duplicar</button>
            ${m.fabrica ? '<button type="button" id="maqFabrica" title="Volver a los valores con que viene el programa">Valores de fábrica</button>' : '<button type="button" id="maqBorrar" class="peligro">Eliminar</button>'}
          </div>
          <p class="maq-msg" id="maqMsg"></p>
        </form>` : ''}
      </div>`;
    cuerpo.querySelectorAll('[data-maq-tipo]').forEach(b => b.onclick = () => { tipo = b.dataset.maqTipo; elegida = null; pintar(); });
    cuerpo.querySelectorAll('[data-maq]').forEach(b => b.onclick = () => { elegida = b.dataset.maq; pintar(); });
    const datos = () => { const d = ctx.datos() ?? {}; return { mesas: [...(d.mesas ?? [])], materiales: [...(d.materiales ?? [])], resinas: [...(d.resinas ?? [])], impresoras: [...(d.impresoras ?? [])], cintas: [...(d.cintas ?? [])] }; };
    const poner = async (nueva, aviso) => {
      const d = datos(); d[tipo] = [...d[tipo].filter(x => x.id !== nueva.id), limpiarMaquina(nueva, campos())];
      await ctx.guardar(d); elegida = nueva.id; pintar(); const msg = cuerpo.querySelector('#maqMsg'); if (msg) msg.textContent = aviso;
    };
    cuerpo.querySelector('#maqNueva').onclick = () => poner({ ...porDefecto(campos()), id: tipo.slice(0, 4) + '_' + Date.now().toString(36), nombre: TIPOS[tipo].nombre }, 'Creada con los valores de fábrica: cámbiele el nombre y lo que haga falta, y Guardar.');
    if (!m) return;
    const form = cuerpo.querySelector('#maqForm');
    const leerForm = () => {
      const v = { id: m.id, nombre: form.nombre.value.trim() || m.nombre };
      for (const c of campos()) if (c.k) v[c.k] = c.t === 'si' ? form[c.k].checked : c.t === 'texto' ? form[c.k].value : form[c.k].value;
      return v;
    };
    form.onsubmit = async ev => {
      ev.preventDefault();
      const v = leerForm();
      for (const c of campos()) if (c.k && !c.t) { const x = parseFloat(v[c.k]); if (!Number.isFinite(x) || x < c.min || x > c.max) { cuerpo.querySelector('#maqMsg').textContent = `"${c.etq}" debe estar entre ${c.min} y ${c.max} ${c.u}.`; form[c.k].focus(); return; } }
      if (tipo === 'mesas' && v.contorno && parseFloat(v.zContorno2) >= parseFloat(v.zContorno1)) { cuerpo.querySelector('#maqMsg').textContent = 'La 2.ª vuelta del contorno debe ir más abajo que la 1.ª.'; return; }
      await poner(v, 'Guardado.');
    };
    cuerpo.querySelector('#maqDuplicar').onclick = () => poner({ ...leerForm(), id: tipo.slice(0, 4) + '_' + Date.now().toString(36), nombre: (form.nombre.value.trim() || m.nombre) + ' (copia)' }, 'Copia creada.');
    const fab = cuerpo.querySelector('#maqFabrica');
    if (fab) fab.onclick = async () => { const d = datos(); d[tipo] = d[tipo].filter(x => x.id !== m.id); await ctx.guardar(d); pintar(); };
    const borrar = cuerpo.querySelector('#maqBorrar');
    if (borrar) borrar.onclick = async () => {
      if (!confirm(`¿Eliminar "${m.nombre}"? Los diseños que la usaban pasan a la de fábrica.`)) return;
      const d = datos(); d[tipo] = d[tipo].filter(x => x.id !== m.id); await ctx.guardar(d); elegida = null; pintar();
    };
  };
  pintar();
}
