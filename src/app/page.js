'use client';

import { useState, useEffect } from 'react';
import MainLayout from '@/components/MainLayout';
import { useRouter } from 'next/navigation';

export default function Dashboard() {
  const [stats, setStats] = useState({ activeEmpCount: 0, criticalCount: 0, expiringTrialCount: 0, pendingDocs: 0 });
  const [recentTrials, setRecentTrials] = useState([]);
  const router = useRouter();

  useEffect(() => {
    // Check role before fetching
    const userStr = localStorage.getItem('currentUser');
    if (!userStr) return;
    const user = JSON.parse(userStr);

    if (user.role !== 'admin') {
      router.push('/mi-panel');
      return;
    }

    const fetchData = async () => {
      try {
        const empRes = await fetch('/api/employees');
        const employees = await empRes.json();

        const activeEmpCount = employees.filter(e => e.estado_empleado === 'Activo').length;

        // Simple logic for expiring trials (less than 15 days)
        const expiringTrials = employees.filter(e => {
          if (e.estado_empleado !== 'Activo' || !e.fecha_fin_prueba) return false;
          const diff = (new Date(e.fecha_fin_prueba) - new Date()) / (1000 * 60 * 60 * 24);
          return diff >= 0 && diff <= 15;
        });

        // Top 5 sorted by trial expiration
        const sortedTrials = [...employees.filter(e => e.estado_empleado === 'Activo' && e.fecha_fin_prueba)]
          .sort((a, b) => new Date(a.fecha_fin_prueba) - new Date(b.fecha_fin_prueba))
          .slice(0, 5);

        setStats({
          activeEmpCount,
          criticalCount: 0, // Placeholder for docs
          expiringTrialCount: expiringTrials.length,
          pendingDocs: 0
        });

        setRecentTrials(sortedTrials);

      } catch (e) {
        console.error("Error loading dashboard data", e);
      }
    };

    fetchData();
  }, [router]);

  return (
    <MainLayout>
      <div className="dashboard-view">
        <header className="page-header" style={{ marginBottom: '2rem' }}>
          <div>
            <h1>Dashboard Holístico</h1>
            <p style={{ color: 'var(--text-muted)' }}>Bienvenido al panel central de LASIA</p>
          </div>
        </header>

        <div className="metrics-grid">
          <div className="metric-card">
            <label>Personal Activo</label>
            <div className="value">{stats.activeEmpCount}</div>
            <div className="trend up">▲ +12 este mes</div>
          </div>
          <div className="metric-card">
            <label>Legajos Críticos</label>
            <div className="value" style={{ color: 'var(--error)' }}>{stats.criticalCount}</div>
            <div className="trend down">▼ Revisión urgente</div>
          </div>
          <div className="metric-card">
            <label>Vtos. Prueba (15d)</label>
            <div className="value" style={{ color: 'var(--warning)' }}>{stats.expiringTrialCount}</div>
            <div className="trend up">🟡 Pendientes</div>
          </div>
          <div className="metric-card">
            <label>Docs Pendientes</label>
            <div className="value">{stats.pendingDocs}</div>
            <div className="trend down">🔴 -3 hoy</div>
          </div>
        </div>

        <div className="dashboard-split-grid">
          <div className="card">
            <div className="page-header">
              <h3>Estadísticas RRHH</h3>
              <button className="btn btn-secondary">Config</button>
            </div>
            <div className="graph-placeholder">
              Gráfico de Tendencias RRHH (Próximamente)
            </div>
          </div>
          <div className="card">
            <h3>Vencimientos próximos</h3>
            <div className="table-container" style={{ marginTop: '1rem' }}>
              <table style={{ fontSize: '0.8rem', width: '100%' }}>
                <tbody>
                  {recentTrials.map(emp => (
                    <tr key={emp.id}>
                      <td><strong>{emp.apellido}, {emp.nombre}</strong></td>
                      <td><span className="badge badge-warning">Prueba</span></td>
                      <td style={{ textAlign: 'right' }}>{new Date(emp.fecha_fin_prueba).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {recentTrials.length === 0 && (
                    <tr><td colSpan="3" style={{ textAlign: 'center', color: '#999' }}>No hay vencimientos próximos</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </MainLayout>
  );
}
