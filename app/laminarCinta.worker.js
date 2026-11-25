// Lamina para la impresora de cinta en segundo plano (BETA, 2026-11-24): un par tarda varios segundos y así la
// pantalla no se congela. Recibe { id, piezas, op }: cada pieza trae { g } (plantilla ya generada) o { horma, largo,
// lado, … } para generarla aquí con una horma de la biblioteca (maqueta). Devuelve lo de gcodeCinta con las capas.
import { prepararHorma, prepararAcabado, generar, hormaConContorno } from '../motor/plantilla.js';
import { gcodeCinta } from '../motor/cinta.js';

const leer = r => fetch(new URL(r, import.meta.url)).then(x => x.json());
let bib = null, acabado = null;
const hormas = new Map(), generadas = new Map();
async function horma(id) {
  if (hormas.has(id)) return hormas.get(id);
  bib ??= await leer('../biblioteca/biblioteca.json');
  const m = bib.hormas.find(x => x.id === id) ?? bib.hormas[0], b = m.base ? bib.hormas.find(x => x.id === m.base) : m;
  let h = prepararHorma(await leer('../biblioteca/' + b.archivo), b.ref, { ...b.op, relieve: m.relieve, copaLado: m.copaLado });
  if (m.contorno) { const pts = (await leer('../biblioteca/' + m.contorno)).puntos; if (pts?.length > 20) h = hormaConContorno(h, pts); }
  hormas.set(id, h);
  return h;
}

onmessage = async ({ data }) => {
  const { id, piezas, op } = data;
  try {
    bib ??= await leer('../biblioteca/biblioteca.json');
    acabado ??= prepararAcabado(await leer('../biblioteca/' + bib.acabados[0].archivo));
    const lista = [];
    for (const p of piezas) {
      // la misma plantilla no se vuelve a generar al cambiar un ajuste o sumar otra de la cola
      const clave = p.g ? null : [p.horma, p.largo, p.lado, p.antepie, p.copa, p.arco].join('|');
      let g = p.g ?? generadas.get(clave);
      if (!g) { g = generar(await horma(p.horma), { largo: p.largo, antepie: p.antepie ?? 3, copa: p.copa ?? 14, arco: p.arco ?? 18, acabado, canto: 1.2, lado: p.lado }); generadas.set(clave, g); }
      lista.push({ g, nombre: p.nombre });
    }
    // avance para la barra de la pantalla (la última respuesta manda; las viejas se ignoran allá)
    const progreso = a => postMessage({ id, avance: a });
    const t0 = performance.now(), r = gcodeCinta(lista, { ...op, capas: true, progreso });
    postMessage({ id, firma: data.firma, ...r, ms: performance.now() - t0 });
  } catch (e) { postMessage({ id, error: String(e?.stack || e) }); }
};
