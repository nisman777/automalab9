import { coleccion, buscar, fijarRuta, leerRuta, clonar } from './modelo.js';

const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function insertar(p, col, obj, indice) {
  const l = coleccion(p, col);
  l.splice(Math.min(indice, l.length), 0, clonar(obj));
}
function eliminar(p, col, id) {
  const l = coleccion(p, col);
  const i = l.findIndex((x) => x.id === id);
  if (i < 0) throw new Error(`No existe ${col}/${id}`);
  l.splice(i, 1);
}

// Aplica una operación hacia adelante (directo) o hacia atrás.
function aplicar(p, op, directo) {
  switch (op.tipo) {
    case 'agregar':
      if (directo) insertar(p, op.col, op.obj, op.indice); else eliminar(p, op.col, op.obj.id);
      break;
    case 'quitar':
      if (directo) eliminar(p, op.col, op.obj.id); else insertar(p, op.col, op.obj, op.indice);
      break;
    case 'modificar': {
      const o = buscar(p, op.col, op.id);
      if (!o) throw new Error(`No existe ${op.col}/${op.id}`);
      const v = directo ? op.despues : op.antes;
      for (const [k, val] of Object.entries(v)) {
        if (val === undefined) delete o[k]; else o[k] = clonar(val);
      }
      break;
    }
    case 'ruta':
      fijarRuta(p, op.ruta, clonar(directo ? op.despues : op.antes));
      break;
    default:
      throw new Error('Operación desconocida: ' + op.tipo);
  }
}

// Deshacer/rehacer por comandos: cada acción guarda solo lo que cambió.
export class Historial {
  constructor(proyecto, { alCambiar = () => {}, limite = 500 } = {}) {
    this.proyecto = proyecto;
    this.alCambiar = alCambiar;
    this.limite = limite;
    this._deshacer = [];
    this._rehacer = [];
    this._activa = false;
  }

  get puedeDeshacer() { return this._deshacer.length > 0; }
  get puedeRehacer() { return this._rehacer.length > 0; }
  get nombreDeshacer() { return this._deshacer.at(-1)?.nombre ?? null; }
  get nombreRehacer() { return this._rehacer.at(-1)?.nombre ?? null; }

  // Agrupa varias operaciones en un solo paso de deshacer.
  // Si algo falla dentro, se revierte todo lo hecho hasta ese momento.
  transaccion(nombre, fn) {
    if (this._activa) throw new Error('No se pueden anidar transacciones.');
    const p = this.proyecto;
    const ops = [];
    const t = {
      agregar: (col, obj) => {
        const o = clonar(obj);
        if (typeof o.id !== 'string') throw new Error('Todo objeto necesita id.');
        const op = { tipo: 'agregar', col, obj: o, indice: coleccion(p, col).length };
        aplicar(p, op, true); ops.push(op);
        return o.id;
      },
      quitar: (col, id) => {
        const l = coleccion(p, col);
        const i = l.findIndex((x) => x.id === id);
        if (i < 0) throw new Error(`No existe ${col}/${id}`);
        const op = { tipo: 'quitar', col, obj: clonar(l[i]), indice: i };
        aplicar(p, op, true); ops.push(op);
      },
      modificar: (col, id, cambios) => {
        const o = buscar(p, col, id);
        if (!o) throw new Error(`No existe ${col}/${id}`);
        const antes = {}, despues = {};
        for (const [k, v] of Object.entries(cambios)) {
          if (!igual(o[k], v)) { antes[k] = o[k]; despues[k] = v; }
        }
        if (!Object.keys(despues).length) return;
        const op = { tipo: 'modificar', col, id, antes: clonar(antes), despues: clonar(despues) };
        aplicar(p, op, true); ops.push(op);
      },
      ruta: (ruta, valor) => {
        const antes = leerRuta(p, ruta);
        if (igual(antes, valor)) return;
        const op = { tipo: 'ruta', ruta, antes: clonar(antes), despues: clonar(valor) };
        aplicar(p, op, true); ops.push(op);
      },
    };

    this._activa = true;
    try {
      fn(t);
    } catch (e) {
      for (let i = ops.length - 1; i >= 0; i--) aplicar(p, ops[i], false);
      throw e;
    } finally {
      this._activa = false;
    }
    if (!ops.length) return false;
    this._deshacer.push({ nombre, ops });
    if (this._deshacer.length > this.limite) this._deshacer.shift();
    this._rehacer.length = 0;
    this.alCambiar({ tipo: 'hacer', nombre });
    return true;
  }

  // Cambios que no van al historial (por ejemplo, la planta activa o la vista).
  cambiarSinHistorial(fn) {
    fn(this.proyecto);
    this.alCambiar({ tipo: 'directo' });
  }

  deshacer() {
    const e = this._deshacer.pop();
    if (!e) return false;
    for (let i = e.ops.length - 1; i >= 0; i--) aplicar(this.proyecto, e.ops[i], false);
    this._rehacer.push(e);
    this.alCambiar({ tipo: 'deshacer', nombre: e.nombre });
    return true;
  }

  rehacer() {
    const e = this._rehacer.pop();
    if (!e) return false;
    for (const op of e.ops) aplicar(this.proyecto, op, true);
    this._deshacer.push(e);
    this.alCambiar({ tipo: 'rehacer', nombre: e.nombre });
    return true;
  }
}