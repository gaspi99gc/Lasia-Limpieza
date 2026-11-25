// Quién hace qué en Documentación mensual (ex Vencimientos). Va en un archivo
// aparte, sin nada más, porque lo importa el middleware: corre en el Edge
// Runtime y Turbopack (el build de Vercel) no deja compilar si el módulo usa
// APIs del navegador, como el BroadcastChannel de vencimientos.js.

// Quiénes ven la lista, el detalle y la nómina (y bajan el Excel).
export const ROLES_VER = ['admin', 'rrhh', 'operaciones', 'jefe_operativo'];
// Quiénes arman la nómina: agregar y sacar personas. Operaciones y la jefa
// operativa son las que saben a quién mandan a cada servicio.
export const ROLES_NOMINA = ['admin', 'rrhh', 'operaciones', 'jefe_operativo'];
// Quiénes gestionan la documentación: crear, editar, "Hecho", "Ya la mandé",
// borrar. Son también los únicos que pueden recibir los avisos al celular.
export const ROLES_GESTION = ['admin', 'rrhh'];
