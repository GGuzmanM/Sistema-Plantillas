// Vista 3D de lo que va a imprimir la impresora de cinta (BETA, Ernesto 2026-11-24). Cada línea del laminador
// (motor/cinta.js, con { capas: true }) se dibuja como un hilo de plástico de su ancho (0,8 mm, boquilla de 0,8) y del
// espesor de la capa, redondeado, con luz: así se ven las paredes y el relleno como en una vista previa de laminador.
// Se dibujan todos los hilos con una sola llamada (instancias): cada hilo es un prisma de 8 lados que arma la placa
// de video con los dos puntos del tramo.
//
// Mundo: X a lo ancho de la cinta (0–210), Y a lo largo de la cinta (lo que sale primero, en Y menor), Z hacia arriba.
// Un punto de una capa (X, s sobre el plano inclinado, cinta z) va a (X, z − s·cos α, s·sen α): la plantilla queda
// quieta y el plano del cabezal avanza capa por capa.
// Ratón como el visor del programa: izquierdo mueve, derecho gira (Mayús invierte), rueda acerca.

const VS_HILO = `#version 300 es
layout(location=0) in vec2 aBase;
layout(location=1) in vec3 iP0; layout(location=2) in vec3 iP1; layout(location=3) in vec4 iDat; layout(location=4) in float iCapa;
uniform mat4 uVista, uProy; uniform vec3 uN; uniform float uActual; uniform int uModo;
uniform vec3 uColTipo[3]; uniform vec3 uColPieza[6]; uniform vec3 uColMat;
out vec3 vNor; out vec3 vPos; out vec3 vCol;
void main() {
  vec3 d = iP1 - iP0; float L = length(d); vec3 dir = d / max(L, 1e-6);
  vec3 S = normalize(cross(uN, dir));
  float a = aBase.y, w = iDat.x * 0.5, e = iDat.y * 0.5;
  // cada tramo se alarga medio espesor en cada punta, para que las uniones no dejen huecos
  vec3 p = mix(iP0, iP1, aBase.x) + dir * (aBase.x * 2.0 - 1.0) * e + S * cos(a) * w + uN * sin(a) * e;
  vec3 n = normalize(S * cos(a) * e + uN * sin(a) * w);
  int t = int(iDat.z + 0.5), pz = int(iDat.w + 0.5);
  vec3 c = uModo == 0 ? uColTipo[t] : uModo == 1 ? uColPieza[pz % 6] : uColMat;
  if (abs(iCapa - uActual) < 0.5) c = mix(c, vec3(1.0), 0.3);
  vCol = c; vec4 q = uVista * vec4(p, 1.0); vPos = q.xyz; vNor = mat3(uVista) * n; gl_Position = uProy * q;
}`;
const FS_HILO = `#version 300 es
precision highp float;
in vec3 vNor; in vec3 vPos; in vec3 vCol; out vec4 color;
void main() {
  vec3 n = normalize(vNor), v = normalize(-vPos);
  if (dot(n, v) < 0.0) n = -n;
  vec3 l1 = normalize(vec3(-0.45, 0.65, 0.65)), l2 = normalize(vec3(0.7, -0.25, 0.35));
  float d = 0.5 * max(dot(n, l1), 0.0) + 0.2 * max(dot(n, l2), 0.0) + 0.3 * max(dot(n, v), 0.0) + 0.16;
  float s = pow(max(dot(n, normalize(l1 + v)), 0.0), 40.0) * 0.22;
  color = vec4(vCol * d + vec3(s), 1.0);
}`;
const VS_PLANO = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol;
uniform mat4 uVista, uProy; out vec4 vCol;
void main() { vCol = aCol; gl_Position = uProy * uVista * vec4(aPos, 1.0); }`;
const FS_PLANO = `#version 300 es
precision highp float; in vec4 vCol; out vec4 color; void main() { color = vCol; }`;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const l = Math.hypot(...a) || 1; return a.map(v => v / l); };
const punto = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function mirarA(ojo, obj, arriba) {
  const f = unit(sub(obj, ojo)), s = unit(cruz(f, arriba)), u = cruz(s, f);
  return new Float32Array([s[0], u[0], -f[0], 0, s[1], u[1], -f[1], 0, s[2], u[2], -f[2], 0, -punto(s, ojo), -punto(u, ojo), punto(f, ojo), 1]);
}
function perspectiva(fov, asp, cerca, lejos) {
  const f = 1 / Math.tan(fov / 2), nf = 1 / (cerca - lejos);
  return new Float32Array([f / asp, 0, 0, 0, 0, f, 0, 0, 0, 0, (lejos + cerca) * nf, -1, 0, 0, 2 * lejos * cerca * nf, 0]);
}
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);

export const COLORES_TIPO = { exterior: '#e8692f', interior: '#f3b23c', relleno: '#3aa56b' };
export const COLORES_PIEZA = ['#e07a3f', '#3b82c4', '#8d5cc4', '#2e9e6a', '#c4a03b', '#c44f6d'];
const TIPO = { 'WALL-OUTER': 0, 'WALL-INNER': 1, FILL: 2 };

export function crearVistaCinta(canvas, maquina = {}) {
  const M = { angulo: 30, ancho: 210, alto: 180, ...maquina };
  const sn = Math.sin((M.angulo * Math.PI) / 180), cs = Math.cos((M.angulo * Math.PI) / 180);
  const gl = canvas.getContext('webgl2', { antialias: true });
  if (!gl) throw new Error('Este navegador no puede mostrar 3D (falta WebGL2). Use Chrome o Edge actualizados.');
  const programa = (vs, fs) => {
    const p = gl.createProgram();
    for (const [t, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
      const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      gl.attachShader(p, s);
    }
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    return p;
  };
  const pH = programa(VS_HILO, FS_HILO), pP = programa(VS_PLANO, FS_PLANO);
  const U = (p, n) => gl.getUniformLocation(p, n);

  // prisma de 8 lados: (a lo largo 0/1, ángulo)
  const LADOS = 8, base = [], idx = [];
  for (let k = 0; k < LADOS; k++) for (const t of [0, 1]) base.push(t, (k / LADOS) * 2 * Math.PI);
  for (let k = 0; k < LADOS; k++) { const a = 2 * k, b = 2 * ((k + 1) % LADOS); idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const vaoH = gl.createVertexArray(); gl.bindVertexArray(vaoH);
  const bBase = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bBase); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(base), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const bIdx = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, bIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  const bInst = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bInst);
  const STRIDE = 11 * 4;
  for (const [loc, n, off] of [[1, 3, 0], [2, 3, 3], [3, 4, 6], [4, 1, 10]]) {
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, STRIDE, off * 4); gl.vertexAttribDivisor(loc, 1);
  }
  gl.bindVertexArray(null);
  const vaoP = gl.createVertexArray(), bP = gl.createBuffer();
  gl.bindVertexArray(vaoP); gl.bindBuffer(gl.ARRAY_BUFFER, bP);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0);
  gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
  gl.bindVertexArray(null);

  const fov = (30 * Math.PI) / 180;
  const cam = { giro: -35, elev: 30, dist: 500, obj: [M.ancho / 2, 100, 5] };
  let hasta = [], zCapa = [], numCapas = 0, actual = -1, modo = 0, largo = 300, pedido = false, ultimo = null;
  const alDibujar = [];

  // capas = las de gcodeCinta({ capas: true }); piezas = r.piezas (para el color por plantilla)
  function poner(capas, piezas = []) {
    let n = 0; for (const c of capas) for (const r of c.recorridos) n += r.pts.length - 1;
    const D = new Float32Array(n * 11); let q = 0;
    hasta = []; zCapa = []; largo = 0;
    capas.forEach((c, ci) => {
      const ancho = ci === 0 ? 0.88 : 0.8, z = c.z - c.esp / sn / 2;   // mitad de la capa, como corta el laminador
      for (const r of c.recorridos) {
        const t = TIPO[r.tipo] ?? 2;
        for (let i = 1; i < r.pts.length; i++) {
          const [x0, s0] = r.pts[i - 1], [x1, s1] = r.pts[i];
          if (Math.hypot(x1 - x0, s1 - s0) < 1e-3) continue;
          const u = z - s0 * cs, pz = Math.max(0, piezas.findIndex(p => u >= p.b0 - 1 && u <= p.b0 + p.largo + 1));
          D.set([x0, z - s0 * cs, s0 * sn, x1, z - s1 * cs, s1 * sn, ancho, c.esp, t, pz, ci], q); q += 11;
          largo = Math.max(largo, c.z);
        }
      }
      hasta.push(q / 11); zCapa.push(c.z);
    });
    numCapas = capas.length; actual = numCapas - 1;
    gl.bindBuffer(gl.ARRAY_BUFFER, bInst); gl.bufferData(gl.ARRAY_BUFFER, D.subarray(0, q), gl.STATIC_DRAW);
    pedir();
  }

  function ejes() {
    const g = (cam.giro * Math.PI) / 180, e = (cam.elev * Math.PI) / 180;
    const dir = [Math.cos(e) * Math.sin(g), -Math.cos(e) * Math.cos(g), Math.sin(e)];
    const arriba = [-Math.sin(e) * Math.sin(g), Math.sin(e) * Math.cos(g), Math.cos(e)];
    return { dir, arriba, der: cruz(arriba, dir).map(v => -v) };
  }

  function planos() {
    // cinta (gris oscuro con marcas cada 25 mm), y el plano del cabezal en la capa actual
    const V = [], quad = (a, b, c, d, col) => V.push(...a, ...col, ...b, ...col, ...c, ...col, ...a, ...col, ...c, ...col, ...d, ...col);
    const y0 = -40, y1 = largo + 60, cinta = [0.30, 0.32, 0.35, 1];
    quad([-10, y0, -0.02], [M.ancho + 10, y0, -0.02], [M.ancho + 10, y1, -0.02], [-10, y1, -0.02], cinta);
    for (let y = Math.ceil(y0 / 25) * 25; y < y1; y += 25) quad([-10, y - 0.25, -0.01], [M.ancho + 10, y - 0.25, -0.01], [M.ancho + 10, y + 0.25, -0.01], [-10, y + 0.25, -0.01], [0.38, 0.40, 0.43, 1]);
    // rodillos (como cajas largas) en las dos puntas
    for (const y of [y0, y1]) quad([-14, y - 4, -0.03], [M.ancho + 14, y - 4, -0.03], [M.ancho + 14, y + 4, -0.03], [-14, y + 4, -0.03], [0.18, 0.19, 0.21, 1]);
    const n = V.length / 7;
    if (actual >= 0 && zCapa.length) {
      const z = zCapa[actual], h = Math.min(M.alto, 80);
      quad([0, z, 0], [M.ancho, z, 0], [M.ancho, z - h * cs, h * sn], [0, z - h * cs, h * sn], [0.11, 0.37, 0.75, 0.12]);
    }
    return { V: new Float32Array(V), opacos: n, total: V.length / 7 };
  }

  function dibujar() {
    pedido = false;
    if (suelto) return;
    const dpr = window.devicePixelRatio || 1, w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); gl.enable(gl.DEPTH_TEST);
    const { dir, arriba } = ejes(), ojo = cam.obj.map((v, i) => v + cam.dist * dir[i]);
    const vista = mirarA(ojo, cam.obj, arriba), proy = perspectiva(fov, w / h, cam.dist * 0.02, cam.dist * 6);
    ultimo = { vista, proy, w: canvas.clientWidth, h: canvas.clientHeight };
    const P = planos();
    gl.useProgram(pP); gl.uniformMatrix4fv(U(pP, 'uVista'), false, vista); gl.uniformMatrix4fv(U(pP, 'uProy'), false, proy);
    gl.bindVertexArray(vaoP); gl.bindBuffer(gl.ARRAY_BUFFER, bP); gl.bufferData(gl.ARRAY_BUFFER, P.V, gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, P.opacos);
    if (numCapas && actual >= 0) {
      gl.useProgram(pH);
      gl.uniformMatrix4fv(U(pH, 'uVista'), false, vista); gl.uniformMatrix4fv(U(pH, 'uProy'), false, proy);
      gl.uniform3f(U(pH, 'uN'), 0, sn, cs); gl.uniform1f(U(pH, 'uActual'), actual); gl.uniform1i(U(pH, 'uModo'), modo);
      gl.uniform3fv(U(pH, 'uColTipo'), new Float32Array([COLORES_TIPO.exterior, COLORES_TIPO.interior, COLORES_TIPO.relleno].flatMap(hex)));
      gl.uniform3fv(U(pH, 'uColPieza'), new Float32Array(COLORES_PIEZA.flatMap(hex)));
      gl.uniform3f(U(pH, 'uColMat'), 0.86, 0.85, 0.82);
      gl.bindVertexArray(vaoH);
      gl.drawElementsInstanced(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0, hasta[actual]);
    }
    // plano del cabezal, transparente, al final
    if (P.total > P.opacos) {
      gl.useProgram(pP); gl.bindVertexArray(vaoP);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
      gl.drawArrays(gl.TRIANGLES, P.opacos, P.total - P.opacos);
      gl.disable(gl.BLEND); gl.depthMask(true);
    }
    gl.bindVertexArray(null);
    for (const f of alDibujar) f();
  }
  function pedir() { if (!pedido) { pedido = true; requestAnimationFrame(dibujar); } }

  function proyectar(p) {
    if (!ultimo) return null;
    const m = (A, v) => [0, 1, 2, 3].map(i => A[i] * v[0] + A[4 + i] * v[1] + A[8 + i] * v[2] + A[12 + i] * v[3]);
    const c = m(ultimo.proy, m(ultimo.vista, [p[0], p[1], p[2], 1]));
    return { x: ((c[0] / c[3] + 1) / 2) * ultimo.w, y: ((1 - c[1] / c[3]) / 2) * ultimo.h, visible: c[3] > 0 };
  }
  // encuadra una caja [x0, y0, z0, x1, y1, z1]; con giro/elev además cambia el ángulo
  function encuadrar(c, giro, elev) {
    cam.obj = [(c[0] + c[3]) / 2, (c[1] + c[4]) / 2, (c[2] + c[5]) / 2];
    cam.dist = (Math.hypot(c[3] - c[0], c[4] - c[1], c[5] - c[2]) / 2 / Math.sin(fov / 2)) * 0.95;
    if (giro !== undefined) { cam.giro = giro; cam.elev = elev; }
    pedir();
  }

  let arr = null;
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => { try { canvas.setPointerCapture(e.pointerId); } catch {} arr = { x: e.clientX, y: e.clientY, mover: (e.button !== 2) !== e.shiftKey }; });
  canvas.addEventListener('pointermove', e => {
    if (!arr) return;
    const dx = e.clientX - arr.x, dy = e.clientY - arr.y; arr.x = e.clientX; arr.y = e.clientY;
    if (arr.mover) { const { arriba, der } = ejes(), k = (cam.dist * Math.tan(fov / 2) * 2) / canvas.clientHeight; cam.obj = cam.obj.map((v, i) => v + der[i] * dx * k + arriba[i] * dy * k); }
    else { cam.giro -= dx * 0.4; cam.elev = Math.max(-89, Math.min(89, cam.elev + dy * 0.4)); }
    pedir();
  });
  const soltar = () => { arr = null; };
  canvas.addEventListener('pointerup', soltar); canvas.addEventListener('pointercancel', soltar);
  canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist = Math.min(5000, Math.max(15, cam.dist * Math.exp(e.deltaY * 0.0012))); pedir(); }, { passive: false });
  const obs = new ResizeObserver(pedir); obs.observe(canvas);
  // al salir de la pantalla (módulo Impresión): devuelve la placa de video; el navegador admite pocas vistas 3D a la vez
  let suelto = false;
  function soltarGL() {
    if (suelto) return; suelto = true; obs.disconnect(); alDibujar.length = 0;
    try { gl.getExtension('WEBGL_lose_context')?.loseContext(); } catch { /* ya estaba perdida */ }
  }

  return {
    poner: (c, p) => { if (!suelto) poner(c, p); }, pedir, proyectar, encuadrar, soltar: soltarGL,
    capa: n => { actual = Math.max(-1, Math.min(numCapas - 1, n)); pedir(); },
    modo: m => { modo = { tipo: 0, plantilla: 1, material: 2 }[m] ?? 0; pedir(); },
    zDeCapa: n => zCapa[n], numCapas: () => numCapas, aMundo: (X, s, z) => [X, z - s * cs, s * sn],
    alDibujar: f => alDibujar.push(f),
  };
}
