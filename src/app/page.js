'use client';

import { useState, useEffect, useRef } from 'react';
import MainLayout from '@/components/MainLayout';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatArgentinaDate, formatArgentinaDateTime, parseAppDate } from '@/lib/datetime';
import { getSessionUser } from '@/lib/session';
import { useServices } from '@/hooks/queries/useServices';
import ServicesMap from '@/components/ServicesMap';
import ServiceDetailModal from '@/components/ServiceDetailModal';

function DashboardIcon({ children }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

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

function SupervisorFichadasCard() {
  const [supervisors, setSupervisors] = useState([]);
  const [supIdx, setSupIdx] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const pickerWrapRef = useRef(null);

  // Cerrar el picker al clickear afuera.
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e) => {
      if (pickerWrapRef.current && !pickerWrapRef.current.contains(e.target)) {
        setShowPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  const today = todayARStr();
  const dateFrom = addDaysAR(today, -6);
  const dateTo = today;

  // Cargar lista de supervisores y restaurar el ultimo seleccionado.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/supervisors?activeOnly=true')
      .then(r => r.ok ? r.json() : [])
      .then(list => {
        if (cancelled) return;
        const sorted = (Array.isArray(list) ? list : [])
          .filter(s => s.id && (s.name || s.surname))
          .sort((a, b) => `${a.surname || ''} ${a.name || ''}`.localeCompare(`${b.surname || ''} ${b.name || ''}`));
        setSupervisors(sorted);
        if (sorted.length > 0) {
          const lastId = Number(localStorage.getItem('dashboard_fichadas_sup_id'));
          const idx = sorted.findIndex(s => Number(s.id) === lastId);
          setSupIdx(idx >= 0 ? idx : 0);
        }
      })
      .catch(() => { if (!cancelled) setSupervisors([]); });
    return () => { cancelled = true; };
  }, []);

  const supervisor = supervisors[supIdx] || null;

  // Cargar fichadas del supervisor seleccionado.
  useEffect(() => {
    if (!supervisor) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    fetch(`/api/reports/weekly-json?supervisor_id=${supervisor.id}&date_from=${dateFrom}&date_to=${dateTo}`)
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
  }, [supervisor, dateFrom, dateTo]);

  const go = (delta) => {
    if (supervisors.length === 0) return;
    const next = (supIdx + delta + supervisors.length) % supervisors.length;
    setSupIdx(next);
    const id = supervisors[next]?.id;
    if (id) localStorage.setItem('dashboard_fichadas_sup_id', String(id));
  };

  const openDayDetail = async (day, sup) => {
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
      html: `
        <div class="swal-fichada-subtitle">${esc(sup ? `${sup.surname || ''}, ${sup.name || ''}` : '')}</div>
        <ul class="swal-fichada-visits">${filas}</ul>
      `,
      width: 560,
      showConfirmButton: true,
      confirmButtonText: 'Cerrar',
      confirmButtonColor: '#00AEEF',
    });
  };

  const pickSupervisor = (id) => {
    const idx = supervisors.findIndex(s => Number(s.id) === Number(id));
    if (idx >= 0) {
      setSupIdx(idx);
      localStorage.setItem('dashboard_fichadas_sup_id', String(id));
    }
    setShowPicker(false);
  };

  return (
    <div className="card dashboard-fichadas-card">
      <div className="dashboard-fichadas-head">
        <button
          type="button"
          className="dashboard-fichadas-arrow"
          onClick={() => go(-1)}
          disabled={supervisors.length < 2}
          aria-label="Supervisor anterior"
        >‹</button>

        <div className="dashboard-fichadas-name-wrap" ref={pickerWrapRef}>
          <button
            type="button"
            className="dashboard-fichadas-name"
            onClick={() => setShowPicker(s => !s)}
            disabled={supervisors.length === 0}
          >
            {supervisor ? `${supervisor.surname || ''}, ${supervisor.name || ''}` : 'Cargando supervisores…'}
            <span className="dashboard-fichadas-caret">▾</span>
          </button>
          <div className="dashboard-fichadas-subtitle">
            Fichadas del {fmtYMD(dateFrom)} al {fmtYMD(dateTo)}
          </div>
          {showPicker && (
            <div className="dashboard-fichadas-picker">
              {supervisors.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className={`dashboard-fichadas-picker-item ${s.id === supervisor?.id ? 'is-active' : ''}`}
                  onClick={() => pickSupervisor(s.id)}
                >
                  {s.surname || ''}, {s.name || ''}
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          className="dashboard-fichadas-arrow"
          onClick={() => go(1)}
          disabled={supervisors.length < 2}
          aria-label="Supervisor siguiente"
        >›</button>
      </div>

      <div className="dashboard-fichadas-body">
        {loading && <p className="dashboard-fichadas-empty">Cargando…</p>}
        {error && <p className="dashboard-fichadas-error">{error}</p>}
        {data && !loading && !error && (
          <>
            <div className="dashboard-fichadas-summary">
              <div>
                <span>Total horas</span>
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

            <ul className="dashboard-fichadas-day-list">
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
                      className="dashboard-fichadas-day-row"
                      onClick={() => openDayDetail(d, supervisor)}
                      disabled={cantidad === 0}
                    >
                      <span className="dashboard-fichadas-day-label">{d.label}</span>
                      <span className="dashboard-fichadas-day-meta">
                        {cantidad === 0
                          ? <span className="dashboard-fichadas-day-empty">Sin fichadas</span>
                          : (
                            <>
                              <span className="dashboard-fichadas-day-count">{cantidad} visita{cantidad !== 1 ? 's' : ''}</span>
                              <span className="dashboard-fichadas-day-total">{totalLabel}</span>
                              <span className="dashboard-fichadas-day-arrow">›</span>
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
  );
}

const getTrialPeriodEndDate = (employee) => {
  if (employee.fecha_fin_prueba) {
    return parseAppDate(employee.fecha_fin_prueba);
  }

  if (!employee.fecha_ingreso) {
    return null;
  }

  const endDate = parseAppDate(employee.fecha_ingreso);
  endDate.setUTCMonth(endDate.getUTCMonth() + 6);
  return endDate;
};

export default function Dashboard() {
  const [stats, setStats] = useState({ activeEmpCount: 0, criticalCount: 0, expiringTrialCount: 0, totalTrialCount: 0, pendingDocs: 0, suspensionesMes: 0 });
  const [recentTrials, setRecentTrials] = useState([]);
  const [activeSupervisors, setActiveSupervisors] = useState([]);
  const [currentRole, setCurrentRole] = useState(null);
  const [detailServiceId, setDetailServiceId] = useState(null);
  const { data: services = [] } = useServices();
  const router = useRouter();

  useEffect(() => {
    // Check role before fetching
    const user = getSessionUser();
    if (!user) return;

    if (user.role !== 'admin' && user.role !== 'jefe_operativo' && user.role !== 'direccion' && user.role !== 'rrhh') {
      router.push('/mi-panel');
      return;
    }

    setCurrentRole(user.role);

    const fetchActiveSupervisors = async () => {
      try {
        const res = await fetch('/api/supervisor-status?status=trabajando');
        if (res.ok) {
          const data = await res.json().catch(() => []);
          setActiveSupervisors(Array.isArray(data) ? data : []);
        }
      } catch (_) {}
    };

    fetchActiveSupervisors();
    const interval = setInterval(() => {
      if (!document.hidden) fetchActiveSupervisors();
    }, 60000);

    const handleVisibilityChange = () => {
      if (!document.hidden) fetchActiveSupervisors();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const fetchData = async () => {
      try {
        const empRes = await fetch('/api/employees');
        const employeesPayload = await empRes.json().catch(() => null);

        if (!empRes.ok) {
          throw new Error(employeesPayload?.error || 'No se pudo cargar la lista de empleados.');
        }

        const employees = Array.isArray(employeesPayload) ? employeesPayload : [];

        const activeEmpCount = employees.filter(e => e.estado_empleado === 'Activo').length;

        // Simple logic for expiring trials (less than 21 days)
        const expiringTrials = employees.filter(e => {
          if (e.estado_empleado !== 'Activo' || !e.fecha_ingreso) return false;
          const trialEndDate = getTrialPeriodEndDate(e);
          if (!trialEndDate) return false;
          const diff = (trialEndDate - new Date()) / (1000 * 60 * 60 * 24);
          return diff >= 0 && diff <= 21;
        });

        // All active employees currently within their trial period
        const today = new Date();
        const totalTrials = employees.filter(e => {
          if (e.estado_empleado !== 'Activo' || !e.fecha_ingreso) return false;
          const trialEndDate = getTrialPeriodEndDate(e);
          return trialEndDate && trialEndDate >= today;
        });

        // Top 5 with active trial period, sorted by soonest expiry
        const sortedTrials = [...totalTrials]
          .sort((a, b) => getTrialPeriodEndDate(a) - getTrialPeriodEndDate(b))
          .slice(0, 5);

        // Suspensiones del mes laboral en curso (período 26 → 25).
        // Si hoy es ≥ 26, el período va del 26 de este mes al 25 del próximo;
        // si todavía no llegamos al 26, va del 26 del mes pasado al 25 de este mes.
        const anchorMonth = today.getDate() >= 26 ? today.getMonth() + 1 : today.getMonth();
        const susStart = new Date(today.getFullYear(), anchorMonth - 1, 26);
        const susEnd   = new Date(today.getFullYear(), anchorMonth, 26); // exclusivo
        let suspensionesMes = 0;
        try {
          const susRes = await fetch('/api/employee-reports');
          if (susRes.ok) {
            const all = await susRes.json();
            suspensionesMes = (Array.isArray(all) ? all : [])
              .filter(r => r.categoria === 'suspension')
              .filter(r => {
                const ref = r.fecha_desde ? new Date(r.fecha_desde + 'T00:00:00') : new Date(r.created_at);
                return ref >= susStart && ref < susEnd;
              }).length;
          }
        } catch (_) { /* si falla, queda 0 */ }

        // Antecedentes penales sin cargar (dato del mini-widget de documentación).
        // Los 4 roles que ven el dashboard tienen permiso para este endpoint.
        let antecedentesFaltan = 0;
        // Datos del legajo sin cargar: domicilio, contacto de emergencia y
        // servicio asignado. Salen del mismo endpoint, en porDato.
        const faltanDato = { domicilio: 0, emergencia: 0, servicio: 0 };
        try {
          const docRes = await fetch('/api/employee-documents/faltantes', { credentials: 'include' });
          if (docRes.ok) {
            const docData = await docRes.json();
            const ant = (docData.porTipo || []).find(t => /antecedentes/i.test(t.nombre || ''));
            antecedentesFaltan = ant?.faltan || 0;
            for (const d of docData.porDato || []) {
              if (d.dato_key in faltanDato) faltanDato[d.dato_key] = d.faltan || 0;
            }
          }
        } catch (_) { /* si falla, queda 0 y el widget no se muestra */ }

        setStats({
          activeEmpCount,
          criticalCount: 0, // Placeholder for docs
          expiringTrialCount: expiringTrials.length,
          totalTrialCount: totalTrials.length,
          pendingDocs: antecedentesFaltan,
          suspensionesMes,
          faltanDato,
        });

        setRecentTrials(sortedTrials);

      } catch (e) {
        setStats({ activeEmpCount: 0, criticalCount: 0, expiringTrialCount: 0, totalTrialCount: 0, pendingDocs: 0, suspensionesMes: 0, faltanDato: { domicilio: 0, emergencia: 0, servicio: 0 } });
        setRecentTrials([]);
        console.error('Error loading dashboard data', e);
      }
    };

    fetchData();

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [router]);

  const quickLinks = [
    { href: '/rrhh', title: 'Gestionar RRHH', description: 'Legajos, prueba y documentacion' },
    { href: '/supervisores', title: 'Ver supervisores', description: 'Estado operativo y seguimiento' },
    { href: '/presentismo-admin', title: 'Controlar presentismo', description: 'Entradas, salidas y novedades' },
  ];

  return (
    <MainLayout>
      <div className="dashboard-shell">
        <div className="metrics-grid dashboard-kpi-grid">
          <div className="metric-card accent-card">
            <label><span className="metric-icon"><DashboardIcon><path d="M3 13h8V3H3z" /><path d="M13 21h8v-6h-8z" /><path d="M13 10h8V3h-8z" /><path d="M3 21h8v-4H3z" /></DashboardIcon></span>Personal activo</label>
            <div className="value">{stats.activeEmpCount}</div>
            <div className="trend up">Operacion estable</div>
          </div>
          <div className="metric-card">
            <label><span className="metric-icon"><DashboardIcon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></DashboardIcon></span>Periodos de prueba</label>
            <div className="value">{stats.totalTrialCount}</div>
            <div className="trend up">Personal en prueba</div>
          </div>
          <div className="metric-card">
            <label><span className="metric-icon"><DashboardIcon><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></DashboardIcon></span>Supervisores activos</label>
            <div className="value">{activeSupervisors.length}</div>
            <div className="trend up">Trabajando ahora</div>
          </div>
          <div className="metric-card">
            <label><span className="metric-icon"><DashboardIcon><path d="M4 19h16" /><path d="M4 5h16" /><path d="M4 12h10" /></DashboardIcon></span>Suspensiones este mes</label>
            <div className="value">{stats.suspensionesMes}</div>
            <div className="trend up">Período 26 al 25</div>
          </div>

          {/* Mini-agregado de documentación: antecedentes penales sin cargar. Es una
              tarjeta más de la grilla, pero atenuada (más discreta). Clickeable, lleva
              a la vista completa en RRHH. Solo aparece si hay faltantes. */}
          {stats.pendingDocs > 0 && (
            <Link href="/rrhh?tab=doc-faltante" className="metric-card" style={{ textDecoration: 'none', color: 'inherit', opacity: 0.85 }}>
              <label><span className="metric-icon"><DashboardIcon><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></DashboardIcon></span>Sin antecedentes penales</label>
              <div className="value">{stats.pendingDocs}</div>
              <div className="trend" style={{ color: 'var(--text-muted)' }}>Ver documentación →</div>
            </Link>
          )}

          {/* Relevamiento de datos de contacto y servicio sin asignar. Mismo
              estilo atenuado que el de documentación; cada una abre su lista. */}
          {stats.faltanDato?.domicilio > 0 && (
            <Link href="/rrhh?tab=doc-faltante&falta=domicilio" className="metric-card" style={{ textDecoration: 'none', color: 'inherit', opacity: 0.85 }}>
              <label><span className="metric-icon"><DashboardIcon><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></DashboardIcon></span>Sin domicilio cargado</label>
              <div className="value">{stats.faltanDato.domicilio}</div>
              <div className="trend" style={{ color: 'var(--text-muted)' }}>Ver quiénes →</div>
            </Link>
          )}

          {stats.faltanDato?.emergencia > 0 && (
            <Link href="/rrhh?tab=doc-faltante&falta=emergencia" className="metric-card" style={{ textDecoration: 'none', color: 'inherit', opacity: 0.85 }}>
              <label><span className="metric-icon"><DashboardIcon><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" /></DashboardIcon></span>Sin contacto de emergencia</label>
              <div className="value">{stats.faltanDato.emergencia}</div>
              <div className="trend" style={{ color: 'var(--text-muted)' }}>Ver quiénes →</div>
            </Link>
          )}

          {stats.faltanDato?.servicio > 0 && (
            <Link href="/rrhh?tab=doc-faltante&falta=servicio" className="metric-card" style={{ textDecoration: 'none', color: 'inherit', opacity: 0.85 }}>
              <label><span className="metric-icon"><DashboardIcon><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M10 21v-6h4v6" /></DashboardIcon></span>Sin servicio asignado</label>
              <div className="value">{stats.faltanDato.servicio}</div>
              <div className="trend" style={{ color: 'var(--text-muted)' }}>Ver quiénes →</div>
            </Link>
          )}
        </div>

        <div className="dashboard-split-grid dashboard-main-grid">
          {(currentRole === 'jefe_operativo' || currentRole === 'direccion') && (
            <SupervisorFichadasCard />
          )}

          {/* RRHH no hace seguimiento operativo de los supervisores: la tarjeta
              es ruido en su dashboard. La ven los demás roles. */}
          {currentRole !== 'rrhh' && (
          <div className="card">
            <div className="page-header dashboard-card-head">
              <div>
                <h3>Supervisores trabajando ahora</h3>
                <p className="dashboard-card-subtitle">Fichadas activas en tiempo real · actualiza cada 30s</p>
              </div>
              <Link href="/presentismo-admin" className="btn btn-secondary" style={{ fontSize: '0.82rem' }}>Ver todo</Link>
            </div>
            {activeSupervisors.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', margin: '0.5rem 0 0' }}>
                No hay supervisores trabajando en este momento.
              </p>
            ) : (
              <div className="dashboard-active-sups">
                {activeSupervisors.map((sup, idx) => (
                  <div key={sup.supervisor_id} className="dashboard-active-sup-row" style={{
                    borderBottom: idx < activeSupervisors.length - 1 ? '1px solid var(--border-color)' : 'none',
                  }}>
                    <div className="dashboard-active-sup-dot" />
                    <div className="dashboard-active-sup-info">
                      <span className="dashboard-active-sup-name">
                        {sup.supervisor_surname}, {sup.supervisor_name}
                      </span>
                      <span className="dashboard-active-sup-service">
                        {sup.current_service_name || 'Sin servicio'}
                      </span>
                    </div>
                    {sup.entered_at && (
                      <span className="dashboard-active-sup-time">
                        {formatArgentinaDateTime(sup.entered_at)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

        </div>

        <div className="card dashboard-map-card">
          <div className="page-header dashboard-card-head dashboard-map-head">
            <div>
              <h3>Mapa de Servicios</h3>
              <p className="dashboard-card-subtitle">Ubicación geográfica de todas las sucursales activas.</p>
            </div>
            <Link href="/mapa-servicios" className="btn btn-secondary dashboard-map-link">Ver completo</Link>
          </div>
          <div className="dashboard-map-wrap">
            <ServicesMap
              services={services}
              height="100%"
              onSelectService={(id) => setDetailServiceId(id)}
            />
          </div>
        </div>

        {detailServiceId && (
          <ServiceDetailModal
            serviceId={detailServiceId}
            onClose={() => setDetailServiceId(null)}
          />
        )}
      </div>
    </MainLayout>
  );
}
