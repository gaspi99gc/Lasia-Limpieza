'use client';

import { useState, useEffect } from 'react';
import MainLayout from '@/components/MainLayout';
import { useRouter } from 'next/navigation';

export default function RelevamientoPage() {
    const [user, setUser] = useState(null);
    const [services, setServices] = useState([]);
    const [supplies, setSupplies] = useState([]);

    const [selectedService, setSelectedService] = useState('');
    const [notes, setNotes] = useState('');
    const [quantities, setQuantities] = useState({}); // { supplyId: quantity }

    const [status, setStatus] = useState('');
    const [message, setMessage] = useState('');
    const router = useRouter();

    useEffect(() => {
        const u = localStorage.getItem('currentUser');
        if (!u) {
            router.push('/login');
            return;
        }
        setUser(JSON.parse(u));

        // Load services and supplies
        Promise.all([
            fetch('/api/services').then(res => res.json()),
            fetch('/api/supplies').then(res => res.json())
        ])
            .then(([servicesData, suppliesData]) => {
                setServices(servicesData);
                setSupplies(suppliesData.filter(s => s.activo));
            })
            .catch(err => console.error(err));
    }, [router]);

    const handleQuantityChange = (supplyId, value) => {
        const num = parseFloat(value);
        setQuantities(prev => ({
            ...prev,
            [supplyId]: isNaN(num) || num < 0 ? 0 : num
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!selectedService) {
            setMessage('Seleccione un servicio.');
            setStatus('error');
            return;
        }

        const items = Object.entries(quantities)
            .filter(([_, qty]) => qty > 0)
            .map(([id, qty]) => ({ supply_id: parseInt(id), cantidad: qty }));

        if (items.length === 0) {
            setMessage('Debe solicitar al menos un insumo.');
            setStatus('error');
            return;
        }

        setStatus('loading');
        setMessage('Enviando pedido...');

        try {
            const res = await fetch('/api/supply-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supervisor_id: user.id,
                    service_id: parseInt(selectedService),
                    notas: notes,
                    items: items
                })
            });

            if (res.ok) {
                setStatus('success');
                setMessage('Pedido enviado correctamente.');
                setQuantities({});
                setNotes('');
                setSelectedService('');
            } else {
                setStatus('error');
                setMessage('Error al enviar el pedido.');
            }
        } catch (err) {
            setStatus('error');
            setMessage('Error de red al enviar el pedido.');
        }
    };

    if (!user) return null;

    return (
        <MainLayout>
            <div className="relevamiento-view panel-max-narrow">
                <header style={{ marginBottom: '2rem' }}>
                    <h1>📦 Relevamiento Semanal</h1>
                    <p style={{ color: 'var(--text-muted)' }}>Módulo de pedidos de insumos por servicio</p>
                </header>

                <div className="card">
                    <form onSubmit={handleSubmit}>
                        <div className="form-group" style={{ marginBottom: '2rem' }}>
                            <label><strong>Servicio para el Pedido:</strong></label>
                            <select
                                value={selectedService}
                                onChange={(e) => setSelectedService(e.target.value)}
                                style={{ width: '100%', padding: '0.8rem', fontSize: '1rem' }}
                                required
                            >
                                <option value="">-- Elige el servicio --</option>
                                {services.map(s => (
                                    <option key={s.id} value={s.id}>{s.name} - {s.address}</option>
                                ))}
                            </select>
                        </div>

                        <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '0.5rem', marginBottom: '1rem' }}>Lista de Insumos</h3>
                        <div className="relevamiento-supplies-grid" style={{ marginBottom: '2rem' }}>
                            {supplies.map(supply => (
                                <div key={supply.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '0.8rem', borderRadius: '8px' }}>
                                    <div>
                                        <strong>{supply.nombre}</strong>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{supply.unidad}</div>
                                    </div>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.5"
                                        style={{ width: '80px', margin: 0 }}
                                        value={quantities[supply.id] || ''}
                                        onChange={(e) => handleQuantityChange(supply.id, e.target.value)}
                                        placeholder="0"
                                    />
                                </div>
                            ))}
                        </div>

                        <div className="form-group" style={{ marginBottom: '2rem' }}>
                            <label><strong>Notas o Comentarios Adicionales:</strong></label>
                            <textarea
                                rows="3"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Ej: Faltan escobas grandes, se rompió el balde..."
                                style={{ width: '100%', padding: '0.8rem', fontSize: '1rem', resize: 'vertical' }}
                            ></textarea>
                        </div>

                        <button
                            type="submit"
                            className="btn btn-primary"
                            style={{ width: '100%', padding: '1rem', fontSize: '1.2rem' }}
                            disabled={status === 'loading'}
                        >
                            📤 Enviar Pedido
                        </button>
                    </form>

                    {message && (
                        <div style={{
                            marginTop: '2rem',
                            padding: '1rem',
                            borderRadius: '8px',
                            background: status === 'loading' ? '#e2e8f0' : status === 'success' ? '#dcfce7' : '#fee2e2',
                            color: status === 'success' ? '#166534' : status === 'error' ? '#991b1b' : '#334155',
                            textAlign: 'center',
                            fontWeight: '500'
                        }}>
                            {message}
                        </div>
                    )}
                </div>
            </div>
        </MainLayout>
    );
}
