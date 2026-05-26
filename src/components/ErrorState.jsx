'use client';

export default function ErrorState({ error, reset, title = 'Algo salió mal' }) {
  return (
    <div style={{
      padding: '2rem',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '40vh',
      gap: '1rem',
      textAlign: 'center',
    }}>
      <h2 style={{ margin: 0 }}>{title}</h2>
      {error?.message && (
        <p style={{ color: 'var(--text-muted)', maxWidth: 480, margin: 0 }}>{error.message}</p>
      )}
      {reset && (
        <button className="btn btn-primary" onClick={() => reset()}>Reintentar</button>
      )}
    </div>
  );
}
