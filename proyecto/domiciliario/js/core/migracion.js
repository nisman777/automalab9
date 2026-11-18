import { FORMATO } from '../config.js';
import { crearProyectoVacio, nuevoId } from './modelo.js';

// El formato nuevo tiene "plantas" (lista). El viejo no.
export const esCasaVieja = (o) => !!o && o.formato === FORMATO && !Array.isArray(o.plantas);

const finitos = (...v) => v.every(Number.isFinite);

function leerLinea(o) {
  if (finitos(o.x1, o.y1, o.x2, o.y2)) return { x1: o.x1, y1: o.y1, x2: o.x2, y2: o.y2 };
  for (const [a, b] of [['a', 'b'], ['p1', 'p2'], ['ini', 'fin']]) {
    const A = o[a], B = o[b];
    if (A && B && finitos(A.x, A.y, B.x, B.y)) return { x1: A.x, y1: A.y, x2: B.x, y2: B.y };
  }
  return null;
}

function normalizarSistema(s) {
  const t = String(s ?? '').toLowerCase();
  if (t.startsWith('tri')) return 'tri';
  if (t.startsWith('mono')) return 'mono';
  return null;
}

// Convierte la "casa" del plano.js anterior en un proyecto nuevo.
// Las líneas viejas pasan a "lineas" (dibujo libre), sin suponer que son muros.
export function desdeCasaVieja(casa, sistemaSuelto = null) {
  const avisos = [];
  const nombre = typeof casa.nombre === 'string' && casa.nombre.trim()
    ? casa.nombre.trim().slice(0, 80) : 'Casa anterior (importada)';
  const datos = crearProyectoVacio(nombre);
  const planta = datos.plantas[0].id;
  let ok = 0, mal = 0;

  // No supongo cómo se llama la lista: recorro todas las listas del objeto.
  for (const valor of Object.values(casa)) {
    if (!Array.isArray(valor)) continue;
    for (const o of valor) {
      if (!o || typeof o !== 'object' || o.t !== 'linea') continue;
      const c = leerLinea(o);
      if (c) { datos.lineas.push({ id: nuevoId('l'), planta, capa: 'dibujo', ...c }); ok++; }
      else mal++;
    }
  }

  const sis = normalizarSistema(casa.sistema) ?? normalizarSistema(sistemaSuelto);
  if (sis) datos.proyecto.sistema = sis;

  avisos.push(`Casa anterior: ${ok} línea(s) importada(s) como dibujo libre en la capa "Dibujo".`);
  if (mal) avisos.push(`No pude leer las coordenadas de ${mal} línea(s).`);
  if (ok === 0 && mal === 0) avisos.push('No encontré líneas reconocibles en la casa anterior.');
  return { datos, avisos };
}