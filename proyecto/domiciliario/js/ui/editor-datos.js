import { el } from './dom.js';
import { confirmar } from './dialogos.js';
import { nuevoId, objetosDePlanta } from '../core/modelo.js';
import { TEXTO_NORMA, SISTEMAS } from '../config.js';

const redondear = (n) => Math.round(n * 100) / 100;
const NOMBRES_PISO = ['Primer piso', 'Segundo piso', 'Tercer piso', 'Cuarto piso'];

// Panel "Datos": proyecto, rótulo, papel y plantas. Todo pasa por el historial.
export function montarDatos(contenedor, sesion) {
  const hist = () => sesion.historial;
  const proy = () => sesion.historial.proyecto;
  const refrescadores = [];

  function campo(etiqueta, ruta, op = {}) {
    const { tipo = 'text', opciones, min, step, maxLength = 80, vacioNulo = false, requerido = false } = op;
    const entrada = opciones
      ? el('select', {}, opciones.map(([v, t]) => el('option', { value: v }, t)))
      : el('input', { type: tipo, maxLength, min, step });
    const leer = () => ruta.split('.').reduce((o, k) => o[k], proy());
    const mostrar = () => { if (document.activeElement !== entrada) entrada.value = leer() ?? ''; };

    entrada.addEventListener('change', () => {
      let v = entrada.value;
      if (tipo === 'number') {
        v = Number(v);
        if (entrada.value === '' || !Number.isFinite(v) || (min != null && v < min)) { entrada.value = leer(); return; }
      } else if (!opciones) v = v.trim();
      if (requerido && v === '') { entrada.value = leer(); return; }
      if (vacioNulo && v === '') v = null;
      hist().transaccion('Cambiar ' + etiqueta.toLowerCase(), (t) => t.ruta(ruta, v));
    });

    refrescadores.push(mostrar);
    return el('label', { class: 'campo' }, el('span', {}, etiqueta), entrada);
  }

  // ---- Plantas ----
  const cajaPlantas = el('div', { class: 'plantas' });
  const filas = new Map();
  let firma = null;

  function entradaPlanta(id, clave, tipo, extra = {}) {
    const e = el('input', { type: tipo, maxLength: 60, ...extra });
    e.addEventListener('change', () => {
      const pl = proy().plantas.find((x) => x.id === id);
      if (!pl) return;
      const v = tipo === 'number' ? Number(e.value) : e.value.trim();
      const malo = tipo === 'number'
        ? (e.value === '' || !Number.isFinite(v) || (extra.min != null && v < extra.min))
        : v === '';
      if (malo) { e.value = pl[clave]; return; }
      hist().transaccion('Cambiar planta', (t) => t.modificar('plantas', id, { [clave]: v }));
    });
    return e;
  }

  function reconstruirPlantas() {
    filas.clear();
    const unica = proy().plantas.length === 1;
    cajaPlantas.replaceChildren(
      el('div', { class: 'planta cab' }, el('span', {}, 'Nombre'), el('span', {}, 'Cota (m)'), el('span', {}, 'Alto (m)'), el('span')),
      ...proy().plantas.map((pl) => {
        const f = {
          nombre: entradaPlanta(pl.id, 'nombre', 'text'),
          cota: entradaPlanta(pl.id, 'cota', 'number', { step: 0.01 }),
          alto: entradaPlanta(pl.id, 'alto', 'number', { step: 0.01, min: 0.5 }),
        };
        filas.set(pl.id, f);
        return el('div', { class: 'planta' }, f.nombre, f.cota, f.alto,
          el('button', {
            type: 'button', class: 'btn peligro', disabled: unica,
            title: unica ? 'Tiene que quedar al menos una planta' : 'Eliminar planta',
            onclick: () => eliminarPlanta(pl.id),
          }, 'Eliminar'));
      }));
  }

  function mostrarPlantas() {
    const f = proy().plantas.map((x) => x.id).join();
    if (f !== firma) { firma = f; reconstruirPlantas(); }
    for (const pl of proy().plantas) {
      const fila = filas.get(pl.id);
      for (const k of ['nombre', 'cota', 'alto']) if (document.activeElement !== fila[k]) fila[k].value = pl[k];
    }
  }

  function agregarPlanta() {
    const pls = proy().plantas;
    const u = pls[pls.length - 1];
    const nombre = NOMBRES_PISO[pls.length - 1] ?? 'Piso ' + pls.length;
    hist().transaccion('Agregar planta', (t) =>
      t.agregar('plantas', { id: nuevoId('p'), nombre, cota: redondear(u.cota + u.alto), alto: u.alto }));
  }

  async function eliminarPlanta(id) {
    const pl = proy().plantas.find((x) => x.id === id);
    if (!pl || proy().plantas.length < 2) return;
    const objetos = objetosDePlanta(proy(), id);
    if (objetos.length) {
      const ok = await confirmar({
        titulo: 'Eliminar planta',
        mensaje: `"${pl.nombre}" tiene ${objetos.length} objeto(s). Se eliminan junto con la planta (se puede deshacer con Ctrl+Z).`,
        textoOk: 'Eliminar', peligro: true,
      });
      if (!ok) return;
    }
    const otra = proy().plantas.find((x) => x.id !== id).id;
    hist().transaccion('Eliminar planta', (t) => {
      for (const o of objetos) t.quitar(o.col, o.id);
      t.quitar('plantas', id);
      if (proy().ui.plantaActiva === id) t.ruta('ui.plantaActiva', otra);
    });
  }

  // ---- Armado ----
  contenedor.replaceChildren(
    el('div', { class: 'rejilla' },
      el('fieldset', { class: 'grupo' }, el('legend', {}, 'Proyecto'),
        campo('Nombre', 'proyecto.nombre', { requerido: true }),
        campo('Sistema', 'proyecto.sistema', { opciones: SISTEMAS }),
        campo('Tipo de local', 'proyecto.tipoLocal', {
          opciones: [['vivienda', 'Vivienda'], ['oficina', 'Oficina o local comercial'], ['deposito', 'Depósito'], ['otro', 'Otro local']],
        }),
        campo('Grado de electrificación', 'proyecto.gradoManual', {
          vacioNulo: true,
          opciones: [['', 'Automático (según superficie)'], ['minimo', 'Mínimo'], ['medio', 'Medio'], ['elevado', 'Elevado'], ['superior', 'Superior']],
        }),
        el('p', { class: 'nota' }, 'La superficie y el grado automático se calculan desde los locales (entrega 2).')),

      el('fieldset', { class: 'grupo' }, el('legend', {}, 'Rótulo'),
        campo('Propietario', 'rotulo.propietario'),
        campo('Ubicación', 'rotulo.ubicacion', { maxLength: 120 }),
        campo('Autor', 'rotulo.autor'),
        campo('Fecha', 'rotulo.fecha', { tipo: 'date' }),
        campo('Revisión', 'rotulo.revision', { maxLength: 10 }),
        campo('Profesional matriculado', 'rotulo.profesional'),
        campo('Matrícula', 'rotulo.matricula', { maxLength: 40 }),
        el('p', { class: 'nota' }, 'Los datos del profesional los completa quien corresponda.')),

      el('fieldset', { class: 'grupo' }, el('legend', {}, 'Papel y escala'),
        campo('Tamaño de papel', 'papel.tamano', { opciones: [['A4', 'A4'], ['A3', 'A3'], ['A2', 'A2'], ['A1', 'A1']] }),
        campo('Escala (1 : N)', 'papel.escala', { tipo: 'number', min: 1, step: 1 }),
        el('p', { class: 'nota' }, TEXTO_NORMA)),

      el('fieldset', { class: 'grupo' }, el('legend', {}, 'Plantas'),
        cajaPlantas,
        el('button', { type: 'button', class: 'btn', onclick: agregarPlanta }, '+ Agregar planta'),
        el('p', { class: 'nota' }, 'Cota y alto se usan después para el largo real de las bajadas de cable. Alto inicial 2,60 m: valor típico, editable.'))));

  const api = { refrescar() { refrescadores.forEach((f) => f()); mostrarPlantas(); } };
  api.refrescar();
  return api;
}