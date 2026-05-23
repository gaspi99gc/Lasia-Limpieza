'use client';

import ErrorState from '@/components/ErrorState';

export default function RrhhError({ error, reset }) {
  return <ErrorState error={error} reset={reset} title="Error en RRHH" />;
}
