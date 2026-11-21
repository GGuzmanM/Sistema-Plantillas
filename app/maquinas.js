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
  { k: 'cortar', etq: 'Cortar (entrada y contorno)', u: 'mm/min', min: 100, max: 20000, paso: 100, def: 1800, ayuda: 'Al entrar en el EVA (primeras filas de cada plantilla) y al cortar el borde.' },
  { k: 'relieve', etq: 'Fresar el relieve', u: 'mm/min', min: 100, max: 30000, paso: 100, def: 6000, ayuda: 'El resto de la superficie (cada fila solo roza 0,5 mm). 6000 ≈ 14 min el par; LutraCAD usa 14400. Si no se elige material.' },
  { k: 'entradaLenta', etq: 'Ancho que entra despacio', u: 'mm', min: 0, max: 50, paso: 0.5, def: 3.5, ayuda: 'Primeros mm de cada plantilla a la velocidad de cortar, mientras la fresa entra en el bloque.' },
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

// lista completa: las de fábrica (o su versión editada) y las propias
export function listaMaquinas(datos) {
  const une = (fab, propias = []) => [...fab.map(f => ({ ...f, ...(propias.find(p => p.id === f.id) ?? {}), fabrica: true })), ...propias.filter(p => !fab.some(f => f.id === p.id))];
  return { mesas: une(MESAS_FABRICA, datos?.mesas), impresoras: une(IMPRESORAS_FABRICA, datos?.impresoras), materiales: une(MATERIALES_FABRICA, datos?.materiales) };
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
// opciones de gcodeEVA (motor/fresado.js) a partir de una mesa y, si se eligió, el material EVA (sus velocidades de
// cortar y del relieve reemplazan a las de la mesa)
export function opcionesGcode(mesa, alto, material = null) {
  return { radio: mesa.diametro / 2, bloque: { largo: mesa.largo, ancho: mesa.ancho, alto }, husillo: mesa.husillo,
           velocidades: { trasladar: mesa.trasladar, bajar: mesa.bajar, cortar: material?.cortar ?? mesa.cortar, relieve: material?.relieve ?? mesa.relieve ?? 6000 }, entradaLenta: mesa.entradaLenta ?? 3.5, pasoY: mesa.pasoY, pasoX: mesa.pasoX,
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
  impresoras: { titulo: 'Impresoras 3D', campos: CAMPOS_IMPRESORA, fabrica: IMPRESORAS_FABRICA, nueva: 'Nueva impresora', nombre: 'Impresora nueva',
                resumen: x => `${x.x} × ${x.y} × ${x.z} mm` },
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
        <p class="maq-intro">Se guardan en la carpeta compartida (las ven las tres PC). En cada diseño se elige cuál usar: la mesa y el material en 3. EVA, la impresora en 3. Imprimir.</p>
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
    const datos = () => { const d = ctx.datos() ?? {}; return { mesas: [...(d.mesas ?? [])], materiales: [...(d.materiales ?? [])], impresoras: [...(d.impresoras ?? [])] }; };
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
