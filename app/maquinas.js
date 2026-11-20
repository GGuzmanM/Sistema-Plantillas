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
  { k: 'cortar', etq: 'Cortar (fresar)', u: 'mm/min', min: 100, max: 20000, paso: 100, def: 1800 },
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
  { k: 'x', etq: 'Largo (X)', u: 'mm', min: 50, max: 1000, paso: 1, def: 350 },
  { k: 'y', etq: 'Ancho (Y)', u: 'mm', min: 50, max: 1000, paso: 1, def: 320 },
  { k: 'z', etq: 'Alto (Z)', u: 'mm', min: 20, max: 1000, paso: 1, def: 325 },
  { g: 'Notas' },
  { k: 'notas', etq: 'Material, perfil del laminador…', t: 'texto', def: '' },
];
const porDefecto = campos => Object.fromEntries(campos.filter(c => c.k).map(c => [c.k, c.def]));
// las de fábrica: siempre están; si se editan, la versión editada (mismo id) va en maquinas.json
export const MESAS_FABRICA = [{ id: 'vx1r', nombre: 'Sensor Medica VX1R (EdingCNC)', fabrica: true, ...porDefecto(CAMPOS_MESA) }];
export const IMPRESORAS_FABRICA = [{ id: 'impresora', nombre: 'Impresora 3D (revise el área)', fabrica: true, ...porDefecto(CAMPOS_IMPRESORA) }];

// lista completa: las de fábrica (o su versión editada) y las propias
export function listaMaquinas(datos) {
  const une = (fab, propias = []) => [...fab.map(f => ({ ...f, ...(propias.find(p => p.id === f.id) ?? {}), fabrica: true })), ...propias.filter(p => !fab.some(f => f.id === p.id))];
  return { mesas: une(MESAS_FABRICA, datos?.mesas), impresoras: une(IMPRESORAS_FABRICA, datos?.impresoras) };
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
// opciones de gcodeEVA (motor/fresado.js) a partir de una mesa
export function opcionesGcode(mesa, alto) {
  return { radio: mesa.diametro / 2, bloque: { largo: mesa.largo, ancho: mesa.ancho, alto }, husillo: mesa.husillo,
           velocidades: { trasladar: mesa.trasladar, bajar: mesa.bajar, cortar: mesa.cortar }, pasoY: mesa.pasoY, pasoX: mesa.pasoX,
           separacion: mesa.separacion, zSeguro: mesa.zSeguro, zContorno: mesa.contorno === false ? [] : [mesa.zContorno1, mesa.zContorno2],
           sobreespesor: mesa.sobreespesor, margenContorno: mesa.margenContorno };
}

// campos agrupados por título: [[título, [campos]], …] (cada grupo es una tarjeta; van en columnas a lo ancho)
const grupos = campos => { const r = []; for (const c of campos) { if (c.g) r.push([c.g, []]); else r.at(-1)?.[1].push(c); } return r; };

// ---- Pantalla Inicio → Máquinas ----
// ctx = { datos() → { mesas, impresoras } (lo guardado), guardar(datos) }
export function pintarMaquinas(cuerpo, ctx) {
  let tipo = 'mesas', elegida = null;
  const campos = () => (tipo === 'mesas' ? CAMPOS_MESA : CAMPOS_IMPRESORA);
  const fabrica = () => (tipo === 'mesas' ? MESAS_FABRICA : IMPRESORAS_FABRICA);
  const pintar = () => {
    const lista = listaMaquinas(ctx.datos())[tipo];
    if (!lista.some(m => m.id === elegida)) elegida = lista[0]?.id ?? null;
    const m = lista.find(x => x.id === elegida);
    cuerpo.innerHTML = `<div class="inicio-titulo maq-cab"><h2>Máquinas</h2>
        <div class="maq-tipos" role="tablist">
          <button data-maq-tipo="mesas" class="${tipo === 'mesas' ? 'activo' : ''}">Mesas de trabajo (EVA)</button>
          <button data-maq-tipo="impresoras" class="${tipo === 'impresoras' ? 'activo' : ''}">Impresoras 3D</button>
        </div>
        <p class="maq-intro">Se guardan en la carpeta compartida (las ven las tres PC). En cada diseño se elige cuál usar: la mesa en 3. EVA, la impresora en 3. Imprimir.</p>
      </div>
      <div class="maq-grilla">
        <div class="maq-lista">
          ${lista.map(x => `<button class="maq-item${x.id === elegida ? ' activo' : ''}" data-maq="${esc(x.id)}"><b>${esc(x.nombre)}</b><span>${tipo === 'mesas' ? `${x.largo} × ${x.ancho} mm · fresa ${String(x.diametro).replace('.', ',')} mm` : `${x.x} × ${x.y} × ${x.z} mm`}${x.fabrica ? ' · de fábrica' : ''}</span></button>`).join('')}
          <button class="maq-nueva" id="maqNueva">+ ${tipo === 'mesas' ? 'Nueva mesa de trabajo' : 'Nueva impresora'}</button>
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
    const datos = () => { const d = ctx.datos() ?? {}; return { mesas: [...(d.mesas ?? [])], impresoras: [...(d.impresoras ?? [])] }; };
    const poner = async (nueva, aviso) => {
      const d = datos(); d[tipo] = [...d[tipo].filter(x => x.id !== nueva.id), limpiarMaquina(nueva, campos())];
      await ctx.guardar(d); elegida = nueva.id; pintar(); const msg = cuerpo.querySelector('#maqMsg'); if (msg) msg.textContent = aviso;
    };
    cuerpo.querySelector('#maqNueva').onclick = () => poner({ ...porDefecto(campos()), id: tipo.slice(0, 4) + '_' + Date.now().toString(36), nombre: tipo === 'mesas' ? 'Mesa nueva' : 'Impresora nueva' }, 'Creada con los valores de fábrica: cámbiele el nombre y lo que haga falta, y Guardar.');
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
