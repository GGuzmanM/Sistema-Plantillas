// Indicación del doctor en PDF (BETA, Ernesto 2026-11-24). El doctor arma la indicación con clics en app/orden.html
// (sin escribir los nombres de los elementos, que en la ficha anagráfica se escriben con errores) y sale un PDF:
//   · lo que se ve: la información general del paciente y, por par (calzado y material), solo los elementos con su
//     altura y si son bilaterales o de un pie;
//   · lo que lee el programa: los mismos datos en JSON, como archivo adjunto del PDF ("indicacion.json"), con una
//     marca para encontrarlos aunque el PDF no se abra con un lector de PDF completo.
// Si el PDF se vuelve a guardar con otro programa (Acrobat "Guardar como", imprimir a PDF) el adjunto puede perderse:
// entonces el programa avisa que no encontró los datos.
//
// No usa librerías: el PDF se escribe a mano (A4, Helvetica, texto en WinAnsi para las tildes y la ñ).

export const MARCA = 'LIMABLUE-INDICACION:';
export const LADOS = { bi: 'Bilateral', izq: 'Solo izquierdo', der: 'Solo derecho' };

// ---------- leer ----------
// bytes (ArrayBuffer o Uint8Array) de un PDF → la indicación, o null si no es una indicación del programa
export function leerIndicacion(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  const m = new RegExp(MARCA + '([A-Za-z0-9+/=]+)').exec(s);
  if (!m) return null;
  let d;
  try { const t = atob(m[1]), u = new Uint8Array(t.length); for (let i = 0; i < t.length; i++) u[i] = t.charCodeAt(i); d = JSON.parse(new TextDecoder().decode(u)); }
  catch { throw new Error('la indicación está dañada (no se pudieron leer sus datos)'); }
  return limpiarIndicacion(d);
}
// lo que venga de un archivo se revisa: solo lo que tiene forma de indicación pasa, con sus límites
export function limpiarIndicacion(d) {
  if (!d || typeof d !== 'object' || d.tipo !== 'indicacion-limablue') throw new Error('el PDF no es una indicación del programa');
  const txt = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : '');
  const generales = Array.isArray(d.generales) ? d.generales.filter(g => Array.isArray(g) && g.length === 2).map(([k, v]) => [txt(k, 60), txt(v)]).filter(([k, v]) => k && v) : [];
  const pares = (Array.isArray(d.pares) ? d.pares : []).slice(0, 12).map(p => ({
    calzado: txt(p?.calzado, 60), material: txt(p?.material, 60), materialId: txt(p?.materialId, 80),
    elementos: (Array.isArray(p?.elementos) ? p.elementos : []).slice(0, 40).map(e => ({
      id: txt(e?.id, 80), nombre: txt(e?.nombre, 120), altura: Math.min(Math.max(+e?.altura || 0, 0), 15), lado: ['bi', 'izq', 'der'].includes(e?.lado) ? e.lado : 'bi',
    })).filter(e => e.id && e.altura > 0),
  }));
  return { tipo: d.tipo, version: +d.version || 1, creado: txt(d.creado, 40), paciente: txt(d.paciente), generales,
           patologia: txt(d.patologia, 600), motivo: txt(d.motivo, 600), nota: txt(d.nota, 1000), pares };
}

// ---------- escribir ----------
// Windows-1252 para las fuentes base del PDF (tildes, ñ, º, °, ¿¡ y comillas tipográficas)
const CP = { 0x2013: 0x96, 0x2014: 0x97, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2026: 0x85, 0x20ac: 0x80 };
const a1252 = s => [...String(s)].map(c => { const k = c.codePointAt(0); return k < 256 ? c : CP[k] ? String.fromCharCode(CP[k]) : '?'; }).join('');
const lit = s => '(' + a1252(s).replace(/[\\()]/g, m => '\\' + m).replace(/[\r\n]/g, ' ') + ')';
// ancho del texto en puntos (Arial mide como Helvetica)
let ctxMedir = null;
const ancho = (s, pt, negrita) => {
  ctxMedir ??= (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(8, 8) : document.createElement('canvas')).getContext('2d');
  ctxMedir.font = `${negrita ? 'bold ' : ''}${pt}px Arial, Helvetica, sans-serif`;
  return ctxMedir.measureText(String(s)).width;
};
const partir = (s, pt, max, negrita) => {   // texto en renglones de hasta `max` puntos
  const out = []; for (const parrafo of String(s).split('\n')) {
    let r = ''; for (const p of parrafo.split(/\s+/)) { const t = r ? r + ' ' + p : p; if (r && ancho(t, pt, negrita) > max) { out.push(r); r = p; } else r = t; }
    out.push(r);
  }
  return out;
};

// datos de la indicación → bytes del PDF
export function pdfIndicacion(d) {
  const W = 595.28, H = 841.89, M = 48, AZUL = '0.094 0.22 0.85', GRIS = '0.35 0.38 0.45';
  const paginas = []; let ops = [], y = H - M;
  const nueva = () => { if (ops.length) paginas.push(ops.join('\n')); ops = []; y = H - M; };
  const texto = (x, yy, s, pt = 10, negrita = false, color = '0 0 0') => ops.push(`BT ${color} rg /${negrita ? 'F2' : 'F1'} ${pt} Tf ${x.toFixed(2)} ${yy.toFixed(2)} Td ${lit(s)} Tj ET`);
  const linea = (x0, y0, x1, y1, g = 0.8, color = '0.85 0.86 0.9') => ops.push(`${color} RG ${g} w ${x0.toFixed(2)} ${y0.toFixed(2)} m ${x1.toFixed(2)} ${y1.toFixed(2)} l S`);
  const caja = (x, yy, w, h, color) => ops.push(`${color} rg ${x.toFixed(2)} ${yy.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  const espacio = h => { if (y - h < M + 30) nueva(); };
  const titulo = s => { espacio(40); y -= 14; caja(M, y - 5, W - 2 * M, 18, '0.93 0.945 0.985'); caja(M, y - 5, 3, 18, AZUL); texto(M + 9, y, s, 10.5, true, '0.06 0.09 0.23'); y -= 20; };

  // cabecera
  texto(M, y - 16, 'Indicación de plantillas', 17, true, '0.06 0.09 0.23');
  const lb = 'Lima Blue'; texto(W - M - ancho(lb, 11, true), y - 14, lb, 11, true, AZUL);
  y -= 26; linea(M, y, W - M, y, 1.6, AZUL); y -= 24;
  texto(M, y, d.paciente || 'Paciente sin nombre', 15, true); y -= 10;

  // información general en dos columnas: etiqueta en negrita y valor
  titulo('Información general');
  const gen = d.generales.filter(([k]) => k !== 'Apellido y nombre'), col = (W - 2 * M) / 2;
  for (let i = 0; i < gen.length; i += 2) {
    espacio(16);
    for (let j = 0; j < 2 && i + j < gen.length; j++) { const [k, v] = gen[i + j], x = M + j * col; texto(x, y, k, 9.5, true, GRIS); texto(x + 112, y, partir(v, 9.5, col - 118)[0], 9.5); }
    y -= 15;
  }
  for (const [k, v] of [['Patología', d.patologia], ['Motivo de consulta', d.motivo]]) {
    if (!v) continue; const rs = partir(v, 9.5, W - 2 * M - 112); espacio(14 * rs.length);
    texto(M, y, k, 9.5, true, GRIS); rs.forEach((r, i) => texto(M + 112, y - i * 13, r, 9.5)); y -= 13 * rs.length + 2;
  }

  // pares: tabla Elemento · Altura · Lado
  d.pares.forEach((p, i) => {
    titulo(`Par ${i + 1} · ${p.calzado || 'calzado sin indicar'}${p.material ? ' · ' + p.material : ''}`);
    if (!p.elementos.length) { espacio(16); texto(M + 4, y, 'Sin elementos', 10, false, GRIS); y -= 16; return; }
    const cA = M + 300, cL = M + 380;
    espacio(18); texto(M + 4, y, 'Elemento', 8.5, true, GRIS); texto(cA, y, 'Altura', 8.5, true, GRIS); texto(cL, y, 'Lado', 8.5, true, GRIS); y -= 5; linea(M, y, W - M, y, 0.8, '0.6 0.62 0.68'); y -= 13;
    for (const e of p.elementos) {
      espacio(18);
      texto(M + 4, y, e.nombre || e.id, 10.5); texto(cA, y, `${String(e.altura).replace('.', ',')} mm`, 10.5);
      texto(cL, y, LADOS[e.lado], 10.5, true, e.lado === 'bi' ? '0.1 0.48 0.26' : '0.06 0.09 0.23');
      y -= 6; linea(M, y, W - M, y); y -= 13;
    }
  });
  if (d.nota) { titulo('Nota'); for (const r of partir(d.nota, 10, W - 2 * M - 8)) { espacio(14); texto(M + 4, y, r, 10); y -= 13; } }
  nueva();

  // pie de cada página
  const fecha = d.creado ? new Date(d.creado).toLocaleDateString('es-PE') : '';
  const pie = (k, n) => { const pag = `Pág. ${k} de ${n}`;
    return `BT ${GRIS} rg /F1 7.5 Tf ${M} 32 Td ${lit(`Indicación generada con el programa de plantillas de Lima Blue${fecha ? ' · ' + fecha : ''}.`)} Tj ET\n` +
      `BT ${GRIS} rg /F1 7.5 Tf ${M} 22 Td ${lit('Lleva los datos para armar el diseño: no la vuelva a guardar con otro programa.')} Tj ET\n` +
      `BT ${GRIS} rg /F1 7.5 Tf ${(W - M - ancho(pag, 7.5)).toFixed(2)} 32 Td ${lit(pag)} Tj ET`; };

  // objetos del PDF
  const json = new TextEncoder().encode(JSON.stringify(d));
  let b64 = ''; for (let i = 0; i < json.length; i += 0x8000) b64 += String.fromCharCode(...json.subarray(i, i + 0x8000)); b64 = btoa(b64);
  const adjunto = MARCA + b64;
  const objs = [];   // objs[n-1] = cuerpo del objeto n
  const nP = paginas.length, primeraPag = 8;
  objs[0] = `<< /Type /Catalog /Pages 2 0 R /Names << /EmbeddedFiles 5 0 R >> >>`;
  objs[1] = `<< /Type /Pages /Kids [${paginas.map((_, k) => `${primeraPag + 2 * k} 0 R`).join(' ')}] /Count ${nP} >>`;
  objs[2] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`;
  objs[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`;
  objs[4] = `<< /Names [(indicacion.json) 6 0 R] >>`;
  objs[5] = `<< /Type /Filespec /F (indicacion.json) /UF (indicacion.json) /Desc (Datos de la indicacion para el programa de plantillas) /EF << /F 7 0 R >> >>`;
  objs[6] = `<< /Type /EmbeddedFile /Subtype /text#2Fplain /Length ${adjunto.length} >>\nstream\n${adjunto}\nendstream`;
  paginas.forEach((c, k) => {
    const cont = c + '\n' + pie(k + 1, nP);
    objs[primeraPag - 1 + 2 * k] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${primeraPag + 2 * k + 1} 0 R >>`;
    objs[primeraPag + 2 * k] = `<< /Length ${cont.length} >>\nstream\n${cont}\nendstream`;
  });
  const info = objs.length + 1;
  objs.push(`<< /Title ${lit('Indicación de plantillas · ' + (d.paciente || ''))} /Producer (Programa de plantillas Lima Blue) /Creator (Lima Blue) >>`);
  let s = '%PDF-1.7\n%\xe2\xe3\xcf\xd3\n'; const offs = [];
  objs.forEach((o, k) => { offs.push(s.length); s += `${k + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = s.length;
  s += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  s += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}
