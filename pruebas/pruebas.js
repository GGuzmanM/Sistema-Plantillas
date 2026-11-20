// Pruebas del motor. Cada prueba deja una fila en la página y en window.resultados.
import { prepararHorma, prepararAcabado, generar, medidas, lisura, solido, revisarSolido, volumen, aSTL } from '../motor/plantilla.js';

const leer = ruta => fetch(ruta).then(r => r.json());
const bib = await leer('../biblioteca/biblioteca.json');
const meta = bib.hormas[0];
const datos = await leer('../biblioteca/' + meta.archivo);
const horma = prepararHorma(datos, meta.ref);
const acabado = prepararAcabado(await leer('../biblioteca/' + bib.acabados[0].archivo));

const filas = [], resultados = {};
const prueba = (nombre, pasa, detalle) => { filas.push({ nombre, pasa, detalle }); resultados[nombre] = { pasa, detalle }; };
const n1 = v => v.toFixed(1), n2 = v => v.toFixed(2);
const muestrasProbadas = [];   // las muestras 2D que se leyeron (para la prueba de la forma de la muestra)

// 1. El contorno suave sigue al de la horma (fuera de las puntas, donde se redondea a propósito).
{
  let a = Infinity, b = -Infinity;
  for (const f of datos.estaciones) { a = Math.min(a, f.xi); b = Math.max(b, f.xd); }
  const cx = (a + b) / 2, yT = datos.puntaTalon[1];
  let dif = 0;
  for (const f of datos.estaciones) {
    const y = f.y - yT, t = y / horma.largo;
    if (t < 0.06 || t > 0.94) continue;
    const [xi, xd] = horma.borde(y);
    dif = Math.max(dif, Math.abs(xi - (f.xi - cx)), Math.abs(xd - (f.xd - cx)));
  }
  prueba('El contorno suave sigue a la horma', dif < 1, `diferencia máxima ${n2(dif)} mm; largo ${n1(horma.largo)}, ancho ${n1(horma.ancho)} mm`);
}

// 2. Resina para una talla real, con la base curva: medidas pedidas, canto mínimo, lisura y sólido cerrado.
const pedido = { largo: 240, antepie: 1.5, copa: 10, acabado, canto: 1.2 };
const pies = {};
for (const lado of ['izq', 'der']) {
  const g = generar(horma, { ...pedido, lado }), m = medidas(g), tri = solido(g), rev = revisarSolido(tri);
  pies[lado] = { g, m, tri };
  prueba(`Resina 240 mm, pie ${lado}: medidas`,
    Math.abs(m.largo - 240) < 0.05 && Math.abs(m.copa - 10) < 0.15 && Math.abs(m.antepie - 1.5) < 0.02,
    `largo ${n1(m.largo)}, ancho antepié ${n1(m.anchoAntepie)}, ancho talón ${n1(m.anchoTalon)}, ` +
    `copa ${n2(m.copa)} (de ${n2(m.copaMin)} a ${n2(m.copaMax)}), ` +
    `antepié ${n2(m.antepie)}, arco ${n1(m.arco)} mm a ${Math.round(m.arcoDesdeTalon * 100)} % desde el talón`);
  prueba(`Resina 240 mm, pie ${lado}: base curva`, m.espesor >= 1.19 && m.apoyo > 0.5,
    `canto mínimo ${n2(m.canto)} mm, espesor mínimo ${n2(m.espesor)} mm, apoya plano el ${Math.round(m.apoyo * 100)} % de la base`);
  prueba(`Resina 240 mm, pie ${lado}: sólido cerrado`, rev.cerrado,
    `${rev.triangulos} triángulos, ${rev.aristasMalas} aristas abiertas, volumen ${n1(volumen(tri))} cm³`);
}
{
  const l = lisura(pies.izq.g);
  // abajo se permite más: donde la base curva se une con la base plana hay un quiebre suave, como en la referencia
  prueba('Acabado liso', l.quiebreContorno < 4 && l.pliegueArriba < 12 && l.pliegueAbajo < 30,
    `mayor quiebre del contorno ${n1(l.quiebreContorno)}°, mayor pliegue arriba ${n1(l.pliegueArriba)}°, abajo ${n1(l.pliegueAbajo)}°`);
  const plano = solido(generar(horma, { largo: 240, antepie: 1.5, copa: 10, lado: 'izq' }));
  prueba('La base curva ahorra material', volumen(pies.izq.tri) < volumen(plano),
    `${n1(volumen(pies.izq.tri))} cm³ con base curva contra ${n1(volumen(plano))} cm³ con base plana`);
}

// 3. El derecho es el espejo exacto del izquierdo.
{
  const a = pies.izq.g, b = pies.der.g; let d = 0;
  for (let q = 0; q < a.x.length; q++) d = Math.max(d, Math.abs(a.x[q] + b.x[q]), Math.abs(a.z[q] - b.z[q]), Math.abs(a.zb[q] - b.zb[q]));
  prueba('El pie derecho es espejo del izquierdo', d < 1e-4, `diferencia máxima ${d.toExponential(1)} mm`);
}

// 4. Tallas extremas de la tabla y un arco pedido a mano.
{
  const tallas = (await leer('../biblioteca/' + bib.tallas)).tallas;
  const chico = tallas[0], grande = tallas[tallas.length - 1];
  let bien = true, texto = [];
  for (const t of [chico, grande]) {
    const g = generar(horma, { largo: t.largo, antepie: 1.5, copa: 10, acabado, lado: 'izq' }), m = medidas(g);
    const rev = revisarSolido(solido(g));
    bien = bien && rev.cerrado && Math.abs(m.copa - 10) < 0.15 && Math.abs(m.largo - t.largo) < 0.05 && m.espesor >= 1.19;
    texto.push(`talla ${t.talla}: ${n1(m.largo)} × ${n1(m.anchoAntepie)} mm, copa ${n2(m.copa)}, arco ${n1(m.arco)}, canto ${n2(m.canto)}`);
  }
  prueba('Tallas 27 y 48', bien, texto.join(' · '));
  const m = medidas(generar(horma, { largo: 240, antepie: 1.5, copa: 10, arco: 18, lado: 'izq' }));
  prueba('Arco pedido de 18 mm', Math.abs(m.arco - 18) < 0.05 && Math.abs(m.copa - 10) < 0.15,
    `arco ${n2(m.arco)} mm, copa ${n2(m.copa)} mm`);
}

// 5. Elementos: cada uno llega a su altura, queda liso, no adelgaza el canto y deja el sólido cerrado.
{
  const { prepararElemento } = await import('../motor/plantilla.js');
  // las descargas hunden en vez de subir: tienen su propia prueba (18)
  const catalogo = (await leer('../biblioteca/elementos.json')).elementos.filter(e => !e.descarga);
  const texto = []; let bien = true;
  for (const e of catalogo) {
    const g = generar(horma, { ...pedido, lado: 'izq', elementos: [{ forma: prepararElemento(e), altura: e.altura }] });
    let mx = 0; for (const v of g.he) mx = Math.max(mx, v);
    const l = lisura(g), m = medidas(g), rev = revisarSolido(solido(g));
    const ok = Math.abs(mx - e.altura) < 0.05 && l.pliegueArriba < 12 && m.espesor >= 1.19 && rev.cerrado;
    bien = bien && ok;
    texto.push(`${e.nombre} ${n1(mx)} mm${ok ? '' : ` (pliegue ${n1(l.pliegueArriba)}°, cerrado ${rev.cerrado})`}`);
  }
  prueba(`Los ${catalogo.length} elementos`, bien, texto.join(' · '));
}

// 7. Ubicación del arco: el punto más alto va donde se pide; la copa y el antepié no cambian.
{
  const texto = []; let bien = true;
  for (const pos of [0.32, 0.48]) {
    const g = generar(horma, { ...pedido, lado: 'izq', arcoPos: pos }), m = medidas(g), l = lisura(g), rev = revisarSolido(solido(g));
    const ok = Math.abs(m.arcoDesdeTalon - pos) < 0.015 && Math.abs(m.copa - 10) < 0.15 && Math.abs(m.antepie - 1.5) < 0.02 && rev.cerrado && l.pliegueArriba < 12;
    bien = bien && ok;
    texto.push(`pedido ${Math.round(pos * 100)} % → ${Math.round(m.arcoDesdeTalon * 100)} %, copa ${n2(m.copa)}, pliegue ${n1(l.pliegueArriba)}°`);
  }
  prueba('Ubicación del arco', bien, texto.join(' · '));
}

// 8. Mover, girar y agrandar un elemento: cambia de lugar o de forma, pero no de altura.
{
  const { prepararElemento } = await import('../motor/plantilla.js');
  const oliva = (await leer('../biblioteca/elementos.json')).elementos.find(e => e.id === 'oliva');
  const forma = prepararElemento(oliva);
  const planta = extra => {
    const g = generar(horma, { ...pedido, lado: 'izq', elementos: [{ forma, altura: 4, ...extra }] });
    let sw = 0, cx = 0, cy = 0, sxx = 0, syy = 0, sxy = 0, mx = 0;
    for (let q = 0; q < g.he.length; q++) { const h = g.he[q]; mx = Math.max(mx, h); if (h > 0.5) { sw += h; cx += h * g.x[q]; cy += h * g.y[q]; } }
    cx /= sw; cy /= sw;
    for (let q = 0; q < g.he.length; q++) { const h = g.he[q]; if (h > 0.5) { sxx += h * (g.x[q] - cx) ** 2; syy += h * (g.y[q] - cy) ** 2; sxy += h * (g.x[q] - cx) * (g.y[q] - cy); } }
    return { cx, cy, eje: (0.5 * Math.atan2(2 * sxy, syy - sxx) * 180) / Math.PI, prop: Math.sqrt(syy / sxx), mx, cerrado: revisarSolido(solido(g)).cerrado };
  };
  const base = planta({}), movido = planta({ mover: [20, 5] }), girado = planta({ giro: 30 }), grande = planta({ escala: [1.3, 0.8] });
  const ok = Math.abs(movido.cy - base.cy - 20) < 1.5 && Math.abs(movido.cx - base.cx - 5) < 1.5 &&
    Math.abs(girado.eje - base.eje - 30) < 4 && Math.abs(girado.cy - base.cy) < 1.5 &&
    Math.abs(grande.prop / base.prop - 1.3 / 0.8) < 0.15 &&
    [movido, girado, grande].every(p => Math.abs(p.mx - 4) < 0.05 && p.cerrado);
  prueba('Mover, girar y agrandar elementos', ok,
    `movido ${n1(movido.cy - base.cy)} mm a los dedos y ${n1(movido.cx - base.cx)} a interno · girado ${n1(girado.eje - base.eje)}° · ` +
    `largo/ancho ×${n2(grande.prop / base.prop)} (pedido ×${n2(1.3 / 0.8)}) · altura ${n2(grande.mx)} mm`);
}

// 9. Escaneo del Podoscan (ejemplo en escaneos/): lado, largo y arco.
{
  const E = await import('../motor/escaneo.js'), texto = []; let bien = true, hay = false;
  for (const [archivo, lado] of [['Podoscan3D_IZ.stl', 'izq'], ['Podoscan3D_DC.stl', 'der']]) {
    const r = await fetch('../escaneos/' + archivo); if (!r.ok) continue; hay = true;
    const t = E.orientar(E.leerSTL(await r.arrayBuffer())), m = E.medirEscaneo(t);
    const ok = E.ladoPorNombre(archivo) === lado && m.internoHaciaMasX === (lado === 'izq') && m.largo > 240 && m.largo < 300 && m.arcoPos > 0.3 && m.arcoPos < 0.55;
    bien = bien && ok;
    texto.push(`${archivo}: ${n1(m.largo)} × ${n1(m.anchoAntepie)} mm, arco a ${Math.round(m.arcoPos * 100)} %`);
  }
  prueba('Escaneo del pie', bien, hay ? texto.join(' · ') : 'sin escaneo de ejemplo en escaneos/ (no se probó)');
}

// 10. Muestra 2D (ejemplos en escaneos/): contorno, medidas y pie.
{
  const M = await import('../motor/muestra.js'), texto = []; let bien = true, hay = false;
  for (const [archivo, lado, largo] of [['KAROL_MEDINA_horma_240dpi.png', 'izq', 241.7], ['NICOLE_ANTUNEZ_DEPORTE_muestra_200dpi.png', 'der', 259.6]]) {
    const r = await fetch('../escaneos/' + archivo); if (!r.ok) continue; hay = true;
    const buf = await r.arrayBuffer(), ppmm = M.escalaPNG(buf, archivo), bmp = await createImageBitmap(new Blob([buf]));
    const cv = new OffscreenCanvas(bmp.width, bmp.height), c = cv.getContext('2d'); c.drawImage(bmp, 0, 0);
    const a = M.analizarMuestra(c.getImageData(0, 0, bmp.width, bmp.height), ppmm);
    const ok = a.lado === lado && Math.abs(a.largo - largo) < 3 && a.ancho > 70 && a.ancho < 110;
    bien = bien && ok;
    texto.push(`${archivo.split('_')[0]}: ${n1(a.largo)} × ${n1(a.ancho)} mm, pie ${a.lado}`);
    muestrasProbadas.push({ archivo, a });
  }
  prueba('Muestra 2D', bien, hay ? texto.join(' · ') : 'sin muestras de ejemplo en escaneos/ (no se probó)');
}

// 11. Plantilla con la forma de la muestra: el borde sigue el contorno (a menos de 1 mm), mide lo mismo, la copa
// queda en su altura y el sólido es cerrado.
{
  const { hormaConContorno, generar: gen, solido: sol, revisarSolido: rev, medidas: med } = await import('../motor/plantilla.js');
  const M = await import('../motor/muestra.js'), texto = []; let bien = true;
  for (const { archivo, a } of muestrasProbadas) {
    const puntos = M.contornoParaReceta(a.contorno), h2 = hormaConContorno(horma, puntos);
    const g = gen(h2, { largo: h2.largo, ancho: h2.ancho, antepie: 1.5, copa: 10, lado: 'izq', acabado });
    const r = rev(sol(g)), m = med(g);
    // distancia de cada punto del contorno de la muestra al borde de la plantilla (mismo centrado que el motor)
    let x0 = Infinity, x1 = -Infinity; for (const [x] of puntos) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
    const borde = []; for (let i = 0; i < g.ns; i++) borde.push([g.x[i * g.nr], g.y[i * g.nr]]);
    let peor = 0;
    for (const [x, y] of puntos) {
      const px = x - (x0 + x1) / 2; let d = Infinity;
      for (const [bx, by] of borde) d = Math.min(d, Math.hypot(bx - px, by - y));
      peor = Math.max(peor, d);
    }
    // borde prolijo: no cambia el largo ni el ancho en más de 1 mm
    const pr = M.contornoProlijo(a.contorno, 'prolijo'); let py0 = Infinity, py1 = -Infinity, px0 = Infinity, px1 = -Infinity;
    for (const [x, y] of pr) { px0 = Math.min(px0, x); px1 = Math.max(px1, x); py0 = Math.min(py0, y); py1 = Math.max(py1, y); }
    const okP = Math.abs(py1 - py0 - a.largo) < 1 && Math.abs(px1 - px0 - (x1 - x0)) < 1;
    const ok = r.cerrado && r.aristasMalas === 0 && Math.abs(m.largo - a.largo) < 1 && peor < 1.5 && Math.abs(m.copa - 10) < 0.3 && okP;
    bien = bien && ok;
    texto.push(`${archivo.split('_')[0]}: borde a ${n1(peor)} mm como mucho, largo ${n1(m.largo)} mm, copa ${n1(m.copa)} mm; prolijo ${n1(py1 - py0)} × ${n1(px1 - px0)} mm`);
  }
  prueba('Forma de la muestra', bien && muestrasProbadas.length > 0, muestrasProbadas.length ? texto.join(' · ') : 'sin muestras de ejemplo (no se probó)');
}

// 12. Muestra en PDF (tal como sale del escáner Epson): se lee la imagen y su resolución sin convertirla, y da las
// mismas medidas que el PNG convertido con muestra_a_png.ps1.
{
  const { imagenDePDF } = await import('../motor/pdf.js'), M = await import('../motor/muestra.js');
  const base = '../escaneos/muestras/Lourdes Monteagudo Proenza - Muestra urbana ';
  const rp = await fetch(encodeURI(base + '.pdf')), rn = await fetch(encodeURI(base + '_200dpi.png'));
  if (rp.ok && rn.ok) {
    const leer = async (bmp, ppmm) => { const c = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d'); c.drawImage(bmp, 0, 0); return M.analizarMuestra(c.getImageData(0, 0, bmp.width, bmp.height), ppmm); };
    const r = await imagenDePDF(await rp.arrayBuffer()), a = await leer(r.bmp, r.ppmm);
    const bufP = await rn.arrayBuffer(), b = await leer(await createImageBitmap(new Blob([bufP])), M.escalaPNG(bufP, '_200dpi'));
    const ok = Math.abs(a.largo - b.largo) < 1 && Math.abs(a.ancho - b.ancho) < 1 && a.lado === b.lado && Math.round(r.ppmm * 25.4) === 200;
    prueba('Muestra en PDF', ok, `PDF ${Math.round(r.ppmm * 25.4)} dpi: ${n1(a.largo)} × ${n1(a.ancho)} mm · PNG: ${n1(b.largo)} × ${n1(b.ancho)} mm`);
  } else prueba('Muestra en PDF', true, 'sin la muestra de ejemplo en escaneos/muestras (no se probó)');
}

// 13. Contacto total en el arco: con un "pie" que en el arco queda 4 mm más alto que la plantilla, la cara de arriba
// sube hasta tocarlo (al 100 %) o la mitad (al 50 %), sin tocar copa ni antepié, y el sólido sigue cerrado.
{
  const p0 = { largo: 250, antepie: 1.5, copa: 10, acabado, lado: 'izq' }, g0 = generar(horma, p0);
  // planta del pie de prueba: la plantilla + 4 mm en el arco (35 % a 50 % del largo), solo donde hay plantilla
  const ref = new Map(); for (let q = 0; q < g0.z.length; q++) ref.set(Math.round(g0.x[q]) + ',' + Math.round(g0.y[q]), g0.z[q]);
  const altura = (x, y) => { const z = ref.get(Math.round(x) + ',' + Math.round(y)); if (z == null) return null; const u = y / 250; return z + (u > 0.3 && u < 0.55 ? 4 : 0); };
  const res = [];
  for (const pct of [1, 0.5]) {
    const g = generar(horma, { ...p0, contacto: { altura, pct } });
    let sube = 0, n = 0, copaIgual = true;
    for (let q = 0; q < g.z.length; q++) {
      const u = g.y[q] / 250, d = g.z[q] - g0.z[q];
      if (u > 0.4 && u < 0.45) { sube += d; n++; }
      if (u < 0.12 || u > 0.75) copaIgual = copaIgual && Math.abs(d) < 0.01;
    }
    const r = revisarSolido(solido(g));
    res.push({ pct, sube: sube / n, ok: Math.abs(sube / n - 4 * pct) < 0.8 && copaIgual && r.cerrado && r.aristasMalas === 0 });
  }
  prueba('Contacto total en el arco', res.every(r => r.ok), res.map(r => `${r.pct * 100} %: sube ${n1(r.sube)} mm en el arco`).join(' · ') + '; copa y antepié sin cambios, sólido cerrado');
}

// 14. Altura del borde (Editar línea de corte en la vista de costado): +5 mm en el borde interno al 38 % del largo
// (campana de 60 mm). El borde interno sube 5 mm ahí, el externo no cambia y el sólido sigue cerrado. En el pie
// derecho igual (el interno es el espejo).
{
  const N = 201, interno = Array.from({ length: N }, (_, j) => { const t = Math.abs(j / (N - 1) - 0.38) / (30 / 250); return t < 1 ? 5 * 0.5 * (1 + Math.cos(Math.PI * t)) : 0; });
  const res = [];
  for (const lado of ['izq', 'der']) {
    const p0 = { largo: 250, antepie: 1.5, copa: 10, acabado, lado }, g0 = generar(horma, p0), g = generar(horma, { ...p0, alturaBorde: { interno } });
    // en el borde (anillo 0) cerca del 38 %: el punto más interno y el más externo
    let qi = null, qe = null; const s = lado === 'izq' ? 1 : -1;
    for (let i = 0; i < g.ns; i++) { const q = i * g.nr; if (Math.abs(g.y[q] / 250 - 0.38) < 0.01) { if (qi === null || s * g.x[q] > s * g.x[qi]) qi = q; if (qe === null || s * g.x[q] < s * g.x[qe]) qe = q; } }
    const r = revisarSolido(solido(g)), sube = g.z[qi] - g0.z[qi], ext = g.z[qe] - g0.z[qe];
    res.push({ lado, sube, ext, ok: Math.abs(sube - 5) < 0.3 && Math.abs(ext) < 0.01 && r.cerrado && r.aristasMalas === 0 });
  }
  prueba('Altura del borde editada', res.every(r => r.ok), res.map(r => `${r.lado}: interno +${n1(r.sube)} mm, externo ${n1(r.ext)} mm`).join(' · ') + '; sólido cerrado');
}

// 15. Caja de un elemento (forma editada con los puntos del cuadro): con todos los puntos corridos 10 mm hacia los
// dedos, la oliva queda igual pero 10 mm más adelante; con la caja sin mover, igual que sin caja.
{
  const { prepararElemento } = await import('../motor/plantilla.js');
  const oliva = (await leer('../biblioteca/elementos.json')).elementos.find(e => e.id === 'oliva');
  const p0 = { largo: 250, antepie: 1.5, copa: 10, acabado, lado: 'izq' };
  const caja = d => ({ u0: 0.4, u1: 0.8, v0: 0.2, v1: 0.85, nf: 5, nc: 5, d: Array.from({ length: 25 }, () => d) });
  const cima = def => {
    const g = generar(horma, { ...p0, elementos: [{ forma: prepararElemento(def), altura: 4 }] }), ap = g.aportes[0];
    let sw = 0, sy = 0, mx = 0; for (let q = 0; q < ap.length; q++) { sw += ap[q]; sy += ap[q] * g.y[q]; mx = Math.max(mx, ap[q]); }
    return { y: sy / sw, alto: mx };
  };
  const a = cima(oliva), b = cima({ ...oliva, caja: caja([0, 0]) }), c = cima({ ...oliva, caja: caja([10 / 250, 0]) });
  // caja de costado: todo el perfil al 150 % → la oliva queda 1,5 veces más alta
  const e = cima({ ...oliva, perfil: { u0: 0.4, u1: 0.8, f: [1.5, 1.5, 1.5, 1.5, 1.5] } });
  const ok = Math.abs(a.y - b.y) < 0.05 && Math.abs(c.y - a.y - 10) < 0.8 && Math.abs(c.alto - a.alto) < 0.1 && Math.abs(e.alto - 1.5 * a.alto) < 0.15;
  prueba('Caja de un elemento', ok, `sin mover: ${n1(b.y - a.y)} mm; corrida 10 mm: se movió ${n1(c.y - a.y)} mm, alto ${n1(a.alto)} → ${n1(c.alto)} mm; perfil al 150 %: alto ${n1(e.alto)} mm`);
}

// 16. Horma Crocs (biblioteca de hormas, 2026-11-16): copa recta (borde externo a 10 mm ± 0,6 del 3 % al 38 %,
// pedido de Ernesto), lado interno como la captura de LutraCAD (sube del talón a 20,8 mm al 39 % y baja hasta el
// 65 %; error < 1,2 mm), ancho de la captura de arriba y sólido cerrado.
{
  // desde el 2026-11-17 la Crocs se arma desde las capturas (base_crocs); el lado interno contra la captura está en la 19
  const m = bib.hormas.find(x => x.id === 'crocs'), b = bib.hormas.find(x => x.id === m.base);
  const h = prepararHorma(await leer('../biblioteca/' + b.archivo), b.ref, { ...b.op, copaLado: m.copaLado });
  const g = generar(h, { largo: 288, antepie: 1.5, copa: 10, arco: 20.8, canto: 1.2, acabado, lado: 'izq', arcoPos: m.valores.arcoPos }), md = medidas(g);
  // tramos de ~2,9 mm; el borde externo = puntos del contorno con x < 0 (pie izquierdo centrado)
  const N = 100, sil = new Array(N + 1).fill(0), ext = new Array(N + 1).fill(null), xmin = new Array(N + 1).fill(Infinity);
  for (let q = 0; q < g.x.length; q++) { const k = Math.round(g.y[q] / 288 * N); if (k >= 0 && k <= N) sil[k] = Math.max(sil[k], g.z[q]); }
  for (let i = 0; i < g.ns; i++) { const q = i * g.nr, k = Math.round(g.y[q] / 288 * N); if (k >= 0 && k <= N && g.x[q] < 0 && g.x[q] < xmin[k]) { xmin[k] = g.x[q]; ext[k] = g.z[q]; } }
  let dif = Math.abs(md.arco - 20.8), recta = 0;
  for (let k = Math.round(0.03 * N); k <= 0.38 * N; k++) if (ext[k] != null) recta = Math.max(recta, Math.abs(ext[k] - 10));
  // sin escalón en la punta del talón (borde de los primeros 6 mm parejo) y sin pliegues más fuertes que la guía
  // pliegue de arriba fuera del primer 2 % del talón (como la prueba 19: en la punta del talón los anillos del canto
  // están a décimas de mm y una diferencia de centésimas da ángulos que no se ven); el de abajo, como siempre
  const { lisura: lis } = await import('../motor/plantilla.js'), L = lis(g);
  { const { ns, nr, x, y } = g, fuera = z => { const nor = (a, b, c) => { const ux = x[b]-x[a], uy = y[b]-y[a], uz = z[b]-z[a], vx = x[c]-x[a], vy = y[c]-y[a], vz = z[c]-z[a]; const n = [uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx], l = Math.hypot(...n) || 1; return n.map(v => v / l); };
      let mx = 0; for (let i = 0; i < ns; i++) for (let k = 0; k < nr - 3; k++) { const j = (i + 1) % ns, a = i*nr+k; if (y[a] < 0.02 * 288 || Math.hypot(x[a+1]-x[a], y[a+1]-y[a]) < 0.15) continue;
        const n1 = nor(a, j*nr+k, j*nr+k+1), n2 = nor(a+1, j*nr+k+1, j*nr+k+2); mx = Math.max(mx, Math.acos(Math.min(1, Math.abs(n1[0]*n2[0]+n1[1]*n2[1]+n1[2]*n2[2]))) * 180 / Math.PI); }
      return mx; };
    L.pliegueArriba = fuera(g.z); L.pliegueAbajo = fuera(g.zb); }
  let t0 = Infinity, t1 = -Infinity;
  for (let i = 0; i < g.ns; i++) { const q = i * g.nr; if (g.y[q] < 6) { t0 = Math.min(t0, g.z[q]); t1 = Math.max(t1, g.z[q]); } }
  // abajo: el máximo está en el canto del acabado de resina (anillo 1, lado interno, mitad del largo): 25° con la base
  // EasyCAD, 28° con la Guía, 30,7° con la Crocs (antepié más ancho); no es arruga de la horma
  const rev = revisarSolido(solido(g)), ok = dif < 0.2 && recta < 0.6 && t1 - t0 < 1 && L.pliegueArriba < 9 && L.pliegueAbajo < 33 && Math.abs(md.copa - 10) < 0.15 && Math.abs(md.anchoAntepie / 288 - 0.366) < 0.01 && Math.abs(md.antepie - 1.5) < 0.05 && rev.cerrado;
  prueba('Horma Crocs', ok, `copa recta: borde externo a 10 mm ± ${n1(recta)} hasta el 38 %; arco ${n1(md.arco)} mm al ${Math.round(md.arcoDesdeTalon * 100)} %; ancho antepié ${n1(md.anchoAntepie)} mm (${n2(md.anchoAntepie / 288)} del largo); talón parejo ± ${n1(t1 - t0)} mm; pliegues ${n1(L.pliegueArriba)}° arriba, ${n1(L.pliegueAbajo)}° abajo; sólido ${rev.cerrado ? 'cerrado' : 'con fallas'}`);
}

// 17. Ancho del talón propio (2026-11-16): con escalaTalon 0,9 el talón queda 10 % más angosto, el antepié y el largo
// no cambian, la copa sigue en su valor y el sólido queda cerrado y liso.
{
  const { lisura: lis } = await import('../motor/plantilla.js');
  const p0 = { largo: 260, antepie: 1.5, copa: 10, canto: 1.2, acabado, lado: 'izq' };
  const a = medidas(generar(horma, p0)), g = generar(horma, { ...p0, escalaTalon: 0.9 }), b = medidas(g), L = lis(g);
  const ok = Math.abs(b.anchoTalon / a.anchoTalon - 0.9) < 0.015 && Math.abs(b.anchoAntepie - a.anchoAntepie) < 0.3 &&
    Math.abs(b.largo - a.largo) < 0.05 && Math.abs(b.copa - 10) < 0.2 && revisarSolido(solido(g)).cerrado && L.pliegueArriba < 9;
  prueba('Ancho del talón', ok, `talón ${n1(a.anchoTalon)} → ${n1(b.anchoTalon)} mm; antepié ${n1(a.anchoAntepie)} → ${n1(b.anchoAntepie)} mm; copa ${n2(b.copa)}; pliegue ${n1(L.pliegueArriba)}°`);
}

// 18. Descargas (2026-11-16): con espesor suficiente (antepié 3,5 mm) la descarga hunde su profundidad; con la
// plantilla fina (2 mm) pidiendo 4 mm nunca deja menos de 1 mm sobre la cara de abajo; la cara de abajo no cambia,
// sin pliegues y sólido cerrado.
{
  const { prepararElemento, lisura: lis } = await import('../motor/plantilla.js');
  const els = (await leer('../biblioteca/elementos.json')).elementos;
  const grueso = { largo: 260, antepie: 3.5, copa: 14, canto: 1.2, acabado, lado: 'izq' }, fino = { ...grueso, antepie: 2 };
  const res = {};
  for (const [id, alto, p0] of [['descarga_talon', 2, grueso], ['descarga_1mtt', 1.5, grueso], ['descarga_1mtt', 4, fino]]) {
    const sin = generar(horma, p0);
    const g = generar(horma, { ...p0, elementos: [{ forma: prepararElemento(els.find(e => e.id === id)), altura: alto }] });
    let hondo = 0, minEsp = Infinity, abajo = 0;
    for (let q = 0; q < g.z.length; q++) { hondo = Math.max(hondo, sin.z[q] - g.z[q]); if (g.he[q] < -0.01) minEsp = Math.min(minEsp, g.z[q] - g.zb[q]); abajo = Math.max(abajo, Math.abs(g.zb[q] - sin.zb[q])); }
    res[id + ' ' + alto] = { hondo, minEsp, abajo, L: lis(g), cerrado: revisarSolido(solido(g)).cerrado };
  }
  const t = res['descarga_talon 2'], m = res['descarga_1mtt 1.5'], m4 = res['descarga_1mtt 4'];
  const ok = Math.abs(t.hondo - 2) < 0.15 && Math.abs(m.hondo - 1.5) < 0.15 && m4.minEsp >= 0.99 && Object.values(res).every(r => r.abajo < 1e-6 && r.cerrado && r.L.pliegueArriba < 12);
  prueba('Descargas', ok, `con espesor 3,5: talón hunde ${n2(t.hondo)} de 2 mm, 1.er MTT ${n2(m.hondo)} de 1,5 mm; espesor 2 pidiendo 4 mm: queda ${n2(m4.minEsp)} mm de espesor mínimo; cara de abajo sin cambio; pliegues ${Object.values(res).map(r => n1(r.L.pliegueArriba)).join(' / ')}°`);
}

// 19. Hormas sacadas de las capturas de LutraCAD (2026-11-17): Guía de tallas (estándar) y Chimpunes (delgado).
// Lado interno (silueta) y borde externo comparados con lo medido en las capturas, cada 5 % del largo (error < 1 mm);
// talón parejo, sin pliegues fuera de la punta del talón y sólido cerrado.
{
  // Hormas armadas desde capturas (2026-11-17, herramientas/horma_de_capturas.js): con sus alturas propias, el lado
  // interno y el borde externo se comparan con lo medido en los costados de la captura, del 5 % al 90 % del largo
  const HC = await import('../herramientas/horma_de_capturas.js');
  const casos = {
    chimpunes: { interno: ['chimpunes_costado_interno.png', false], externo: ['chimpunes_costado_externo.png', true], copaHasta: 0.42 },
    crocs: { interno: ['crocs_costado.png', false], externo: ['crocs_costado2.png', true], copaHasta: 0.4 },
  };
  const pliegueFuera = g => {   // mayor ángulo entre caras vecinas de arriba, fuera del primer 2 % (punta del talón)
    const { ns, nr, x, y, z } = g, L = Math.max(...y); let mx = 0;
    const nor = (a, b, c) => { const ux = x[b]-x[a], uy = y[b]-y[a], uz = z[b]-z[a], vx = x[c]-x[a], vy = y[c]-y[a], vz = z[c]-z[a]; const n = [uy*vz-uz*vy, uz*vx-ux*vz, ux*vy-uy*vx]; const l = Math.hypot(...n) || 1; return n.map(v => v / l); };
    for (let i = 0; i < ns; i++) for (let k = 0; k < nr - 2; k++) { const j = (i + 1) % ns, a = i*nr+k; if (y[a] < 0.02 * L) continue;
      const n1 = nor(a, j*nr+k, j*nr+k+1), n2 = nor(i*nr+k+1, j*nr+k+1, j*nr+k+2); mx = Math.max(mx, Math.acos(Math.min(1, Math.abs(n1[0]*n2[0]+n1[1]*n2[1]+n1[2]*n2[2]))) * 180 / Math.PI); }
    return mx;
  };
  const texto = []; let bien = true;
  for (const [id, c] of Object.entries(casos)) {
    const m = bib.hormas.find(x => x.id === id), b = bib.hormas.find(x => x.id === m.base);
    const ev = HC.evaluar(await leer('../biblioteca/' + b.archivo), { ...b.op, copaLado: m.copaLado }, 288), { g, sil, ext } = ev;
    const pI = await HC.perfilCostado('../biblioteca/hormas/referencias/' + c.interno[0], 288, c.interno[1]);
    const pE = await HC.perfilCostado('../biblioteca/hormas/referencias/' + c.externo[0], 288, c.externo[1]);
    // borde externo de la captura: recto a la altura de la copa hasta `copaHasta` (la línea blanca se pierde bajo la loma)
    // y desde ahí solo baja (en el antepié la línea blanca se confunde con la plantilla y la lectura cruda salta)
    const copaCap = pE.bordeExt(0.25), Eb = HC.gauss(HC.muestrear(pE.bordeExt, 100), 0.008);
    for (let k = 0; k <= 100; k++) Eb[k] = k / 100 < c.copaHasta ? copaCap : Math.min(Eb[k], Eb[k - 1], copaCap);
    let eM = 0, eE = 0;
    for (let k = 5; k <= 90; k++) { const t = k / 100; eM = Math.max(eM, Math.abs(sil[k] - pI.silueta(t)));
      if (t > 0.08) eE = Math.max(eE, Math.abs(ext[k] - Eb[k])); }
    // talón sin escalón: mayor salto de altura entre puntos vecinos del borde en los primeros 6 mm (el borde puede
    // subir parejo del lado externo al interno, como en la Guía con el arco C1: 13,4 → 14,6 mm)
    let t0 = 0, t1 = 0; for (let i = 0; i < g.ns; i++) { const q = i * g.nr, r = ((i + 1) % g.ns) * g.nr; if (g.y[q] < 6 && g.y[r] < 6) t1 = Math.max(t1, Math.abs(g.z[r] - g.z[q])); }
    const pf = pliegueFuera(g), md = medidas(g), cerrado = revisarSolido(solido(g)).cerrado;
    const ok = eM < 0.6 && eE < 0.6 && t1 - t0 < 0.3 && pf < 9 && Math.abs(md.copa - ev.ref.copa) < 0.2 && cerrado;
    bien = bien && ok;
    texto.push(`${m.nombre}: interno ±${n2(eM)} mm, borde externo ±${n2(eE)} mm, talón ±${n1(t1 - t0)}, pliegue ${n1(pf)}°, copa ${n1(md.copa)}, arco al ${Math.round(md.arcoDesdeTalon * 100)} %${cerrado ? '' : ', sólido abierto'}`);
  }
  // Guía de tallas (2026-11-17): copia del STL de referencia de Ernesto. Toda la cara de arriba comparada con el STL
  // (a 268 mm con copa 13, espesor 2 y arco 20,1, como el STL), sin los 3 anillos del canto.
  {
    const m = bib.hormas.find(x => x.id === 'guia_tallas'), b = bib.hormas.find(x => x.id === m.base);
    const h = prepararHorma(await leer('../biblioteca/' + b.archivo), b.ref, b.op);
    const g = generar(h, { largo: 268, canto: 1.2, lado: 'izq', copa: 13, antepie: 2, arco: 20.1, arcoPos: m.valores.arcoPos });
    const buf = await (await fetch('../biblioteca/hormas/referencias/guia_de_talla_L_optimizada_v2.stl')).arrayBuffer(), dv = new DataView(buf), nt = dv.getUint32(80, true);
    const R = 0.5, X0 = -146, Y0 = -1, NX = 186, NY = 542, Hm = new Float32Array(NX * NY).fill(-1);
    for (let t = 0; t < nt; t++) {
      const o = 84 + t * 50 + 12, v = []; for (let k = 0; k < 9; k++) v.push(dv.getFloat32(o + k * 4, true));
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = v, ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nz = ux * vy - uy * vx; if (nz / (Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, nz) || 1) < 0.15) continue;
      for (let j = Math.max(0, Math.floor((Math.min(ay, by, cy) - Y0) / R)); j <= Math.min(NY - 1, Math.ceil((Math.max(ay, by, cy) - Y0) / R)); j++)
        for (let i = Math.max(0, Math.floor((Math.min(ax, bx, cx) - X0) / R)); i <= Math.min(NX - 1, Math.ceil((Math.max(ax, bx, cx) - X0) / R)); i++) {
          const wx = X0 + i * R - ax, wy = Y0 + j * R - ay, s = (wx * vy - wy * vx) / nz, r = (ux * wy - uy * wx) / nz;
          if (s < -1e-6 || r < -1e-6 || s + r > 1 + 1e-6) continue; const z = az + s * uz + r * vz; if (z > Hm[j * NX + i]) Hm[j * NX + i] = z;
        }
    }
    // corrimiento en X: centro de la fila a 80 mm del talón en el STL y en la plantilla
    let ox = 0; { const a = [], c = []; for (let q = 0; q < g.x.length; q++) if (Math.abs(g.y[q] - 80) < 1) a.push(g.x[q]);
      for (let t = 0; t < nt; t++) { const o = 84 + t * 50 + 12; if (Math.abs(dv.getFloat32(o + 4, true) - 79.7) < 1) c.push(dv.getFloat32(o, true)); }
      ox = (Math.min(...c) + Math.max(...c)) / 2 - (Math.min(...a) + Math.max(...a)) / 2; }
    const errs = [];
    for (let i = 0; i < g.ns; i++) for (let k = 3; k < g.nr; k++) {
      const q = i * g.nr + k, ii = Math.round((g.x[q] + ox - X0) / R), jj = Math.round((g.y[q] - 0.335 - Y0) / R);
      if (ii < 0 || jj < 0 || ii >= NX || jj >= NY || Hm[jj * NX + ii] < 0) continue; errs.push(Math.abs(g.z[q] - Hm[jj * NX + ii]));
    }
    errs.sort((a, b) => a - b);
    const media = errs.reduce((s, e) => s + e, 0) / errs.length, p95 = errs[Math.floor(errs.length * 0.95)];
    const pf = pliegueFuera(g), md = medidas(g), cerrado = revisarSolido(solido(g)).cerrado;
    const ok = media < 0.12 && p95 < 0.35 && pf < 9 && Math.abs(md.copa - 13) < 0.2 && cerrado;
    bien = bien && ok;
    texto.unshift(`Guía de tallas (STL de Ernesto): diferencia media ${n2(media)} mm, 95 % < ${n2(p95)} mm, pliegue ${n1(pf)}°, copa ${n1(md.copa)}, arco al ${Math.round(md.arcoDesdeTalon * 100)} %${cerrado ? '' : ', sólido abierto'}`);
  }
  prueba('Hormas de las capturas', bien, texto.join(' · '));
}

// 20. G-code de la fresadora de EVA (Sensor Medica VX1R / EdingCNC, 2026-11-17): mismo formato que los trabajos de la
// máquina (encabezado, G28 M5 % al final), izquierda en Y positivo y derecha en Y negativo con el arco hacia el centro,
// entra en el bloque de 350 × 260, la bola de 10 mm nunca baja de la superficie y avisa si el bloque no alcanza.
{
  const { gcodeEVA } = await import('../motor/fresado.js');
  const m = bib.hormas.find(x => x.id === 'guia_tallas'), b = bib.hormas.find(x => x.id === m.base);
  const h = prepararHorma(await leer('../biblioteca/' + b.archivo), b.ref, b.op), p = { largo: 290, antepie: 2, copa: 14, arco: 20, canto: 1.2, arcoPos: 0.4 };
  const gi = generar(h, { ...p, lado: 'izq' }), gd = generar(h, { ...p, lado: 'der' }), r = gcodeEVA(gi, gd, { nombre: 'prueba', bloque: { alto: 26 } });
  const L = r.texto.trim().split('\n'), cab = L.slice(1, 9).join(' ') === '% G90 G28 S24000 M03 G64 F14400 G01 Z55.00', pie = L.slice(-4).join(' ') === 'G01 Z55.00 G28 M5 %';
  let x = 0, y = 0, z = 0, X0 = Infinity, X1 = -Infinity, Y0 = Infinity, Y1 = -Infinity, zMin = Infinity, arcoI = [-1], arcoD = [-1], pts = [];
  for (const l of L) { const a = l.match(/X(-?[\d.]+)/), c = l.match(/Y(-?[\d.]+)/), d = l.match(/Z(-?[\d.]+)/); if (a) x = +a[1]; if (c) y = +c[1]; if (d) z = +d[1];
    if (!l.startsWith('G01') || z >= 50) continue; X0 = Math.min(X0, x); X1 = Math.max(X1, x); Y0 = Math.min(Y0, y); Y1 = Math.max(Y1, y); zMin = Math.min(zMin, z);
    if (z > 1.5) { pts.push([x, y, z]); if (x > -110) { if (y > 0 && z > arcoI[0]) arcoI = [z, y]; if (y < 0 && z > arcoD[0]) arcoD = [z, y]; } } }
  // la bola (centro en z + 5) no entra en la plantilla: se miran 400 puntos contra la superficie del pie izquierdo
  const Lg = Math.max(...gi.y); let xmax = -Infinity; for (const v of gi.x) xmax = Math.max(xmax, v);
  let pen = 0; const izqPts = pts.filter(q => q[1] > 0);
  for (let s = 0; s < 400; s++) { const [px, py, pz] = izqPts[Math.floor(s * izqPts.length / 400)];
    for (let q = 0; q < gi.x.length; q += 3) { const sx = gi.y[q] - Lg / 2, sy = 7 + xmax - gi.x[q], dd = Math.hypot(sx - px, sy - py); if (dd > 5) continue;
      pen = Math.max(pen, gi.z[q] - (pz + 5 - Math.sqrt(25 - dd * dd))); } }
  const bajo = gcodeEVA(gi, gd, { bloque: { alto: 15 } }).avisos.length > 0;
  const ok = cab && pie && !r.avisos.length && X0 >= -175 && X1 <= 175 && Y0 >= -130 && Y1 <= 130 && zMin >= 0.99 && Math.abs(arcoI[0] - 20) < 0.5 &&
    arcoI[1] > 0 && arcoI[1] < 35 && arcoD[1] < 0 && arcoD[1] > -35 && pen < 0.15 && bajo;
  prueba('G-code fresadora EVA', ok, `${r.lineas} líneas; X ${n1(X0)} a ${n1(X1)}, Y ${n1(Y0)} a ${n1(Y1)} (bloque ±175 × ±130); Z mín ${n2(zMin)}; arco izq ${n1(arcoI[0])} mm en Y ${n1(arcoI[1])}, der en Y ${n1(arcoD[1])}; la bola entra ${n2(Math.max(pen, 0))} mm; avisa bloque bajo: ${bajo ? 'sí' : 'no'}`);
}

// 22. Copa y arco por capas (Ernesto, 2026-11-19): con cada horma, en delgado (copa 10) y estándar (copa 14), la copa
// y el arco quedan en lo pedido y la bajada del arco (del 40 % al 65 %) es la misma: el arco no se vuelve meseta al
// subir la copa. Con copa 10 el arco puede bajar a 12 (antes no bajaba de copa + 6).
{
  const { hormaConContorno } = await import('../motor/plantilla.js');
  const hormaDe = async id => {
    const m = bib.hormas.find(x => x.id === id), b = m.base ? bib.hormas.find(x => x.id === m.base) : m;
    let h = prepararHorma(await leer('../biblioteca/' + b.archivo), b.ref, { ...b.op, relieve: m.relieve, copaLado: m.copaLado });
    if (m.contorno) { const pts = (await leer('../biblioteca/' + m.contorno)).puntos; if (pts?.length > 20) h = hormaConContorno(h, pts); }
    return h;
  };
  const sil = g => { const N = 20, s = new Array(N + 1).fill(0), L = Math.max(...g.y);
    for (let q = 0; q < g.z.length; q++) { const k = Math.round(g.y[q] / L * N); s[k] = Math.max(s[k], g.z[q]); } return s; };
  const texto = []; let bien = true;
  for (const id of ['guia_tallas', 'chimpunes', 'crocs']) {
    const h = await hormaDe(id), p = { largo: 258, arco: 20, arcoPos: 0.35, lado: 'izq' };
    const d = generar(h, { ...p, copa: 10, antepie: 1.5 }), e = generar(h, { ...p, copa: 14, antepie: 2 }), b = generar(h, { ...p, copa: 10, antepie: 1.5, arco: 12 });
    const md = medidas(d), me = medidas(e), mb = medidas(b), sd = sil(d), se = sil(e);
    let dif = 0; for (let k = 8; k <= 13; k++) dif = Math.max(dif, Math.abs(se[k] - sd[k]));
    const ok = Math.abs(md.copa - 10) < 0.2 && Math.abs(me.copa - 14) < 0.2 && Math.abs(md.arco - 20) < 0.2 && Math.abs(me.arco - 20) < 0.2 &&
      Math.abs(mb.arco - 12) < 0.3 && dif < 1.2;
    bien = bien && ok;
    texto.push(`${id}: copa ${n1(md.copa)}/${n1(me.copa)}, arco ${n1(md.arco)}/${n1(me.arco)}, bajada del arco ±${n1(dif)} mm, arco 12 → ${n1(mb.arco)}`);
  }
  prueba('Copa y arco por capas', bien, texto.join(' · '));
}

// 23. Alza (Ernesto, 2026-11-19): 5 mm de talón sube la cara de arriba 5 mm hasta el 30 % y nada desde el 60 %;
// completa sube 5 mm en todo el largo. En EVA (base plana) la cara de abajo no cambia; en resina la base curva sigue
// al alza y el borde queda con el mismo canto fino (sin pared recta del alto del alza). Sólido cerrado y sin pliegues nuevos.
{
  const texto = []; let bien = true, L = 250;
  // espesor del borde (anillo 0) en el talón y el arco (5 % al 50 %), donde la base de resina sube: el mayor. En el
  // antepié la base de resina es plana, así que el alza completa ahí es espesor (como en EVA).
  const cantoMax = g => { let m = 0; for (let i = 0; i < g.ns; i++) { const q = i * g.nr, t = g.y[q] / L; if (t > 0.05 && t < 0.5) m = Math.max(m, g.z[q] - g.zb[q]); } return m; };
  for (const [nombre, base] of [['EVA', {}], ['resina', { acabado }]]) {
    const p0 = { largo: L, antepie: 1.5, copa: 10, lado: 'izq', ...base }, g0 = generar(horma, p0);
    for (const tipo of ['talon', 'completa']) {
      const g = generar(horma, { ...p0, alza: 5, alzaTipo: tipo });
      let enTalon = [Infinity, -Infinity], adelante = [Infinity, -Infinity], abajo = 0;
      for (let q = 0; q < g.z.length; q++) {
        const t = g.y[q] / L, d = g.z[q] - g0.z[q]; abajo = Math.max(abajo, Math.abs(g.zb[q] - g0.zb[q]));
        if (t > 0.03 && t < 0.28) enTalon = [Math.min(enTalon[0], d), Math.max(enTalon[1], d)];
        if (t > 0.62 && t < 0.97) adelante = [Math.min(adelante[0], d), Math.max(adelante[1], d)];
      }
      const esperadoAdelante = tipo === 'completa' ? 5 : 0, rev = revisarSolido(solido(g)), l = lisura(g), l0 = lisura(g0);
      const c0 = cantoMax(g0), c1 = cantoMax(g);
      const baseOk = nombre === 'EVA' ? abajo < 1e-6 : c1 < c0 + 0.3;
      const ok = Math.abs(enTalon[0] - 5) < 0.01 && Math.abs(enTalon[1] - 5) < 0.01 && Math.abs(adelante[0] - esperadoAdelante) < 0.01 &&
        Math.abs(adelante[1] - esperadoAdelante) < 0.01 && baseOk && rev.cerrado && l.pliegueArriba <= l0.pliegueArriba + 1;
      bien = bien && ok;
      texto.push(`${nombre} ${tipo === 'talon' ? 'de talón' : 'completa'}: talón +${n1(enTalon[0])}, antepié +${n1(adelante[1])} mm, ${nombre === 'EVA' ? `abajo ${n2(abajo)} mm` : `borde ${n1(c1)} mm (sin alza ${n1(c0)})`}, pliegue ${n1(l.pliegueArriba)}°, ${rev.cerrado ? 'cerrado' : 'abierto'}`);
    }
  }
  prueba('Alza', bien, texto.join(' · '));
}

// 24. Margen para pulir (Ernesto, 2026-11-19): 5 mm en la punta. El largo crece 5 mm; hasta el 75 % del largo nada se
// mueve; el relieve y el ancho del antepié no cambian; sólido cerrado y sin pliegues nuevos. EVA y resina.
{
  const texto = []; let bien = true, L = 250;
  for (const [nombre, base] of [['EVA', {}], ['resina', { acabado }]]) {
    const p0 = { largo: L, antepie: 1.5, copa: 10, arco: 20, lado: 'izq', ...base }, g0 = generar(horma, p0), g = generar(horma, { ...p0, margenPunta: 5, margenLados: 3 });
    let quieto = 0, dz = 0;
    for (let q = 0; q < g.y.length; q++) {
      if (g0.y[q] / L < 0.35) quieto = Math.max(quieto, Math.abs(g.y[q] - g0.y[q]), Math.abs(g.x[q] - g0.x[q]));
      dz = Math.max(dz, Math.abs(g.z[q] - g0.z[q]), Math.abs(g.zb[q] - g0.zb[q]));
    }
    // ancho del borde a la altura del 70 % (filas de anillo 0 cerca de ese largo, sin margen en largo ahí: t < 0.75)
    const anchoEn = (gg, t0) => { let a = Infinity, b = -Infinity; for (let i = 0; i < gg.ns; i++) { const q = i * gg.nr; if (Math.abs(gg.y[q] / L - t0) < 0.01) { a = Math.min(a, gg.x[q]); b = Math.max(b, gg.x[q]); } } return b - a; };
    const a0 = anchoEn(g0, 0.7), a1 = anchoEn(g, 0.7);
    const m0 = medidas(g0), m1 = medidas(g), rev = revisarSolido(solido(g)), l = lisura(g), l0 = lisura(g0);
    const ok = Math.abs(m1.largo - m0.largo - 5) < 0.05 && quieto < 1e-4 && dz < 1e-6 && Math.abs(a1 - a0 - 6) < 0.3 &&
      rev.cerrado && l.pliegueArriba <= l0.pliegueArriba + 1 && l.quiebreContorno <= l0.quiebreContorno + 1;
    // retropié 3 y costados 3: banda pareja de 3 mm por lado en todo el largo (sin angostarse en el arco, 2026-11-19)
    const gT = generar(horma, { ...p0, margenPunta: 5, margenLados: 3, margenTalon: 3 }), mT = medidas(gT), lT = lisura(gT), revT = revisarSolido(solido(gT));
    const enG0 = gg => ({ ...gg, y: gg.y.map((v, q) => g0.y[q]) });
    const crece = [0.15, 0.3, 0.45, 0.6, 0.7].map(t => anchoEn(enG0(gT), t) - anchoEn(g0, t));
    const okT = Math.abs(mT.largo - m0.largo - 8) < 0.05 && crece.every(c => Math.abs(c - 6) < 0.3) && revT.cerrado &&
      lT.pliegueArriba <= l0.pliegueArriba + 1 && lT.quiebreContorno <= l0.quiebreContorno + 1;
    bien = bien && ok && okT;
    texto.push(`${nombre} con retropié 3: largo ${n1(mT.largo)} mm, el ancho crece al 15/30/45/60/70 %: ${crece.map(n1).join(' / ')} mm, quiebre ${n1(lT.quiebreContorno)}°, ${revT.cerrado ? 'cerrado' : 'abierto'}`);
    texto.push(`${nombre}: largo ${n1(m0.largo)} → ${n1(m1.largo)} mm, ancho al 70 % ${n1(a0)} → ${n1(a1)} mm, antes del 35 % se mueve ${n2(quieto)} mm, alturas ${n2(dz)} mm, quiebre ${n1(l.quiebreContorno)}° (sin margen ${n1(l0.quiebreContorno)}), ${rev.cerrado ? 'cerrado' : 'abierto'}`);
  }
  prueba('Margen para pulir', bien, texto.join(' · '));
}

// 25. Caja del elemento en el diseño (Ernesto, 2026-11-19): con conUV el motor dice de qué (u, v) del elemento viene cada
// punto de la malla (para dibujar y arrastrar la caja). Corrido 10 mm hacia los dedos, u = (y − 10) / largo; pedir los
// (u, v) no cambia la plantilla; sin conUV no se guardan.
{
  const { prepararElemento } = await import('../motor/plantilla.js');
  const oliva = (await leer('../biblioteca/elementos.json')).elementos.find(e => e.id === 'oliva');
  const p0 = { largo: 250, antepie: 1.5, copa: 10, acabado, lado: 'izq' }, forma = prepararElemento(oliva);
  const g0 = generar(horma, { ...p0, elementos: [{ forma, altura: 4, mover: [10, 0] }] });
  const g = generar(horma, { ...p0, elementos: [{ forma, altura: 4, mover: [10, 0], conUV: true }] }), uv = g.uvs[0];
  let du = 0, dz = 0;
  for (let q = 0; q < g.y.length; q++) {
    dz = Math.max(dz, Math.abs(g.z[q] - g0.z[q]));
    if (uv && g.y[q] > 25 && g.y[q] < 225) du = Math.max(du, Math.abs(uv[2 * q] - (g.y[q] - 10) / 250));
  }
  const bien = !!uv && g0.uvs[0] === null && du < 2e-3 && dz < 1e-9;
  prueba('Caja del elemento: (u, v) de la malla', bien, `u vs (y − 10) / largo: ${n2(du * 250)} mm, alturas ${n2(dz)} mm, sin conUV ${g0.uvs[0] === null ? 'no guarda' : 'guarda'}`);
}

// 6. Guardar los STL del pedido en la carpeta salida.
for (const lado of ['izq', 'der']) {
  const nombre = `prueba_resina_240_${lado}.stl`;
  const r = await fetch('../salida/' + nombre, { method: 'PUT', body: aSTL(pies[lado].tri, nombre) });
  prueba(`Guardar ${nombre}`, r.status === 204, r.status === 204 ? 'guardado en la carpeta salida' : 'el servidor respondió ' + r.status);
}

// ---- Página ----
const sal = document.getElementById('salida');
sal.innerHTML = '<table><tr><th>Prueba</th><th>Resultado</th><th>Detalle</th></tr>' +
  filas.map(f => `<tr><td>${f.nombre}</td><td class="${f.pasa ? 'ok' : 'mal'}">${f.pasa ? 'Pasa' : 'Falla'}</td><td>${f.detalle}</td></tr>`).join('') +
  '</table><h2>Resina 240 mm: vista superior, izquierdo y derecho</h2>';

// Vista sombreada desde arriba, para mirar la forma.
const lienzo = document.createElement('canvas'); lienzo.width = 1000; lienzo.height = 640; sal.appendChild(lienzo);
const ctx = lienzo.getContext('2d'), esc = 3.6;
const dibujar = (g, ox, oy) => {
  const { ns, nr, x, y, z } = g, luz = [0.55, -0.35, 0.76];
  for (let i = 0; i < ns; i++) for (let k = 0; k < nr - 1; k++) {
    const j = (i + 1) % ns, a = i * nr + k, b = j * nr + k, e = j * nr + k + 1, d = i * nr + k + 1;
    const ux = x[b] - x[a], uy = y[b] - y[a], uz = z[b] - z[a], vx = x[d] - x[a], vy = y[d] - y[a], vz = z[d] - z[a];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1;
    if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const s = Math.max(0, (nx * luz[0] + ny * luz[1] + nz * luz[2]) / l), t = Math.round(40 + 215 * s);
    ctx.fillStyle = ctx.strokeStyle = `rgb(${t},${t},${t})`; ctx.beginPath();
    for (const q of [a, b, e, d]) ctx.lineTo(ox + y[q] * esc, oy + x[q] * esc);
    ctx.closePath(); ctx.fill(); ctx.stroke();
  }
};
dibujar(pies.izq.g, 60, 170); dibujar(pies.der.g, 60, 480);
ctx.fillStyle = '#c9d3ea'; ctx.font = '13px system-ui';
ctx.fillText('talón', 60, 24); ctx.fillText('dedos', 60 + 240 * esc - 36, 24); ctx.fillText('izquierdo', 930, 175); ctx.fillText('derecho', 930, 485);
window.resultados = resultados;
window.listo = true;
