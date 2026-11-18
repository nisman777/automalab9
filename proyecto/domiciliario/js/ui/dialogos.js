import { el } from './dom.js';

// Único lugar de diálogos. Nada de prompt()/confirm()/alert() sueltos en el código.

const parrafos = (m) => [].concat(m).map((t) => el('p', {}, t));

function crear(titulo, ...contenido) {
  const d = el('dialog', { class: 'dlg' }, el('h3', {}, titulo), ...contenido);
  document.body.append(d);
  return d;
}
function cerrar(d) { d.close(); d.remove(); }

export function pedirTexto({ titulo, etiqueta = '', valor = '', textoOk = 'Aceptar', max = 80, validar } = {}) {
  return new Promise((resolver) => {
    const entrada = el('input', { type: 'text', value: valor, maxLength: max });
    const error = el('div', { class: 'dlg-error', role: 'alert' });
    const form = el('form', { class: 'dlg-cuerpo' },
      etiqueta ? el('label', {}, etiqueta) : null,
      entrada, error,
      el('div', { class: 'dlg-botones' },
        el('button', { type: 'button', class: 'btn', onclick: () => fin(null) }, 'Cancelar'),
        el('button', { type: 'submit', class: 'btn primario' }, textoOk)));
    const d = crear(titulo, form);
    const fin = (r) => { cerrar(d); resolver(r); };
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = entrada.value.trim();
      const err = validar ? validar(v) : (v ? null : 'No puede estar vacío.');
      if (err) { error.textContent = err; return; }
      fin(v);
    });
    d.addEventListener('cancel', (e) => { e.preventDefault(); fin(null); });
    d.showModal();
    entrada.select();
  });
}

export function confirmar({ titulo, mensaje, textoOk = 'Aceptar', peligro = false }) {
  return new Promise((resolver) => {
    const ok = el('button', { type: 'button', class: 'btn ' + (peligro ? 'peligro' : 'primario'), onclick: () => fin(true) }, textoOk);
    const no = el('button', { type: 'button', class: 'btn', onclick: () => fin(false) }, 'Cancelar');
    const d = crear(titulo, el('div', { class: 'dlg-cuerpo' }, parrafos(mensaje),
      el('div', { class: 'dlg-botones' }, no, ok)));
    const fin = (r) => { cerrar(d); resolver(r); };
    d.addEventListener('cancel', (e) => { e.preventDefault(); fin(false); });
    d.showModal();
    (peligro ? no : ok).focus();
  });
}

export function avisar({ titulo = 'Aviso', mensaje }) {
  return new Promise((resolver) => {
    const ok = el('button', { type: 'button', class: 'btn primario', onclick: () => fin() }, 'Entendido');
    const d = crear(titulo, el('div', { class: 'dlg-cuerpo' }, parrafos(mensaje),
      el('div', { class: 'dlg-botones' }, ok)));
    const fin = () => { cerrar(d); resolver(); };
    d.addEventListener('cancel', (e) => { e.preventDefault(); fin(); });
    d.showModal();
    ok.focus();
  });
}

export function toast(mensaje, tipo = 'info', ms = 4000) {
  let cont = document.getElementById('toasts');
  if (!cont) { cont = el('div', { id: 'toasts' }); document.body.append(cont); }
  const t = el('div', { class: 'toast ' + tipo, role: 'status' }, mensaje);
  cont.append(t);
  setTimeout(() => t.remove(), ms);
}