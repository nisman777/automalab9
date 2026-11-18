import { FORMATO, VERSION_ESQUEMA } from '../config.js';

// Listas de objetos que viven dentro del proyecto (la ruta usa puntos).
export const COLECCIONES = [
  'plantas', 'capas', 'lineas', 'muros', 'aberturas', 'locales',
  'bocas', 'canalizaciones', 'circuitos', 'tablero.filas', 'tablero.dispositivos',
];
// Las que pertenecen a una planta (tienen campo "planta" y "capa").
export const COLECCIONES_DE_PLANTA = ['lineas', 'muros', 'aberturas', 'locales', 'bocas', 'canalizaciones'];

const PROHIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);

export const clonar = (v) => structuredClone(v);

export function nuevoId(prefijo = 'o') {
  return prefijo + '_' + Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
}

function claves(ruta) {
  const ks = ruta.split('.');
  if (ks.some((k) => PROHIBIDAS.has(k))) throw new Error('Ruta no permitida: ' + ruta);
  return ks;
}

export function leerRuta(p, ruta) {
  return claves(ruta).reduce((o, k) => o?.[k], p);
}

export function fijarRuta(p, ruta, valor) {
  const ks = claves(ruta);
  const ultimo = ks.pop();
  let o = p;
  for (const k of ks) {
    o = o?.[k];
    if (o == null || typeof o !== 'object') throw new Error('Ruta inexistente: ' + ruta);
  }
  if (valor === undefined) delete o[ultimo]; else o[ultimo] = valor;
}

export function coleccion(p, ruta) {
  const l = leerRuta(p, ruta);
  if (!Array.isArray(l)) throw new Error('Colección inexistente: ' + ruta);
  return l;
}

export const buscar = (p, ruta, id) => coleccion(p, ruta).find((x) => x.id === id) ?? null;

export function objetosDePlanta(p, idPlanta) {
  const r = [];
  for (const col of COLECCIONES_DE_PLANTA) {
    for (const o of p[col]) if (o.planta === idPlanta) r.push({ col, id: o.id });
  }
  return r;
}

export const CAPAS_INICIALES = [
  { id: 'dibujo',         nombre: 'Dibujo',         color: '#ffffff' },
  { id: 'muros',          nombre: 'Muros',          color: '#e6e6e6' },
  { id: 'aberturas',      nombre: 'Aberturas',      color: '#00e5ff' },
  { id: 'locales',        nombre: 'Locales',        color: '#5fd35f' },
  { id: 'cotas',          nombre: 'Cotas',          color: '#ffd400' },
  { id: 'electrico',      nombre: 'Eléctrico',      color: '#ff5555' },
  { id: 'canalizaciones', nombre: 'Canalizaciones', color: '#ff9f1c' },
];

function hoyISO() {
  const d = new Date();
  const dd = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}`;
}

export function crearProyectoVacio(nombre = 'Proyecto nuevo') {
  const idPlanta = nuevoId('p');
  return {
    formato: FORMATO,
    version: VERSION_ESQUEMA,
    proyecto: { nombre, sistema: 'mono', tipoLocal: 'vivienda', gradoManual: null },
    rotulo: { propietario: '', ubicacion: '', autor: '', fecha: hoyISO(), revision: '0', profesional: '', matricula: '' },
    papel: { tamano: 'A3', escala: 50 },
    ui: { plantaActiva: idPlanta },
    plantas: [{ id: idPlanta, nombre: 'Planta baja', cota: 0, alto: 2.6 }],
    capas: CAPAS_INICIALES.map((c) => ({ ...c, visible: true, bloqueada: false })),
    lineas: [], muros: [], aberturas: [], locales: [], bocas: [], canalizaciones: [], circuitos: [],
    tablero: { filas: [], dispositivos: [] },
  };
}