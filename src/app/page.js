'use client';

import { useState, useEffect } from 'react';
import MainLayout from '@/components/MainLayout';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatArgentinaDate, formatArgentinaDateTime, parseAppDate } from '@/lib/datetime';
import { getSessionUser } from '@/lib/session';

function DashboardIcon({ children }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

function MiniTrendChart({ values }) {
  const width = 540;
  const height = 200;
  const padding = 24;
  const max = Math.max(...values, 1);
  const stepX = (width - padding * 2) / (values.length - 1 || 1);

  const points = values.map((value, index) => {
    const x = padding + (stepX * index);
    const y = height - padding - (((height - padding * 2) * value) / max);
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg className="dashboard-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Tendencia operativa del panel">
      <defs>
        <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(0, 174, 239, 0.28)" />
          <stop offset="100%" stopColor="rgba(0, 174, 239, 0)" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((row) => {
        const y = padding + (((height - padding * 2) / 3) * row);
        return <line key={row} x1={padding} y1={y} x2={width - padding} y2={y} className="dashboard-trend-grid" />;
      })}
      <polyline points={points} className="dashboard-trend-line" />
      <polygon points={`${padding},${height - padding} ${points} ${width - padding},${height - padding}`} className="dashboard-trend-area" />
      {values.map((value, index) => {
        const x = padding + (stepX * index);
        const y = height - padding - (((height - padding * 2) * value) / max);
        return <circle key={`${value}-${index}`} cx={x} cy={y} r="4.5" className="dashboard-trend-point" />;
      })}
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

  const today = todayARStr();
  const dateFrom = addDaysAR(today, -6);
  const dateTo = today;

  // Cargar lista de supervisores y restaurar el ultimo seleccionado.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/supervisors')
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

        <div className="dashboard-fichadas-name-wrap">
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

            <div className="dashboard-fichadas-days">
              {data.days.every(d => d.visitas.length === 0) ? (
                <p className="dashboard-fichadas-empty">No hay fichadas registradas en los últimos 7 días.</p>
              ) : (
                data.days
                  .filter(d => d.visitas.length > 0)
                  .map(d => (
                    <div key={d.date} className="dashboard-fichadas-day">
                      <div className="dashboard-fichadas-day-header">{d.label}</div>
                      <ul>
                        {d.visitas.map((v, i) => (
                          <li key={i}>
                            <div className="dashboard-fichadas-visit-main">
                              <strong>{v.service_name}</strong>
                              <span>{v.ingresoHora} → {v.egresoHora || '—'}</span>
                            </div>
                            <div className="dashboard-fichadas-visit-meta">
                              {v.duracion && <span className="dashboard-fichadas-dur">{v.duracion}</span>}
                              {v.ongoing && <span className="dashboard-fichadas-badge is-ongoing">⏵ En curso</span>}
                              {v.lejos && (
                                <span className="dashboard-fichadas-badge is-lejos">
                                  ⚠ Lejos{v.distanciaMetros ? ` (${v.distanciaMetros} m)` : ''}
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))
              )}
            </div>
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

        setStats({
          activeEmpCount,
          criticalCount: 0, // Placeholder for docs
          expiringTrialCount: expiringTrials.length,
          totalTrialCount: totalTrials.length,
          pendingDocs: 0,
          suspensionesMes,
        });

        setRecentTrials(sortedTrials);

      } catch (e) {
        setStats({ activeEmpCount: 0, criticalCount: 0, expiringTrialCount: 0, totalTrialCount: 0, pendingDocs: 0, suspensionesMes: 0 });
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

  const chartValues = [
    Math.max(stats.activeEmpCount - 6, 0),
    Math.max(stats.activeEmpCount - 3, 0),
    stats.activeEmpCount,
    Math.max(stats.activeEmpCount - stats.expiringTrialCount, 0),
    stats.activeEmpCount + Math.min(stats.expiringTrialCount, 4),
  ];

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
        </div>

        <div className="dashboard-split-grid dashboard-main-grid">
          {currentRole === 'jefe_operativo' ? (
            <SupervisorFichadasCard />
          ) : (
            <div className="card dashboard-chart-card">
              <div className="page-header dashboard-card-head">
                <div>
                  <h3>Resumen operativo</h3>
                  <p className="dashboard-card-subtitle">Lectura rapida de actividad y carga del panel</p>
                </div>
                <Link href="/config" className="btn btn-secondary">Configuracion</Link>
              </div>
              <div className="dashboard-chart-wrap">
                <MiniTrendChart values={chartValues} />
              </div>
            </div>
          )}

          <div className="card dashboard-side-card">
            <div className="page-header dashboard-card-head">
              <div>
                <h3>Acciones rapidas</h3>
                <p className="dashboard-card-subtitle">Accesos directos a los modulos mas usados</p>
              </div>
            </div>
            <div className="dashboard-quick-actions">
              {quickLinks.map((item) => (
                <Link key={item.href} href={item.href} className="dashboard-quick-action">
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="page-header dashboard-card-head">
              <div>
                <h3>Vencimientos proximos</h3>
                <p className="dashboard-card-subtitle">Empleados con seguimiento cercano de periodo de prueba</p>
              </div>
            </div>
            <div className="table-container dashboard-table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Empleado</th>
                    <th>Estado</th>
                    <th>Fecha limite</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrials.map((emp) => (
                    <tr key={emp.id}>
                      <td>
                        <strong>{emp.apellido}, {emp.nombre}</strong>
                      </td>
                      <td><span className="badge badge-warning">Prueba</span></td>
                      <td>{formatArgentinaDate(getTrialPeriodEndDate(emp))}</td>
                    </tr>
                  ))}
                  {recentTrials.length === 0 && (
                    <tr>
                      <td colSpan="3" className="dashboard-empty-state">No hay vencimientos proximos</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
                {activeSupervisors.map((sup, idx) => (
                  <div key={sup.supervisor_id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                    padding: '0.65rem 0',
                    borderBottom: idx < activeSupervisors.length - 1 ? '1px solid var(--border-color)' : 'none',
                  }}>
                    <div style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: 'var(--success)', flexShrink: 0,
                      boxShadow: '0 0 0 3px rgba(16,185,129,0.2)',
                    }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                        {sup.supervisor_surname}, {sup.supervisor_name}
                      </span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginLeft: '0.5rem' }}>
                        {sup.current_service_name || 'Sin servicio'}
                      </span>
                    </div>
                    {sup.entered_at && (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                        {formatArgentinaDateTime(sup.entered_at)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card dashboard-activity-card">
            <div className="page-header dashboard-card-head">
              <div>
                <h3>Foco del dia</h3>
                <p className="dashboard-card-subtitle">Prioridades visibles sin salir del dashboard</p>
              </div>
            </div>
            <div className="dashboard-activity-list">
              <div className="dashboard-activity-item">
                <strong>{stats.activeEmpCount} personas activas</strong>
                <span>La nomina operativa actual se mantiene consolidada.</span>
              </div>
              <div className="dashboard-activity-item">
                <strong>{stats.expiringTrialCount} pruebas por revisar</strong>
                <span>Conviene validar los casos con vencimiento dentro de 21 dias.</span>
              </div>
              <div className="dashboard-activity-item">
                <strong>{recentTrials.length} casos visibles en el panel</strong>
                <span>La tabla lateral resume los proximos movimientos administrativos.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
