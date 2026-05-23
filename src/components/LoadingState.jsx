export default function LoadingState({ label = 'Cargando...' }) {
  return (
    <div style={{
      padding: '2rem',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '30vh',
      color: 'var(--text-muted)',
    }}>
      {label}
    </div>
  );
}
