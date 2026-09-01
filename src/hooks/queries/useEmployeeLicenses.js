'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

// La clave raiz permite invalidar de una las licencias de todos los empleados
// desde cualquier pantalla que cree, edite o borre una (la vista general, el
// Gantt, la importacion por Excel). Sin eso el legajo servia la copia cacheada
// y la licencia recien cargada tardaba en aparecer.
export const licensesRootKey = ['licenses'];
export const employeeLicensesKey = (employeeId) => ['licenses', { employee_id: employeeId }];

export function useEmployeeLicenses(employeeId) {
  return useQuery({
    queryKey: employeeLicensesKey(employeeId),
    queryFn: () => apiFetch(`/api/licenses?employee_id=${employeeId}`),
    enabled: !!employeeId,
  });
}
