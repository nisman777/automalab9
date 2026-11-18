import { VERSION_APP, TEXTO_NORMA } from './config.js';
import { almacenamiento, Autoguardado } from './core/almacenamiento.js';
import { Historial } from './core/historial.js';
import { crearPantallaProyectos } from './ui/proyectos.js';
import { montarDatos } from './ui/editor-datos.js';
import { avisar, toast, confirmar } from './ui/dialogos.js';
import { el } from './ui/dom.js';

const $ = (id) => document.getElementById(id);
const TEXTOS_ESTADO = { guardado: 'Guardado', pendiente: 'Guardando…', error: 'Error al guardar' };

let sesion = null;          // { id, historial, auto }
let pantallaProyectos = null;
let panelDatos = null;

const mostrarError = (e) => avisar({ titulo: 'Error', mensaje: e?.message ?? String(e) });

function mostrar(vista) {
  $('vista-proyectos').hidden = vista !== 'proyectos';
  $('vista-editor').hidden = vista !== 'editor';
}

function pintarEstado(estado) {
  const e = $('ed-estado');
  e.textContent = TEXTOS_ESTADO[estado] ?? '';
  e.className = 'estado ' + estado;
}

async function actualizarEstadoAlmacenamiento() {
  const s = await almacenamiento.estado();
  const mb = (n) => (n / 1048576).toFixed(1);
  $('estado-almacenamiento').textContent =
    'Almacenamiento: ' + (s.persistente ? 'persistente' : 'no garantizado (exportá .json)') +
    (s.usado != null ? ` · ${mb(s.usado)} MB usados` : '');
}

function refrescarEditor() {
  if (!sesion) return;
  const h = sesion.historial;
  $('ed-nombre').textContent = h.proyecto.proyecto.nombre;
  const des = $('btn-deshacer'), reh = $('btn-rehacer');
  des.disabled = !h.puedeDeshacer;
  reh.disabled = !h.puedeRehacer;
  des.title = h.puedeDeshacer ? 'Deshacer: ' + h.nombreDeshacer + ' (Ctrl+Z)' : 'Nada para deshacer';
  reh.title = h.puedeRehacer ? 'Rehacer: ' + h.nombreRehacer + ' (Ctrl+Y)' : 'Nada para rehacer';
  panelDatos?.refrescar();
}

async function abrirProyecto(id) {
  if (sesion) await cerrarProyecto();
  const r = await almacenamiento.abrir(id);

  const historial = new Historial(r.datos, {
    alCambiar: () => { sesion?.auto.marcarCambio(); refrescarEditor(); },
  });
  const auto = new Autoguardado({
    id, rev: r.rev, datos: () => historial.proyecto, alEstado: pintarEstado,
    alConflicto: (e) => {
      pintarEstado('error');
      avisar({
        titulo: 'Conflicto al guardar',
        mensaje: [e.message, 'Tus últimos cambios NO se guardaron. Usá "Exportar .json" para conservar tu versión.'],
      });
    },
  });
  sesion = { id, historial, auto };

  panelDatos = montarDatos($('panel-datos'), sesion);
  pintarEstado('guardado');
  refrescarEditor();
  mostrar('editor');

  almacenamiento.pedirPersistencia().then(actualizarEstadoAlmacenamiento);
  if (r.avisos.length) avisar({ titulo: 'El proyecto se corrigió al abrirlo', mensaje: r.avisos });
}

async function cerrarProyecto() {
  if (!sesion) return;
  const s = sesion;
  await s.auto.guardarYa();
  if (s.auto.pendiente) {
    const salir = await confirmar({
      titulo: 'Cambios sin guardar',
      mensaje: ['No se pudieron guardar los últimos cambios.', 'Si salís ahora se pierden. Podés cancelar y usar "Exportar .json".'],
      textoOk: 'Salir sin guardar', peligro: true,
    });
    if (!salir) return;
  }
  s.auto.detener();
  sesion = null;
  panelDatos = null;
  mostrar('proyectos');
  await pantallaProyectos.refrescar();
  actualizarEstadoAlmacenamiento();
}

async function guardarAhora() {
  if (!sesion) return;
  await sesion.auto.guardarYa();
  if (!sesion.auto.pendiente) toast('Proyecto guardado.', 'ok', 1500);
}

function informarMigracion(m) {
  if (m.error) {
    avisar({ titulo: 'No pude importar tu casa anterior', mensaje: [m.error, 'El dato viejo sigue intacto en el navegador.'] });
  } else {
    toast('Tu casa anterior se importó como un proyecto nuevo.', 'ok', 6000);
    if (m.avisos?.length) avisar({ titulo: 'Importación de la casa anterior', mensaje: m.avisos });
  }
}

async function arrancar() {
  $('texto-norma').textContent = TEXTO_NORMA;
  $('version').textContent = 'v' + VERSION_APP;

  let inicio;
  try {
    inicio = await almacenamiento.iniciar();
  } catch (e) {
    $('vista-proyectos').replaceChildren(el('div', { class: 'falla' },
      el('h3', {}, 'No se pudo abrir el almacenamiento del navegador'),
      el('p', {}, e.message || String(e)),
      el('p', {}, 'Probá fuera de la ventana privada o revisá que el navegador permita guardar datos del sitio.')));
    return;
  }

  pantallaProyectos = crearPantallaProyectos($('vista-proyectos'), { alAbrir: abrirProyecto });
  mostrar('proyectos');
  await pantallaProyectos.refrescar();
  if (inicio.migracion) informarMigracion(inicio.migracion);
  actualizarEstadoAlmacenamiento();

  $('btn-volver').onclick = () => cerrarProyecto().catch(mostrarError);
  $('btn-deshacer').onclick = () => sesion?.historial.deshacer();
  $('btn-rehacer').onclick = () => sesion?.historial.rehacer();
  $('btn-guardar').onclick = () => guardarAhora().catch(mostrarError);
  $('btn-exportar').onclick = () => { if (sesion) almacenamiento.exportarJSON(sesion.historial.proyecto); };
}

document.addEventListener('keydown', (e) => {
  if (!sesion || !(e.ctrlKey || e.metaKey)) return;
  if (document.querySelector('dialog[open]')) return;
  const k = e.key.toLowerCase();
  const escribiendo = e.target.matches?.('textarea, input:not([type=checkbox]):not([type=button])');
  if (k === 's') { e.preventDefault(); guardarAhora().catch(mostrarError); }
  else if (!escribiendo && k === 'z' && !e.shiftKey) { e.preventDefault(); sesion.historial.deshacer(); }
  else if (!escribiendo && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); sesion.historial.rehacer(); }
});

window.addEventListener('beforeunload', (e) => {
  if (sesion?.auto.pendiente) {
    sesion.auto.guardarYa();
    e.preventDefault();
    e.returnValue = '';
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') sesion?.auto.guardarYa();
});
window.addEventListener('unhandledrejection', (ev) => mostrarError(ev.reason));

arrancar();