import { el } from './dom.js';
import { almacenamiento } from '../core/almacenamiento.js';
import { pedirTexto, confirmar, avisar, toast } from './dialogos.js';
import { SISTEMAS } from '../config.js';

const fmtFecha = (ms) => new Date(ms).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
const nombreSistema = (s) => SISTEMAS.find(([v]) => v === s)?.[1] ?? '—';

export function crearPantallaProyectos(contenedor, { alAbrir }) {
  let todos = [];
  const lista = el('div', { class: 'proy-lista' });
  const archivo = el('input', { type: 'file', accept: '.json,application/json', hidden: true });
  const busqueda = el('input', { type: 'search', placeholder: 'Buscar proyecto…', hidden: true });
  busqueda.addEventListener('input', () => pintar());

  const seguro = (fn) => async (...args) => {
    try { await fn(...args); }
    catch (e) { await avisar({ titulo: 'No se pudo completar la acción', mensaje: e.message || String(e) }); }
  };

  const nuevo = seguro(async () => {
    const nombre = await pedirTexto({ titulo: 'Nuevo proyecto', etiqueta: 'Nombre del proyecto', valor: 'Proyecto nuevo', textoOk: 'Crear' });
    if (!nombre) return;
    const m = await almacenamiento.crear(nombre);
    await alAbrir(m.id);
  });

  const abrir = seguro((id) => alAbrir(id));

  const duplicar = seguro(async (m) => {
    const nombre = await pedirTexto({ titulo: 'Duplicar proyecto', etiqueta: 'Nombre de la copia', valor: `${m.nombre} (copia)`, textoOk: 'Duplicar' });
    if (!nombre) return;
    await almacenamiento.duplicar(m.id, nombre);
    await refrescar();
  });

  const renombrar = seguro(async (m) => {
    const nombre = await pedirTexto({ titulo: 'Renombrar proyecto', etiqueta: 'Nuevo nombre', valor: m.nombre, textoOk: 'Renombrar' });
    if (!nombre) return;
    await almacenamiento.renombrar(m.id, nombre);
    await refrescar();
  });

  const exportar = seguro(async (m) => {
    const { datos } = await almacenamiento.abrir(m.id);
    almacenamiento.exportarJSON(datos);
  });

  const borrar = seguro(async (m) => {
    const ok = await confirmar({
      titulo: 'Borrar proyecto',
      mensaje: [`¿Borrar "${m.nombre}"?`, 'No se puede deshacer. Si no tenés una copia .json, se pierde.'],
      textoOk: 'Borrar', peligro: true,
    });
    if (!ok) return;
    await almacenamiento.borrar(m.id);
    await refrescar();
  });

  archivo.addEventListener('change', seguro(async () => {
    const f = archivo.files[0];
    archivo.value = '';
    if (!f) return;
    const { meta, avisos } = await almacenamiento.importarArchivo(f);
    await refrescar();
    if (avisos.length) await avisar({ titulo: `Se importó "${meta.nombre}"`, mensaje: avisos });
    else toast(`Se importó "${meta.nombre}".`, 'ok');
  }));

  function tarjeta(m) {
    return el('div', { class: 'proy', ondblclick: () => abrir(m.id) },
      el('div', { class: 'proy-info' },
        el('div', { class: 'proy-nombre' }, m.nombre),
        el('div', { class: 'proy-meta' },
          el('div', {}, `Modificado: ${fmtFecha(m.modificado)}`),
          el('div', {}, `${nombreSistema(m.sistema)} · ${m.plantas} planta(s) · ${m.objetos} objeto(s)`))),
      el('div', { class: 'proy-acciones' },
        el('button', { type: 'button', class: 'btn primario', onclick: () => abrir(m.id) }, 'Abrir'),
        el('button', { type: 'button', class: 'btn', onclick: () => duplicar(m) }, 'Duplicar'),
        el('button', { type: 'button', class: 'btn', onclick: () => renombrar(m) }, 'Renombrar'),
        el('button', { type: 'button', class: 'btn', onclick: () => exportar(m) }, 'Exportar .json'),
        el('button', { type: 'button', class: 'btn peligro', onclick: () => borrar(m) }, 'Borrar')));
  }

  function pintar() {
    const q = busqueda.value.trim().toLowerCase();
    const visibles = todos.filter((m) => m.nombre.toLowerCase().includes(q));
    busqueda.hidden = todos.length < 4;
    if (!todos.length) {
      lista.replaceChildren(el('p', { class: 'vacio' },
        'Todavía no hay proyectos. Creá uno nuevo o importá un archivo .json.'));
    } else if (!visibles.length) {
      lista.replaceChildren(el('p', { class: 'vacio' }, 'Ningún proyecto coincide con la búsqueda.'));
    } else {
      lista.replaceChildren(...visibles.map(tarjeta));
    }
  }

  async function refrescar() {
    todos = await almacenamiento.listar();
    pintar();
  }

  contenedor.replaceChildren(
    el('div', { class: 'proy-cab' },
      el('a', { class: 'btn', href: '../index.html', title: 'Volver a la portada' }, '← Inicio'),
      el('span', { class: 'espacio' }),
      el('button', { type: 'button', class: 'btn', onclick: () => archivo.click() }, 'Importar .json'),
      el('button', { type: 'button', class: 'btn primario', onclick: nuevo }, '+ Nuevo proyecto')),
    el('div', { class: 'proy-titulo' },
      el('h1', {}, 'Instalaciones domiciliarias'),
      el('p', {}, 'Planos, circuitos y tableros según AEA 90364-7-771. Elegí un proyecto o creá uno nuevo.')),
    busqueda,
    lista,
    el('p', { class: 'nota' },
      'Los proyectos se guardan en este navegador. Exportá un archivo .json como respaldo.'),
    archivo);

  return { refrescar };
}