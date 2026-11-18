// Constantes globales: un solo lugar para versión y textos fijos.
export const VERSION_APP = '0.1.0';
export const FORMATO = 'automalab-casa';
export const VERSION_ESQUEMA = 2;
export const NOMBRE_DB = 'automalab-domiciliario';
export const CLAVE_CASA_VIEJA = 'automalab_dom_casa';
export const CLAVE_SISTEMA_VIEJO = 'automalab_dom_sistema';
export const TEXTO_NORMA =
  'Verificación según AEA 90364-7-771 Ed. 2006. No reemplaza el criterio de un profesional matriculado.';

// Sistemas de alimentación: el primer valor es el que se guarda, el segundo lo que se ve.
export const SISTEMAS = [
  ['mono', 'Monofásico 220 V'],
  ['tri', 'Trifásico 3×380/220 V'],
];