'use client';

import { useEffect, useState } from 'react';
import { notify } from '@/lib/toast';
import VacacionFormulario from './VacacionFormulario';

// Cargar vacaciones desde el legajo de una persona: el formulario adentro de un
// modal.
//
// El formulario vive aparte (VacacionFormulario) porque la pantalla de carga lo
// usa embebido, sin modal. Acá queda solo lo que es propio del modal: el fondo
// oscuro, cerrar con Escape y el encabezado con el nombre.

export default function VacacionMovimientoModal({ persona, periodo, saldoActual, onClose, onGuardado }) {
    const [guardando, setGuardando] = useState(false);

    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape' && !guardando) onClose(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose, guardando]);

    return (
        <div
            onClick={(e) => { if (e.target === e.currentTarget && !guardando) onClose(); }}
            style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 1000,
                display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
                padding: '1rem', overflowY: 'auto',
            }}
        >
            <div className="card" style={{ width: '100%', maxWidth: '480px', padding: '1.25rem', margin: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Cargar vacaciones</h2>
                    <button
                        onClick={onClose}
                        disabled={guardando}
                        style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.3rem', lineHeight: 1 }}
                        title="Cerrar"
                    >
                        ✕
                    </button>
                </div>
                <p style={{ margin: '0 0 1.1rem', color: 'var(--text-muted)', fontSize: '0.88rem' }}>
                    {persona.nombre} · le quedan <strong style={{ color: 'var(--text-main)' }}>{saldoActual}</strong> días
                </p>

                <VacacionFormulario
                    persona={persona}
                    periodo={periodo}
                    saldoActual={saldoActual}
                    onGuardandoChange={setGuardando}
                    onCancelar={onClose}
                    // El modal avisa y se cierra. La pantalla de carga, en
                    // cambio, muestra la confirmación en su propio lugar: por eso
                    // el aviso lo da quien envuelve al formulario, no el formulario.
                    onGuardado={({ nTomados, nCobrados }) => {
                        const partes = [];
                        if (nTomados) partes.push(`${nTomados} tomados`);
                        if (nCobrados) partes.push(`${nCobrados} cobrados`);
                        notify.success(`Cargado: ${partes.join(' y ')}.`);
                        onGuardado?.();
                        onClose();
                    }}
                />
            </div>
        </div>
    );
}
