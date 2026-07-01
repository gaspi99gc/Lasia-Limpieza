'use client';

import { useEffect, useState } from 'react';

function fmtPhoneForDisplay(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/\D+/g, '');
    if (digits.length < 10) return phone;
    // 549XXXXXXXXXX → +54 9 XX XXXX XXXX
    if (digits.startsWith('549') && digits.length >= 12) {
        return `+54 9 ${digits.slice(3, 5)} ${digits.slice(5, 9)} ${digits.slice(9)}`;
    }
    return phone;
}

export default function ServiceDetailModal({ serviceId, onClose }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!serviceId) return;
        let cancelled = false;
        setLoading(true);
        setError('');
        fetch(`/api/services/${serviceId}`, { cache: 'no-store' })
            .then(async r => {
                if (!r.ok) {
                    const err = await r.json().catch(() => ({}));
                    throw new Error(err.error || `Error del servidor (${r.status})`);
                }
                return r.json();
            })
            .then(d => { if (!cancelled) setData(d); })
            .catch(e => { if (!cancelled) setError(e.message || 'No se pudo cargar el detalle.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [serviceId]);

    const turnos = Array.isArray(data?.operarios_turnos) ? data.operarios_turnos : [];
    const jc = Number(data?.operarios_jornada_completa) || 0;
    const mj = Number(data?.operarios_media_jornada) || 0;
    const total = jc + mj;

    const gmapsUrl = data?.lat && data?.lng
        ? `https://www.google.com/maps?q=${data.lat},${data.lng}`
        : null;
    const waUrl = data?.encargado_telefono
        ? `https://wa.me/${String(data.encargado_telefono).replace(/\D+/g, '')}`
        : null;

    return (
        <div className="modal-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal-content service-detail-modal" onClick={(e) => e.stopPropagation()}>
                <div className="service-detail-header">
                    <h2 style={{ margin: 0 }}>{data?.name || 'Detalle del servicio'}</h2>
                    <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
                </div>

                {loading && <p className="service-detail-loading">Cargando detalle…</p>}
                {error && <p className="service-detail-error">{error}</p>}

                {data && !loading && !error && (
                    <div className="service-detail-body">
                        <section className="service-detail-section">
                            <h4>Dirección</h4>
                            <p className="service-detail-line">{data.address || 'Sin dirección cargada'}</p>
                            {gmapsUrl && (
                                <p className="service-detail-meta">
                                    <a href={gmapsUrl} target="_blank" rel="noopener noreferrer">📍 Ver en Google Maps</a>
                                    <span> · GPS: {Number(data.lat).toFixed(6)}, {Number(data.lng).toFixed(6)}</span>
                                </p>
                            )}
                        </section>

                        <section className="service-detail-section">
                            <h4>Encargado del servicio</h4>
                            {data.encargado_nombre || data.encargado_telefono ? (
                                <>
                                    <p className="service-detail-line">
                                        <strong>{data.encargado_nombre || 'Sin nombre'}</strong>
                                    </p>
                                    {data.encargado_telefono && (
                                        <p className="service-detail-meta">
                                            {fmtPhoneForDisplay(data.encargado_telefono)}
                                            {waUrl && (
                                                <>
                                                    {' · '}
                                                    <a href={waUrl} target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>
                                                </>
                                            )}
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="service-detail-empty">Sin encargado cargado.</p>
                            )}
                        </section>

                        <section className="service-detail-section">
                            <h4>Administrador</h4>
                            {(data.administrador_nombre || (data.administrador_mails && data.administrador_mails.length > 0) || (data.administrador_telefonos && data.administrador_telefonos.length > 0)) ? (
                                <>
                                    {data.administrador_nombre && (
                                        <p className="service-detail-line"><strong>{data.administrador_nombre}</strong></p>
                                    )}
                                    {Array.isArray(data.administrador_mails) && data.administrador_mails.length > 0 && (
                                        <div className="service-detail-contact-block">
                                            <span className="service-detail-contact-label">Mails</span>
                                            <ul className="service-detail-contact-list">
                                                {data.administrador_mails.map((m, i) => (
                                                    <li key={i}>
                                                        <a href={`mailto:${m}`}>{m}</a>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {Array.isArray(data.administrador_telefonos) && data.administrador_telefonos.length > 0 && (
                                        <div className="service-detail-contact-block">
                                            <span className="service-detail-contact-label">Teléfonos</span>
                                            <ul className="service-detail-contact-list">
                                                {data.administrador_telefonos.map((t, i) => {
                                                    const wa = String(t).replace(/\D+/g, '');
                                                    return (
                                                        <li key={i}>
                                                            <span>{t}</span>
                                                            {wa && (
                                                                <>
                                                                    {' · '}
                                                                    <a href={`https://wa.me/${wa.startsWith('54') ? wa : `549${wa.replace(/^0+/, '')}`}`} target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>
                                                                </>
                                                            )}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <p className="service-detail-empty">Sin datos de administrador.</p>
                            )}
                        </section>

                        <section className="service-detail-section">
                            <h4>Plantel</h4>
                            <div className="service-detail-grid-2">
                                <div className="service-detail-stat">
                                    <span>Jornada completa (8hs)</span>
                                    <strong>{jc}</strong>
                                </div>
                                <div className="service-detail-stat">
                                    <span>Media jornada (4hs)</span>
                                    <strong>{mj}</strong>
                                </div>
                            </div>
                            {turnos.length > 0 ? (
                                <div className="service-detail-turnos">
                                    <p className="service-detail-subtitle">Turnos diagramados</p>
                                    <ul>
                                        {turnos.map((t, i) => (
                                            <li key={i}>
                                                <span>{t.hora_inicio} – {t.hora_fin}</span>
                                                <strong>{t.cantidad} operario{Number(t.cantidad) !== 1 ? 's' : ''}</strong>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            ) : (
                                <p className="service-detail-meta service-detail-empty" style={{ marginTop: '0.4rem' }}>Sin turnos diagramados.</p>
                            )}
                            <p className="service-detail-total">
                                Total: <strong>{total}</strong> operario{total !== 1 ? 's' : ''}
                            </p>
                        </section>

                        <section className="service-detail-section">
                            <h4>Maquinaria</h4>
                            {data.machines && data.machines.length > 0 ? (
                                <ul className="service-detail-machines">
                                    {data.machines.map(m => (
                                        <li key={m.id}>
                                            <span>{m.nombre}</span>
                                            <strong>{m.quantity} {m.quantity === 1 ? 'unidad' : 'unidades'}</strong>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="service-detail-empty">Sin maquinaria asignada.</p>
                            )}
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
}
