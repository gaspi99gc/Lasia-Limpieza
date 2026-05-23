'use client';

import ErrorState from '@/components/ErrorState';

export default function ComprasError({ error, reset }) {
  return <ErrorState error={error} reset={reset} title="Error en Compras" />;
}
