import { useState } from 'react';

function LoginScreen({ onLogin }) {
    const [dniInput, setDniInput] = useState('');
    const [error, setError] = useState(null);

    return (
        <div className="modal-overlay login-overlay">
            <div className="modal-content login-card" style={{ textAlign: 'center' }}>
                <div className="sidebar-logo" style={{ border: 'none', justifyContent: 'center', marginBottom: '1rem', color: 'var(--secondary)' }}>
                    LASIA <span>LIMPIEZA</span>
                </div>
                <h2>Acceso al Sistema</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Ingrese su DNI para continuar</p>
                <input
                    type="text"
                    placeholder="Introduce tu DNI"
                    className="card"
                    style={{ width: '100%', padding: '1rem', textAlign: 'center', fontSize: '1.2rem', marginBottom: '1rem' }}
                    value={dniInput}
                    onChange={(e) => setDniInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (onLogin(dniInput) || setError('DNI incorrecto'))}
                />
                {error && <p style={{ color: 'var(--error)', marginBottom: '1rem' }}>{error}</p>}
                <button
                    className="btn btn-primary"
                    style={{ width: '100%', padding: '1rem' }}
                    onClick={() => onLogin(dniInput) || setError('DNI incorrecto')}
                >
                    Entrar
                </button>
            </div>
        </div>
    );
}

export default LoginScreen;
