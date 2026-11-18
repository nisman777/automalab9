import { FORMATO, VERSION_ESQUEMA } from '../config.js';
import { nuevoId, crearProyectoVacio, clonar, COLECCIONES_DE_PLANTA } from './modelo.js';
import { desdeCasaVieja, esCasaVieja } from './migracion.js';

export class ErrorFormato extends Error {}

const MAX_OBJETOS = 50000;

// Descripción de campos: tipo, valor por defecto y si es obligatorio.
const num  = (def, req = false) => ({ tipo: 'n', def, req });
const txt  = (def, req = false, max = 200) => ({ tipo: 's', def, req, max });
const bool = (def) => ({ tipo: 'b', def });
const enu  = (valores, def) => ({ tipo: 'e', valores, def });
const pts  = (min) => ({ tipo: 'pts', def: [], req: true, min });
const obj  = (def) => ({ tipo: 'o', def });

const COBERTURAS = ['cubierta', 'semicubierta', 'descubierta'];
const planta = () => txt('', true, 48);
const capa = (def) => txt(def, false, 48);
const segmento = () => ({ x1: num(0, true), y1: num(0, true), x2: num(0, true), y2: num(0, true) });

const ESQ_PROYECTO = {
  nombre: txt('Sin nombre', false, 80),
  sistema: enu(['mono', 'tri'], 'mono'),
  tipoLocal: enu(['vivienda', 'oficina', 'deposito', 'otro'], 'vivienda'),
  gradoManual: enu(['minimo', 'medio', 'elevado', 'superior', null], null),
};
const ESQ_ROTULO = {
  propietario: txt('', false, 80), ubicacion: txt('', false, 120), autor: txt('', false, 80),
  fecha: txt('', false, 20), revision: txt('0', false, 10),
  profesional: txt('', false, 80), matricula: txt('', false, 40),
};
const ESQ_PAPEL = { tamano: enu(['A4', 'A3', 'A2', 'A1'], 'A3'), escala: num(50) };
const ESQ_UI = { plantaActiva: txt('', false, 48) };

const ESQ = {
  plantas: { nombre: txt('Planta', false, 60), cota: num(0), alto: num(2.6) },
  capas: { nombre: txt('Capa', false, 60), color: txt('#ffffff', false, 20), visible: bool(true), bloqueada: bool(false) },
  lineas: { planta: planta(), capa: capa('dibujo'), ...segmento() },
  muros: { planta: planta(), capa: capa('muros'), ...segmento(), espesor: num(0.15) },
  aberturas: {
    planta: planta(), capa: capa('aberturas'), muro: txt('', true, 48),
    pos: num(0), ancho: num(0.9), alto: num(2.05), z: num(0), tipo: enu(['puerta', 'ventana'], 'puerta'),
  },
  locales: {
    planta: planta(), capa: capa('locales'), poligono: pts(3),
    nombre: txt('', false, 60), tipo: txt('otro', false, 40), cobertura: enu(COBERTURAS, 'cubierta'),
  },
  bocas: {
    planta: planta(), capa: capa('electrico'), x: num(0, true), y: num(0, true), z: num(0.3),
    tipo: txt('toma', false, 40), circuito: txt('', false, 48), potenciaVA: num(null),
  },
  canalizaciones: {
    planta: planta(), capa: capa('canalizaciones'), puntos: pts(2),
    tipo: txt('cañería', false, 40), diametro: num(null),
  },
  circuitos: {
    nombre: txt('', false, 60), tipo: txt('TUG', false, 10),
    proteccion: obj({ In: null, curva: null, polos: 2 }),
    seccion: num(null), diferencial: txt('', false, 48),
  },
  // Provisorio: se define bien en el paso 4 (tablero).
  'tablero.filas': { nombre: txt('Riel 1', false, 60), modulos: num(12) },
  'tablero.dispositivos': {
    fila: txt('', true, 48), pos: num(0), modulos: num(1), tipo: txt('', false, 40), circuito: txt('', false, 48),
  },
};

function limpiarCampo(v, e) {
  switch (e.tipo) {
    case 'n': return typeof v === 'number' && Number.isFinite(v) ? v : (v === null && e.def === null ? null : undefined);
    case 's': return typeof v === 'string' ? v.slice(0, e.max ?? 200) : undefined;
    case 'b': return typeof v === 'boolean' ? v : undefined;
    case 'e': return e.valores.includes(v) ? v : undefined;
    case 'pts':
      return Array.isArray(v) && v.length >= e.min && v.length <= 10000 &&
        v.every((q) => q && Number.isFinite(q.x) && Number.isFinite(q.y))
        ? v.map((q) => ({ x: q.x, y: q.y })) : undefined;
    case 'o': return v && typeof v === 'object' && !Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : undefined;
    default: return undefined;
  }
}

function limpiarObjeto(o, espec) {
  const src = o && typeof o === 'object' ? o : {};
  const r = {};
  for (const [k, e] of Object.entries(espec)) {
    const v = limpiarCampo(src[k], e);
    r[k] = v === undefined ? clonar(e.def) : v;
  }
  return r;
}

function limpiarItem(it, espec) {
  if (!it || typeof it !== 'object') return null;
  const r = { id: typeof it.id === 'string' && /^[\w-]{1,48}$/.test(it.id) ? it.id : null };
  for (const [k, e] of Object.entries(espec)) {
    const v = limpiarCampo(it[k], e);
    if (v === undefined) {
      if (e.req) return null;
      r[k] = clonar(e.def);
    } else r[k] = v;
  }
  return r;
}

// Valida y limpia un proyecto venga de donde venga (archivo, base, migración).
// Devuelve { datos, avisos }. Lanza ErrorFormato si no es utilizable.
export function validarProyecto(entrada, { sistemaViejo = null } = {}) {
  const avisos = [];
  if (!entrada || typeof entrada !== 'object' || Array.isArray(entrada)) {
    throw new ErrorFormato('El contenido no es un proyecto válido.');
  }
  if (entrada.formato !== FORMATO) {
    throw new ErrorFormato(`Formato desconocido (se esperaba "${FORMATO}").`);
  }
  if (typeof entrada.version === 'number' && entrada.version > VERSION_ESQUEMA) {
    throw new ErrorFormato('Este proyecto fue creado con una versión más nueva del programa.');
  }
  if (esCasaVieja(entrada)) {
    const r = desdeCasaVieja(entrada, sistemaViejo);
    entrada = r.datos;
    avisos.push(...r.avisos);
  }

  const p = { formato: FORMATO, version: VERSION_ESQUEMA };
  p.proyecto = limpiarObjeto(entrada.proyecto, ESQ_PROYECTO);
  p.rotulo = limpiarObjeto(entrada.rotulo, ESQ_ROTULO);
  p.papel = limpiarObjeto(entrada.papel, ESQ_PAPEL);
  if (!(p.papel.escala > 0)) p.papel.escala = 50;
  p.tablero = {};

  for (const [ruta, espec] of Object.entries(ESQ)) {
    const origen = ruta.split('.').reduce((a, k) => a?.[k], entrada);
    const lista = Array.isArray(origen) ? origen : [];
    if (lista.length > MAX_OBJETOS) throw new ErrorFormato(`Demasiados elementos en "${ruta}".`);
    const vistos = new Set();
    const salida = [];
    let descartados = 0, renumerados = 0;
    for (const it of lista) {
      const o = limpiarItem(it, espec);
      if (!o) { descartados++; continue; }
      if (!o.id || vistos.has(o.id)) { o.id = nuevoId(ruta.split('.').pop()[0]); renumerados++; }
      vistos.add(o.id);
      salida.push(o);
    }
    if (descartados) avisos.push(`${descartados} elemento(s) inválido(s) descartado(s) en "${ruta}".`);
    if (renumerados) avisos.push(`${renumerados} elemento(s) con id repetido o inválido en "${ruta}" recibieron id nuevo.`);
    if (ruta.startsWith('tablero.')) p.tablero[ruta.slice(8)] = salida; else p[ruta] = salida;
  }

  if (!p.plantas.length) {
    p.plantas.push({ id: nuevoId('p'), nombre: 'Planta baja', cota: 0, alto: 2.6 });
    avisos.push('El proyecto no tenía plantas: se creó "Planta baja".');
  }
  if (!p.capas.length) p.capas = crearProyectoVacio().capas;

  const idsPlanta = new Set(p.plantas.map((x) => x.id));
  const idsCapa = new Set(p.capas.map((x) => x.id));
  const primeraPlanta = p.plantas[0].id;
  const primeraCapa = p.capas[0].id;
  let reasignados = 0;
  for (const col of COLECCIONES_DE_PLANTA) {
    for (const o of p[col]) {
      if (!idsPlanta.has(o.planta)) { o.planta = primeraPlanta; reasignados++; }
      if (!idsCapa.has(o.capa)) o.capa = primeraCapa;
    }
  }
  if (reasignados) avisos.push(`${reasignados} objeto(s) apuntaban a una planta inexistente y pasaron a la primera planta.`);

  const idsMuro = new Set(p.muros.map((m) => m.id));
  const antes = p.aberturas.length;
  p.aberturas = p.aberturas.filter((a) => idsMuro.has(a.muro));
  if (antes !== p.aberturas.length) avisos.push(`${antes - p.aberturas.length} abertura(s) sin muro fueron descartadas.`);

  p.ui = limpiarObjeto(entrada.ui, ESQ_UI);
  if (!idsPlanta.has(p.ui.plantaActiva)) p.ui.plantaActiva = primeraPlanta;

  return { datos: p, avisos };
}
