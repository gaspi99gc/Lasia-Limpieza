'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

// Informes del legajo (sanciones, suspensiones, advertencias, cambios de
// servicio). La clave raiz permite invalidar de una todos los informes desde
// cualquier pantalla que cree o borre uno, para que el legajo no muestre una
// lista vieja.
export const employeeReportsRootKey = ['employee-reports'];
export const employeeReportsKey = (employeeId) => ['employee-reports', { empleado_id: employeeId }];

export function useEmployeeReports(employeeId) {
  return useQuery({
    queryKey: employeeReportsKey(employeeId),
    queryFn: () => apiFetch(`/api/employee-reports?empleado_id=${employeeId}`),
    enabled: !!employeeId,
  });
}
