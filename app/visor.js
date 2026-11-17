// Visor 3D mínimo con WebGL2, sin librerías. Muestra mallas indexadas con luz suave y deja girar, acercar y mover.
// Mundo: X a lo ancho, Y a lo largo (dedos hacia +Y), Z hacia arriba.

// aCol2 + aMarca: segundo color (el de un elemento) que se pinta donde la marca pasa de 0,5. El corte se hace en cada
// píxel con la marca interpolada, así el borde del elemento sale nítido y suave aunque la malla sea gruesa (como
// LutraCAD, que pinta cada elemento de un color liso).
const VS = `#version 300 es
in vec3 aPos; in vec3 aNor; in vec3 aCol; in vec3 aCol2; in float aMarca;
uniform mat4 uVista, uProy;
out vec3 vNor; out vec3 vPos; out vec3 vCol; out vec3 vCol2; out float vMarca;
void main() { vec4 p = uVista * vec4(aPos, 1.0); vPos = p.xyz; vNor = mat3(uVista) * aNor; vCol = aCol; vCol2 = aCol2; vMarca = aMarca; gl_Position = uProy * p; }`;

const FS = `#version 300 es
precision highp float;
uniform float uAlfa;
in vec3 vNor; in vec3 vPos; in vec3 vCol; in vec3 vCol2; in float vMarca; out vec4 color;
void main() {
  vec3 n = normalize(vNor), v = normalize(-vPos);
  if (dot(n, v) < 0.0) n = -n;   // las dos caras se iluminan igual
  vec3 l1 = normalize(vec3(-0.45, 0.65, 0.65)), l2 = normalize(vec3(0.7, -0.25, 0.35));
  // dos luces fijas + una desde la cámara (lo que mira de frente se ve claro, como en LutraCAD)
  float d = 0.55 * max(dot(n, l1), 0.0) + 0.2 * max(dot(n, l2), 0.0) + 0.33 * max(dot(n, v), 0.0) + 0.13;
  float s = pow(max(dot(n, normalize(l1 + v)), 0.0), 48.0) * 0.16;
  float w = max(fwidth(vMarca), 1e-4), k = clamp((vMarca - 0.5) / w + 0.5, 0.0, 1.0);
  color = vec4(mix(vCol, vCol2, k) * d + vec3(s), uAlfa);
}`;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function mirarA(ojo, obj, arriba) {
  const f = unit(sub(obj, ojo)), s = unit(cruz(f, arriba)), u = cruz(s, f);
  return new Float32Array([s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0,
    -punto(s, ojo), -punto(u, ojo), punto(f, ojo), 1]);
}
function perspectiva(fov, asp, cerca, lejos) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (cerca - lejos);
  return new Float32Array([f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (lejos + cerca) * nf, -1, 0, 0, 2 * lejos * cerca * nf, 0]);
}

function ortografica(medioAncho, medioAlto, cerca, lejos) {
  const nf = 1 / (cerca - lejos);
  return new Float32Array([1 / medioAncho, 0, 0, 0, 0, 1 / medioAlto, 0, 0, 0, 0, 2 * nf, 0, 0, 0, (lejos + cerca) * nf, 1]);
}

// Vistas fijas: giro alrededor de Z y elevación, en grados. Las de los lados son exactas (elevación 0), como en
// Bambu Studio: con la vista sin perspectiva la pieza se ve con su forma real, sin agrandar lo que está más cerca.
export const VISTAS = {
  '3d': { giro: -32, elev: 32 },
  arriba: { giro: 0, elev: 90 },
  abajo: { giro: 180, elev: -90 },
  lado: { giro: 90, elev: 0 },        // derecha (+X)
  izquierda: { giro: -90, elev: 0 },
  atras: { giro: 0, elev: 0 },        // desde el talón
  delante: { giro: 180, elev: 0 },    // desde los dedos
};

export function crearVisor(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: true });
  if (!gl) throw new Error('Este navegador no puede mostrar 3D (falta WebGL2). Use Chrome o Edge actualizados.');
  const shader = (tipo, src) => {
    const s = gl.createShader(tipo); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.bindAttribLocation(prog, 0, 'aPos'); gl.bindAttribLocation(prog, 1, 'aNor'); gl.bindAttribLocation(prog, 2, 'aCol');
  gl.bindAttribLocation(prog, 3, 'aCol2'); gl.bindAttribLocation(prog, 4, 'aMarca');
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  const uVista = gl.getUniformLocation(prog, 'uVista'), uProy = gl.getUniformLocation(prog, 'uProy'), uAlfa = gl.getUniformLocation(prog, 'uAlfa');

  const fov = (30 * Math.PI) / 180;
  // orto = sin perspectiva (como Bambu en las vistas de los lados): el tamaño de lo que se ve no depende de la distancia
  const cam = { giro: VISTAS['3d'].giro, elev: VISTAS['3d'].elev, dist: 600, obj: [0, 120, 5], orto: true };
  let mallas = [], pedido = false, caja = null, ultimo = null;
  const alDibujar = [], alClic = [];
  // agarrar(px, py) → { mover(px, py), soltar(movio) } o null; lo pone la pantalla
  let agarrar = null;

  function poner(lista) {
    for (const m of mallas) { gl.deleteVertexArray(m.vao); m.bufs.forEach(b => gl.deleteBuffer(b)); }
    // col = color por punto (r, g, b de 0 a 1); sin él, todo en el color de la plantilla
    // alfa < 1 = transparente (el escaneo del pie sobre la plantilla)
    // col2 + marca (opcionales) = color de los elementos y dónde va (ver FS)
    mallas = lista.map(({ pos, nor, idx, col, col2, marca, alfa = 1 }) => {
      if (!col) { col = new Float32Array(pos.length); for (let i = 0; i < col.length; i += 3) col.set([0.93, 0.92, 0.89], i); }
      col2 ??= new Float32Array(pos.length); marca ??= new Float32Array(pos.length / 3);
      const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
      const bufs = [pos, nor, col, col2, marca].map((datos, a) => {
        const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, datos, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, a === 4 ? 1 : 3, gl.FLOAT, false, 0, 0);
        return b;
      });
      const bi = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bi); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      return { vao, bufs: [...bufs, bi], n: idx.length, alfa };
    });
    pedir();
  }

  // Encuadra una caja [xmin, ymin, zmin, xmax, ymax, zmax] sin cambiar el ángulo.
  function encuadrar(c) {
    caja = c;
    cam.obj = [(c[0] + c[3]) / 2, (c[1] + c[4]) / 2, (c[2] + c[5]) / 2];
    const r = Math.hypot(c[3] - c[0], c[4] - c[1], c[5] - c[2]) / 2;
    cam.dist = (r / Math.sin(fov / 2)) * 0.92;
    pedir();
  }
  function vista(nombre) {
    const v = VISTAS[nombre]; if (!v) return;
    girarA(v.giro, v.elev, true);
  }
  // Lleva la cámara a un giro y elevación con una transición corta (por el camino más corto). `encuadra` = además
  // vuelve a encuadrar la pieza.
  let anim = null;
  function girarA(giro, elev, encuadra = false) {
    const g0 = cam.giro, e0 = cam.elev, dg = ((((giro - g0) % 360) + 540) % 360) - 180, de = elev - e0;
    const ini = performance.now(), T = 260;
    if (encuadra && caja) { cam.obj = [(caja[0] + caja[3]) / 2, (caja[1] + caja[4]) / 2, (caja[2] + caja[5]) / 2]; cam.dist = (Math.hypot(caja[3] - caja[0], caja[4] - caja[1], caja[5] - caja[2]) / 2 / Math.sin(fov / 2)) * 0.92; }
    cancelAnimationFrame(anim);
    const paso = t => {
      const u = Math.min((t - ini) / T, 1), s = u * u * (3 - 2 * u);
      cam.giro = g0 + dg * s; cam.elev = e0 + de * s; dibujar();
      if (u < 1) anim = requestAnimationFrame(paso); else { cam.giro = ((giro % 360) + 360) % 360; if (cam.giro > 180) cam.giro -= 360; }
    };
    anim = requestAnimationFrame(paso);
  }

  function ejes() {
    const g = (cam.giro * Math.PI) / 180, e = (cam.elev * Math.PI) / 180;
    const dir = [Math.cos(e) * Math.sin(g), -Math.cos(e) * Math.cos(g), Math.sin(e)];
    const arriba = [-Math.sin(e) * Math.sin(g), Math.sin(e) * Math.cos(g), Math.cos(e)];
    return { dir, arriba, der: cruz(arriba, dir).map(v => -v) };
  }

  function dibujar() {
    pedido = false;
    const dpr = window.devicePixelRatio || 1, w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    const { dir, arriba } = ejes(), lejos = cam.orto ? Math.max(cam.dist * 3, 1500) : cam.dist;
    const ojo = cam.obj.map((v, i) => v + lejos * dir[i]), medio = cam.dist * Math.tan(fov / 2);
    const vista = mirarA(ojo, cam.obj, arriba);
    const proy = cam.orto ? ortografica(medio * (w / h), medio, 1, lejos * 2) : perspectiva(fov, w / h, cam.dist * 0.05, cam.dist * 4);
    gl.useProgram(prog);
    gl.uniformMatrix4fv(uVista, false, vista);
    gl.uniformMatrix4fv(uProy, false, proy);
    // primero lo sólido; después lo transparente, mezclado y sin tapar lo que está detrás
    for (const transparente of [false, true]) {
      if (transparente) { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
      for (const m of mallas) {
        if ((m.alfa < 1) !== transparente) continue;
        gl.uniform1f(uAlfa, m.alfa);
        gl.bindVertexArray(m.vao);
        gl.drawElements(gl.TRIANGLES, m.n, gl.UNSIGNED_INT, 0);
      }
    }
    gl.disable(gl.BLEND); gl.depthMask(true);
    gl.bindVertexArray(null);
    ultimo = { vista, proy, ojo, w: canvas.clientWidth, h: canvas.clientHeight };
    for (const f of alDibujar) f();
  }

  // Punto 3D a píxeles de la pantalla (relativos al lienzo). `visible` = está delante de la cámara.
  function proyectar(p) {
    if (!ultimo) return null;
    const m = (M, v) => [0, 1, 2, 3].map(i => M[i] * v[0] + M[4 + i] * v[1] + M[8 + i] * v[2] + M[12 + i] * v[3]);
    const c = m(ultimo.proy, m(ultimo.vista, [p[0], p[1], p[2], 1]));
    return { x: ((c[0] / c[3] + 1) / 2) * ultimo.w, y: ((1 - c[1] / c[3]) / 2) * ultimo.h, visible: c[3] > 0 };
  }
  // Rayo que sale de la cámara por un píxel del lienzo.
  function rayo(px, py) {
    const { dir, arriba } = ejes(), f = dir.map(v => -v), der = unit(cruz(f, arriba)), up = cruz(der, f);
    const w = canvas.clientWidth, h = canvas.clientHeight, t = Math.tan(fov / 2);
    const nx = (px / w) * 2 - 1, ny = 1 - (py / h) * 2;
    if (cam.orto) {
      // sin perspectiva: todos los rayos son paralelos; sale del plano de la cámara, en el punto del píxel
      const lejos = Math.max(cam.dist * 3, 1500), medio = cam.dist * t;
      return { o: cam.obj.map((v, i) => v + lejos * dir[i] + der[i] * nx * medio * (w / h) + up[i] * ny * medio), d: f };
    }
    const d = unit(f.map((v, i) => v + der[i] * nx * t * (w / h) + up[i] * ny * t));
    return { o: cam.obj.map((v, i) => v + cam.dist * dir[i]), d };
  }
  function pedir() { if (!pedido) { pedido = true; requestAnimationFrame(dibujar); } }
  // Imagen PNG de una vista fija (encuadrada), sin cambiar lo que el usuario está mirando.
  function captura(nombre) {
    const antes = { ...cam, obj: [...cam.obj] }, cajaAntes = caja;
    const v = VISTAS[nombre];
    if (v) { cam.giro = v.giro; cam.elev = v.elev; }
    if (caja) { cam.obj = [(caja[0] + caja[3]) / 2, (caja[1] + caja[4]) / 2, (caja[2] + caja[5]) / 2]; cam.dist = (Math.hypot(caja[3] - caja[0], caja[4] - caja[1], caja[5] - caja[2]) / 2 / Math.sin(fov / 2)) * 0.92; }
    dibujar();
    const url = canvas.toDataURL('image/png');
    Object.assign(cam, antes); caja = cajaAntes; pedir();
    return url;
  }

  // Ratón: izquierdo mueve, derecho gira (Mayús invierte), rueda acerca. El clic izquierdo sigue siendo el de las
  // herramientas y el de agarrar elementos.
  let arrastre = null;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    try { canvas.setPointerCapture(e.pointerId); } catch { /* puntero que ya no existe: se sigue sin capturar */ }
    // izquierdo (o rueda apretada) = mover la vista, derecho = girar (Ernesto, 2026-11-13); con Mayús se invierte
    arrastre = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, mover: (e.button !== 2) !== e.shiftKey, boton: e.button };
    // si alguien quiere agarrar lo que está bajo el ratón (un elemento), el arrastre es suyo y la cámara no gira
    if (e.button === 0 && !e.shiftKey && agarrar) {
      const r = canvas.getBoundingClientRect();
      arrastre.mano = agarrar(e.clientX - r.left, e.clientY - r.top, e) || null;
    }
  });
  canvas.addEventListener('pointerup', e => {
    // un clic sin arrastrar (menos de 4 píxeles) se avisa como clic, en píxeles del lienzo
    if (arrastre && arrastre.boton === 0 && Math.hypot(e.clientX - arrastre.x0, e.clientY - arrastre.y0) < 4) {
      const r = canvas.getBoundingClientRect();
      for (const f of alClic) f(e.clientX - r.left, e.clientY - r.top, e);
    }
  });
  canvas.addEventListener('pointermove', e => {
    if (!arrastre) return;
    const dx = e.clientX - arrastre.x, dy = e.clientY - arrastre.y;
    if (Math.hypot(e.clientX - arrastre.x0, e.clientY - arrastre.y0) < 4) return;
    arrastre.x = e.clientX; arrastre.y = e.clientY;
    if (arrastre.mano) {
      const r = canvas.getBoundingClientRect();
      arrastre.movio = true; arrastre.mano.mover(e.clientX - r.left, e.clientY - r.top); return;
    }
    if (arrastre.mover) {
      const { arriba, der } = ejes(), k = (cam.dist * Math.tan(fov / 2) * 2) / canvas.clientHeight;
      // la pieza sigue a la mano (a lo ancho estaba al revés)
      cam.obj = cam.obj.map((v, i) => v + der[i] * dx * k + arriba[i] * dy * k);
    } else {
      cam.giro -= dx * 0.4;
      cam.elev = Math.max(-90, Math.min(90, cam.elev + dy * 0.4));
    }
    pedir();
  });
  const soltar = () => { if (arrastre?.mano) arrastre.mano.soltar?.(!!arrastre.movio); arrastre = null; };
  canvas.addEventListener('pointerup', soltar); canvas.addEventListener('pointercancel', soltar);
  canvas.addEventListener('pointerleave', () => { if (arrastre) pedir(); });
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist *= Math.exp(e.deltaY * 0.0012); pedir(); }, { passive: false });
  new ResizeObserver(pedir).observe(canvas);

  return { poner, encuadrar, vista, girarA, pedir, proyectar, rayo, captura, ejes,
           camara: () => ({ giro: cam.giro, elev: cam.elev, orto: cam.orto }),
           orbitar: (dx, dy) => { cam.giro -= dx * 0.4; cam.elev = Math.max(-90, Math.min(90, cam.elev + dy * 0.4)); pedir(); },
           perspectivaSiNo: si => { cam.orto = !si; pedir(); },
           alDibujar: f => alDibujar.push(f), alClic: f => alClic.push(f), alAgarrar: f => { agarrar = f; } };
}

// ---- Cubo de vistas (como el de Bambu Studio) ----
// Un cubo chico en la esquina que gira con la cámara. Clic en una cara: se mira desde ahí (vista exacta). Clic en
// una esquina: vista en diagonal. Arrastrar sobre el cubo: gira la cámara.
const CARAS = [
  { n: [0, 0, 1], txt: 'Arriba', u: [1, 0, 0], v: [0, 1, 0], vista: [0, 90] },
  { n: [0, 0, -1], txt: 'Abajo', u: [-1, 0, 0], v: [0, 1, 0], vista: [180, -90] },
  { n: [0, -1, 0], txt: 'Atrás', u: [1, 0, 0], v: [0, 0, 1], vista: [0, 0] },
  { n: [0, 1, 0], txt: 'Delante', u: [-1, 0, 0], v: [0, 0, 1], vista: [180, 0] },
  { n: [1, 0, 0], txt: 'Derecha', u: [0, 1, 0], v: [0, 0, 1], vista: [90, 0] },
  { n: [-1, 0, 0], txt: 'Izquierda', u: [0, -1, 0], v: [0, 0, 1], vista: [-90, 0] },
];
export function crearCubo(lienzo, visor) {
  const c = lienzo.getContext('2d');
  let sobre = null, arr = null;
  const geo = () => {
    const dpr = window.devicePixelRatio || 1, W = lienzo.clientWidth, H = lienzo.clientHeight;
    if (lienzo.width !== Math.round(W * dpr)) { lienzo.width = Math.round(W * dpr); lienzo.height = Math.round(H * dpr); }
    // derecha de la pantalla = arriba × dirección hacia el ojo
    const { dir, arriba } = visor.ejes(), der = [arriba[1] * dir[2] - arriba[2] * dir[1], arriba[2] * dir[0] - arriba[0] * dir[2], arriba[0] * dir[1] - arriba[1] * dir[0]];
    const R = Math.min(W, H) * 0.3, cx = W / 2, cy = H / 2;
    const p = v => [cx + R * (v[0] * der[0] + v[1] * der[1] + v[2] * der[2]), cy - R * (v[0] * arriba[0] + v[1] * arriba[1] + v[2] * arriba[2]), v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]];
    const caras = CARAS.map(f => {
      const cen = f.n, esq = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => cen.map((v, i) => v + a * f.u[i] + b * f.v[i]));
      return { ...f, pts: esq.map(p), centro: p(cen), frente: f.n[0] * dir[0] + f.n[1] * dir[1] + f.n[2] * dir[2] };
    });
    const esquinas = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) esquinas.push({ v: [sx, sy, sz], p: p([sx, sy, sz]) });
    return { dpr, W, H, R, caras, esquinas, p, dir };
  };
  const dentro = (pt, poli) => { let s = false; for (let i = 0, j = poli.length - 1; i < poli.length; j = i++) { const [xi, yi] = poli[i], [xj, yj] = poli[j]; if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) s = !s; } return s; };
  const tocar = (x, y) => {
    const G = geo();
    // esquinas visibles primero (círculo de 9 px)
    const esq = G.esquinas.filter(e => e.p[2] > 0.3).find(e => Math.hypot(e.p[0] - x, e.p[1] - y) < 9);
    if (esq) return { esquina: esq.v };
    const cara = G.caras.filter(f => f.frente > 0.05).sort((a, b) => b.frente - a.frente).find(f => dentro([x, y], f.pts));
    return cara ? { cara } : null;
  };
  function dibujar() {
    const G = geo(); c.setTransform(G.dpr, 0, 0, G.dpr, 0, 0); c.clearRect(0, 0, G.W, G.H);
    const vis = G.caras.filter(f => f.frente > 0.001).sort((a, b) => a.frente - b.frente);
    for (const f of vis) {
      const resal = sobre?.cara === f.txt;
      c.beginPath(); f.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
      const luz = 0.78 + 0.2 * f.frente;
      c.fillStyle = resal ? '#cfe0f7' : `rgb(${Math.round(222 * luz)},${Math.round(226 * luz)},${Math.round(232 * luz)})`; c.fill();
      c.strokeStyle = '#8a94a3'; c.lineWidth = 1; c.stroke();
      // texto pintado sobre la cara (se deforma con ella, como en Bambu)
      const [p0, p1, p3] = [G.p(f.n), G.p(f.n.map((v, i) => v + f.u[i])), G.p(f.n.map((v, i) => v + f.v[i]))];
      const ax = (p1[0] - p0[0]) / 50, ay = (p1[1] - p0[1]) / 50, bx = -(p3[0] - p0[0]) / 50, by = -(p3[1] - p0[1]) / 50;
      c.save(); c.transform(ax, ay, bx, by, p0[0], p0[1]);
      c.fillStyle = f.frente > 0.25 ? '#2c3440' : 'rgba(44,52,64,0.4)'; c.font = '600 17px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(f.txt, 0, 0); c.restore();
    }
    // esquinas visibles
    for (const e of G.esquinas) if (e.p[2] > 0.3) {
      c.beginPath(); c.arc(e.p[0], e.p[1], sobre?.esquina && sobre.esquina.join() === e.v.join() ? 5 : 3, 0, 2 * Math.PI);
      c.fillStyle = sobre?.esquina && sobre.esquina.join() === e.v.join() ? '#1d5fbf' : '#8a94a3'; c.fill();
    }
    // ejes chicos como en Bambu: X rojo, Y verde, Z azul, desde la esquina de atrás-izquierda-abajo
    const o = G.p([-1.35, -1.35, -1.35]);
    for (const [v, col] of [[[1, 0, 0], '#d33'], [[0, 1, 0], '#2a2'], [[0, 0, 1], '#33d']]) {
      const q = G.p([-1.35 + 0.9 * v[0], -1.35 + 0.9 * v[1], -1.35 + 0.9 * v[2]]);
      c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.moveTo(o[0], o[1]); c.lineTo(q[0], q[1]); c.stroke();
    }
  }
  visor.alDibujar(dibujar);
  const pos = e => { const r = lienzo.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  lienzo.addEventListener('pointerdown', e => { try { lienzo.setPointerCapture(e.pointerId); } catch {} const [x, y] = pos(e); arr = { x, y, x0: x, y0: y }; });
  lienzo.addEventListener('pointermove', e => {
    const [x, y] = pos(e);
    if (arr) { if (Math.hypot(x - arr.x0, y - arr.y0) > 3) { visor.orbitar(x - arr.x, y - arr.y); arr.movio = true; } arr.x = x; arr.y = y; return; }
    const t = tocar(x, y), nuevo = t ? (t.cara ? { cara: t.cara.txt } : { esquina: t.esquina }) : null;
    if (JSON.stringify(nuevo) !== JSON.stringify(sobre)) { sobre = nuevo; dibujar(); }
    lienzo.style.cursor = t ? 'pointer' : 'grab';
  });
  lienzo.addEventListener('pointerleave', () => { sobre = null; dibujar(); });
  lienzo.addEventListener('pointerup', e => {
    const a = arr; arr = null; if (!a || a.movio) return;
    const [x, y] = pos(e), t = tocar(x, y); if (!t) return;
    if (t.cara) visor.girarA(t.cara.vista[0], t.cara.vista[1], true);
    else { const [sx, sy, sz] = t.esquina; visor.girarA((Math.atan2(sx, -sy) * 180) / Math.PI, 35.26 * sz, true); }
  });
  return { dibujar };
}
