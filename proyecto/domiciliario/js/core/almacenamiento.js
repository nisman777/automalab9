import { NOMBRE_DB, CLAVE_CASA_VIEJA, CLAVE_SISTEMA_VIEJO, VERSION_APP } from '../config.js';
import { crearProyectoVacio, nuevoId, clonar } from './modelo.js';
import { validarProyecto, ErrorFormato } from './esquema.js';

// Todo el guardado está en este archivo. Si algún día hay Electron,
// se cambia solo esto y el resto del programa no se entera.

const MAX_ARCHIVO = 20 * 1024 * 1024;
const COLS_OBJETOS = ['lineas', 'muros', 'aberturas', 'locales', 'bocas', 'canalizaciones'];
let _db = null;

function conCodigo(codigo, mensaje) {
  const e = new Error(mensaje);
  e.codigo = codigo;
  return e;
}

function abrirDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    if (!('indexedDB' in window)) return rej(conCodigo('SIN_IDB', 'Este navegador no ofrece IndexedDB.'));
    const rq = indexedDB.open(NOMBRE_DB, 1);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains('proyectos')) {
        db.createObjectStore('proyectos', { keyPath: 'id' }).createIndex('modificado', 'modificado');
      }
      if (!db.objectStoreNames.contains('ajustes')) db.createObjectStore('ajustes', { keyPath: 'clave' });
    };
    rq.onsuccess = () => {
      _db = rq.result;
      _db.onversionchange = () => { _db.close(); _db = null; };
      res(_db);
    };
    rq.onerror = () => rej(rq.error);
    rq.onblocked = () => rej(conCodigo('BLOQUEADA', 'La base está bloqueada por otra pestaña.'));
  });
}

const pedir = (rq) => new Promise((res, rej) => {
  rq.onsuccess = () => res(rq.result);
  rq.onerror = () => rej(rq.error);
});

async function transaccion(stores, modo, fn) {
  const db = await abrirDB();
  return new Promise((res, rej) => {
    const t = db.transaction(stores, modo);
    let resultado;
    t.oncomplete = () => res(resultado);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Transacción cancelada.'));
    Promise.resolve(fn(t))
      .then((r) => { resultado = r; })
      .catch((e) => { try { t.abort(); } catch { /* ya cerrada */ } rej(e); });
  });
}

const leerAjuste = (clave) =>
  transaccion('ajustes', 'readonly', async (t) => (await pedir(t.objectStore('ajustes').get(clave)))?.valor);
const guardarAjuste = (clave, valor) =>
  transaccion('ajustes', 'readwrite', (t) => pedir(t.objectStore('ajustes').put({ clave, valor })));

const meta = (r) => ({
  id: r.id, nombre: r.nombre, creado: r.creado, modificado: r.modificado, rev: r.rev,
  sistema: r.datos?.proyecto?.sistema ?? null,
  plantas: r.datos?.plantas?.length ?? 0,
  objetos: COLS_OBJETOS.reduce((n, c) => n + (r.datos?.[c]?.length ?? 0), 0),
});

async function insertar(datos) {
  const ahora = Date.now();
  const rec = { id: nuevoId('proy'), nombre: datos.proyecto.nombre, creado: ahora, modificado: ahora, rev: 1, datos };
  await transaccion('proyectos', 'readwrite', (t) => pedir(t.objectStore('proyectos').add(rec)));
  return meta(rec);
}

async function leerRegistro(id) {
  const rec = await transaccion('proyectos', 'readonly', (t) => pedir(t.objectStore('proyectos').get(id)));
  if (!rec) throw conCodigo('NO_EXISTE', 'El proyecto no existe (¿se borró desde otra pestaña?).');
  return rec;
}

// Importa la casa del plano.js anterior (localStorage) una sola vez.
// No borra el dato viejo.
async function migrarCasaVieja() {
  if (await leerAjuste('migracion-casa-v1')) return null;
  let crudo = null, sistema = null;
  try {
    crudo = localStorage.getItem(CLAVE_CASA_VIEJA);
    sistema = localStorage.getItem(CLAVE_SISTEMA_VIEJO);
  } catch { return null; }
  if (!crudo) { await guardarAjuste('migracion-casa-v1', true); return null; }
  try {
    const { datos, avisos } = validarProyecto(JSON.parse(crudo), { sistemaViejo: sistema });
    const m = await insertar(datos);
    await guardarAjuste('migracion-casa-v1', true);
    return { meta: m, avisos };
  } catch (e) {
    await guardarAjuste('migracion-casa-v1', true); // no insistir en cada arranque
    return { error: e.message };
  }
}

function nombreArchivo(nombre) {
  const d = new Date();
  const dd = (n) => String(n).padStart(2, '0');
  const base = nombre.replace(/[^\wáéíóúüñÁÉÍÓÚÜÑ -]+/g, '_').trim().slice(0, 60) || 'proyecto';
  return `${base}-${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())}.json`;
}

export const almacenamiento = {
  async iniciar() {
    await abrirDB();
    const migracion = await migrarCasaVieja().catch((e) => ({ error: e.message }));
    return { migracion };
  },

  // Se llama después de una acción del usuario (Firefox pregunta; Chrome decide solo).
  async pedirPersistencia() {
    try {
      if (!navigator.storage?.persist) return false;
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    } catch { return false; }
  },

  async estado() {
    const r = { persistente: false, usado: null, cuota: null };
    try {
      r.persistente = (await navigator.storage?.persisted?.()) ?? false;
      const e = await navigator.storage?.estimate?.();
      r.usado = e?.usage ?? null;
      r.cuota = e?.quota ?? null;
    } catch { /* sin datos */ }
    return r;
  },

  async listar() {
    const recs = await transaccion('proyectos', 'readonly', (t) => pedir(t.objectStore('proyectos').getAll()));
    return recs.map(meta).sort((a, b) => b.modificado - a.modificado);
  },

  crear(nombre) { return insertar(crearProyectoVacio(nombre)); },

  async abrir(id) {
    const rec = await leerRegistro(id);
    const { datos, avisos } = validarProyecto(rec.datos);
    return { meta: meta({ ...rec, datos }), datos, avisos, rev: rec.rev };
  },

  // Guarda solo si nadie más lo modificó desde que lo abrimos (revEsperada).
  async guardar(id, datos, revEsperada) {
    return transaccion('proyectos', 'readwrite', async (t) => {
      const s = t.objectStore('proyectos');
      const rec = await pedir(s.get(id));
      if (!rec) throw conCodigo('NO_EXISTE', 'El proyecto fue borrado desde otra pestaña.');
      if (rec.rev !== revEsperada) throw conCodigo('CONFLICTO', 'El proyecto se modificó en otra pestaña o ventana.');
      rec.datos = datos;
      rec.nombre = datos.proyecto.nombre;
      rec.modificado = Date.now();
      rec.rev += 1;
      await pedir(s.put(rec));
      return { rev: rec.rev, modificado: rec.modificado };
    });
  },

  async renombrar(id, nombre) {
    return transaccion('proyectos', 'readwrite', async (t) => {
      const s = t.objectStore('proyectos');
      const rec = await pedir(s.get(id));
      if (!rec) throw conCodigo('NO_EXISTE', 'El proyecto no existe.');
      rec.nombre = nombre;
      rec.datos.proyecto.nombre = nombre;
      rec.modificado = Date.now();
      rec.rev += 1;
      await pedir(s.put(rec));
    });
  },

  async duplicar(id, nombre) {
    const rec = await leerRegistro(id);
    const { datos } = validarProyecto(rec.datos);
    const copia = clonar(datos);
    copia.proyecto.nombre = nombre;
    return insertar(copia);
  },

  async borrar(id) {
    await transaccion('proyectos', 'readwrite', (t) => pedir(t.objectStore('proyectos').delete(id)));
  },

  exportarJSON(datos) {
    const salida = { ...datos, exportado: new Date().toISOString(), app: VERSION_APP };
    const blob = new Blob([JSON.stringify(salida, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo(datos.proyecto.nombre);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },

  async importarArchivo(archivo) {
    if (archivo.size > MAX_ARCHIVO) throw new ErrorFormato('El archivo es demasiado grande (máximo 20 MB).');
    let crudo;
    try { crudo = JSON.parse(await archivo.text()); }
    catch { throw new ErrorFormato('El archivo no es un JSON válido.'); }
    const { datos, avisos } = validarProyecto(crudo);
    return { meta: await insertar(datos), avisos };
  },
};

// Guarda solo, ~1 s después del último cambio. Detecta conflictos entre pestañas.
export class Autoguardado {
  constructor({ id, rev, datos, alEstado = () => {}, alConflicto = () => {}, retardo = 1000 }) {
    this.id = id;
    this.rev = rev;
    this.retardo = retardo;
    this._datos = datos;
    this._estado = alEstado;
    this._conflicto = alConflicto;
    this._sucio = false;
    this._enCurso = null;
    this._t = null;
    this._detenido = false;
  }

  get pendiente() { return this._sucio || this._enCurso !== null; }

  marcarCambio() {
    if (this._detenido) return;
    this._sucio = true;
    this._estado('pendiente');
    clearTimeout(this._t);
    this._t = setTimeout(() => this.guardarYa(), this.retardo);
  }

  async guardarYa() {
    clearTimeout(this._t);
    if (this._detenido) return;
    if (this._enCurso) await this._enCurso;
    if (!this._sucio || this._detenido) return;
    this._sucio = false;
    this._enCurso = this._escribir();
    try { await this._enCurso; } finally { this._enCurso = null; }
  }

  async _escribir() {
    try {
      const r = await almacenamiento.guardar(this.id, this._datos(), this.rev);
      this.rev = r.rev;
      this._estado(this._sucio ? 'pendiente' : 'guardado');
    } catch (e) {
      this._sucio = true;
      if (e.codigo === 'CONFLICTO' || e.codigo === 'NO_EXISTE') {
        this._detenido = true;
        this._conflicto(e);
      } else {
        this._estado('error', e);
      }
    }
  }

  detener() {
    this._detenido = true;
    clearTimeout(this._t);
  }
}