'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { employeesKey } from '@/hooks/queries/useEmployees';
import { notify } from '@/lib/toast';

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      apiFetch('/api/employees', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeesKey });
      notify.success('Empleado creado');
    },
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) =>
      apiFetch(`/api/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeesKey });
      notify.success('Empleado actualizado');
    },
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/employees/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: employeesKey });
    },
  });
}
