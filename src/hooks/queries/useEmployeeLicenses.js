'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export const employeeLicensesKey = (employeeId) => ['licenses', { employee_id: employeeId }];

export function useEmployeeLicenses(employeeId) {
  return useQuery({
    queryKey: employeeLicensesKey(employeeId),
    queryFn: () => apiFetch(`/api/licenses?employee_id=${employeeId}`),
    enabled: !!employeeId,
  });
}
