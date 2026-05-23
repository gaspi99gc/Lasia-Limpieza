'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { servicesKey } from '@/hooks/queries/useServices';
import { notify } from '@/lib/toast';

export function useCreateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      apiFetch('/api/services', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: servicesKey }),
  });
}

export function useUpdateService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) =>
      apiFetch(`/api/services/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: servicesKey }),
  });
}

export function useDeleteService() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => apiFetch(`/api/services/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: servicesKey });
      notify.success('Servicio eliminado');
    },
  });
}
