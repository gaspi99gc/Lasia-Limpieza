'use client';

import { useEffect, useState } from 'react';
import MainLayout from '@/components/MainLayout';
import { getSessionUser } from '@/lib/session';

function todayARStr() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
}

function addDaysAR(ymd, n) {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function fmtYMD(ymd) {
    if (!ymd) return '';
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
}

export default function MisFichadasPage() {
    const [supervisorId, setSupervisorId] = useState(null);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const today = todayARStr();
    const dateFrom = addDaysAR(today, -6);
    const dateTo = today;

    useEffect(() => {
        const user = getSessionUser();
        if (user?.id) setSupervisorId(user.id);
    }, []);

    useEffect(() => {
        if (!supervisorId) return;
        let cancelled = false;
        setLoading(true);
        setError('');
        setData(null);
        fetch(`/api/reports/weekly-json?supervisor_id=${supervisorId}&date_from=${dateFrom}&date_to=${dateTo}`)
            .then(async r => {
                if (!r.ok) {
                    const err = await r.json().catch(() => ({}));
                    throw new Error(err.error || `Error del servidor (${r.status})`);
                }
                return r.json();
            })
            .then(d => { if (!cancelled) setData(d); })
            .catch(e => { if (!cancelled) setError(e.message || 'No se pudieron cargar las fichadas.'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [supervisorId, dateFrom, dateTo]);

    const openDayDetail = async (day) => {
        if (!day.visitas.length) return;
        const { default: Swal } = await import('sweetalert2');
        const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        const filas = day.visitas.map(v => `
            <li class="swal-fichada-visit">
                <div class="swal-fichada-visit-main">
                    <strong>${esc(v.service_name)}</strong>
                    <span>${esc(v.ingresoHora)} → ${esc(v.egresoHora || '—')}</span>
                </div>
                <div class="swal-fichada-visit-meta">
                    ${v.duracion ? `<span class="swal-fichada-dur">${esc(v.duracion)}</span>` : ''}
                    ${v.ongoing ? `<span class="swal-fichada-badge is-ongoing">⏵ En curso</span>` : ''}
                    ${v.lejos ? `<span class="swal-fichada-badge is-lejos">⚠ Lejos${v.distanciaMetros ? ` (${v.distanciaMetros} m)` : ''}</span>` : ''}
                </div>
            </li>
        `).join('');
        await Swal.fire({
            title: day.label,
            html: `<ul class="swal-fichada-visits">${filas}</ul>`,
            width: 480,
            showConfirmButton: true,
            confirmButtonText: 'Cerrar',
            confirmButtonColor: '#00AEEF',
        });
    };

    return (
        <MainLayout>
            <div className="mis-fichadas-page">
                <div className="mis-fichadas-card">
                    <div className="mis-fichadas-head">
                        <div>
                            <h3>Mis fichadas</h3>
                            <p className="mis-fichadas-subtitle">{fmtYMD(dateFrom)} al {fmtYMD(dateTo)}</p>
                        </div>
                    </div>

                    {loading && <p className="mis-fichadas-empty">Cargando…</p>}
                    {error && <p className="mis-fichadas-error">{error}</p>}

                    {data && !loading && !error && (
                        <>
                            <div className="mis-fichadas-summary">
                                <div>
                                    <span>Total</span>
                                    <strong>{data.totales.hsTotal}</strong>
                                </div>
                                <div>
                                    <span>Días</span>
                                    <strong>{data.totales.diasConFichada}</strong>
                                </div>
                                <div>
                                    <span>Servicios</span>
                                    <strong>{data.totales.serviciosVisitados}</strong>
                                </div>
                            </div>

                            <ul className="mis-fichadas-day-list">
                                {data.days.map(d => {
                                    const cantidad = d.visitas.length;
                                    const totalMin = d.visitas.reduce((acc, v) => {
                                        if (!v.duracion) return acc;
                                        const [hh, mm, ss] = v.duracion.split(':').map(Number);
                                        return acc + (hh * 60) + mm + (ss / 60);
                                    }, 0);
                                    const totalLabel = totalMin > 0
                                        ? `${String(Math.floor(totalMin / 60)).padStart(2, '0')}:${String(Math.round(totalMin % 60)).padStart(2, '0')}`
                                        : '—';
                                    return (
                                        <li key={d.date}>
                                            <button
                                                type="button"
                                                className="mis-fichadas-day-row"
                                                onClick={() => openDayDetail(d)}
                                                disabled={cantidad === 0}
                                            >
                                                <span className="mis-fichadas-day-label">{d.label}</span>
                                                <span className="mis-fichadas-day-meta">
                                                    {cantidad === 0
                                                        ? <span className="mis-fichadas-day-empty">Sin fichadas</span>
                                                        : (
                                                            <>
                                                                <span className="mis-fichadas-day-count">{cantidad}</span>
                                                                <span className="mis-fichadas-day-total">{totalLabel}</span>
                                                                <span className="mis-fichadas-day-arrow">›</span>
                                                            </>
                                                        )}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
