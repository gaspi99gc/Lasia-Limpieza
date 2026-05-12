'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import MainLayout from '@/components/MainLayout';
import SearchableSelect from '@/components/SearchableSelect';
import { getSessionUser } from '@/lib/session';
import { useCatalog } from '@/lib/CatalogContext';
import { useNearbyServices } from '@/lib/useNearbyServices';

const STEP_LABELS = ['Servicio', 'Insumos', 'Revisión', 'Confirmar'];

function Stepper({ step }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.75rem' }}>
            {STEP_LABELS.map((label, i) => {
                const num = i + 1;
                const done = num < step;
                const active = num === step;
                return (
                    <div key={label} style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.3rem' }}>
                            <div style={{
                                width: '32px', height: '32px', borderRadius: '50%',
                                background: done ? 'var(--success)' : active ? 'var(--color-primary)' : 'var(--border-color)',
                                color: done || active ? '#fff' : 'var(--text-muted)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 700, fontSize: '0.85rem', transition: 'all 0.2s',
                            }}>
                                {done ? '✓' : num}
                            </div>
                            <span style={{
                                fontSize: '0.68rem', letterSpacing: '0.03em',
                                color: active ? 'var(--color-primary)' : done ? 'var(--success)' : 'var(--text-muted)',
                                fontWeight: active ? 700 : 500,
                            }}>
                                {label}
                            </span>
                        </div>
                        {i < STEP_LABELS.length - 1 && (
                            <div style={{
                                width: '36px', height: '2px',
                                background: done ? 'var(--success)' : 'var(--border-color)',
                                margin: '0 4px', marginBottom: '20px', transition: 'background 0.2s',
                            }} />
                        )}
                    </div>
                );
            })}
        </div>
    );
}

export default function PedidoInsumosPage() {
    const router = useRouter();
    const { services, supplies: allSupplies, loading: isLoading } = useCatalog();
    const { sortedServices } = useNearbyServices(services);
    const activeSupplies = allSupplies.filter(s => s.activo !== false);

    const [currentUser, setCurrentUser] = useState(null);
    const [step, setStep] = useState(1);
    const [serviceId, setServiceId] = useState('');
    const [items, setItems] = useState({});
    const [search, setSearch] = useState('');
    const [notes, setNotes] = useState('');
    const [urgent, setUrgent] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const letterRefs = useRef({});

    useEffect(() => {
        const user = getSessionUser();
        if (!user) { router.push('/login'); return; }
        setCurrentUser(user);
    }, [router]);

    const setQty = (supplyId, qty) => {
        setItems(prev => {
            const next = { ...prev };
            const n = Number(qty);
            if (!n || n <= 0) delete next[supplyId];
            else next[supplyId] = n;
            return next;
        });
    };

    const totalItems = Object.keys(items).length;

    const { groupedByLetter, letters } = useMemo(() => {
        const q = search.trim().toLowerCase();
        const filtered = q
            ? activeSupplies.filter(s => s.nombre.toLowerCase().includes(q))
            : activeSupplies;

        const grouped = {};
        for (const s of filtered) {
            const letter = s.nombre[0]?.toUpperCase() || '#';
            if (!grouped[letter]) grouped[letter] = [];
            grouped[letter].push(s);
        }
        return { groupedByLetter: grouped, letters: Object.keys(grouped).sort() };
    }, [activeSupplies, search]);

    const selectedService = services.find(s => String(s.id) === String(serviceId));
    const selectedSupplies = activeSupplies.filter(s => items[s.id] > 0);

    const goToStep2 = () => { setSearch(''); setStep(2); };
    const goToStep3 = () => { if (totalItems > 0) setStep(3); };

    const handleSubmit = async () => {
        const { default: Swal } = await import('sweetalert2');
        const requestItems = Object.entries(items)
            .filter(([, qty]) => qty > 0)
            .map(([supply_id, cantidad]) => ({ supply_id: Number(supply_id), cantidad: Number(cantidad) }));

        setIsSubmitting(true);
        try {
            const res = await fetch('/api/supply-requests', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supervisor_id: currentUser.id,
                    service_id: Number(serviceId),
                    items: requestItems,
                    notas: notes.trim(),
                    urgent,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al enviar el pedido');

            await Swal.fire({
                title: '¡Pedido enviado!',
                html: `El pedido fue registrado.<br><b style="font-size:1.1rem">Pedido N° ${data.request_id}</b>`,
                icon: 'success',
                confirmButtonColor: 'var(--color-primary)',
                confirmButtonText: 'Listo',
            });
            setItems({});
            setNotes('');
            setUrgent(false);
            setServiceId('');
            setSearch('');
            setStep(1);
        } catch (err) {
            Swal.fire({ title: 'Error', text: err.message, icon: 'error', confirmButtonColor: '#ef4444' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <MainLayout>
            <div style={{ maxWidth: '680px', margin: '0 auto' }}>
                <div style={{ marginBottom: '1.25rem' }}>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Nuevo Pedido</h1>
                </div>

                {isLoading ? (
                    <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
                ) : (
                    <>
                        <Stepper step={step} />

                        {/* ── STEP 1: Servicio ── */}
                        {step === 1 && (
                            <div className="card" style={{ padding: '1.5rem' }}>
                                <h3 style={{ fontSize: '0.88rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Seleccioná el servicio
                                </h3>
                                <SearchableSelect
                                    options={sortedServices.map(s => ({ value: s.id, label: s.name }))}
                                    value={serviceId}
                                    onChange={setServiceId}
                                    placeholder="Seleccioná un servicio..."
                                    searchPlaceholder="Buscar servicio..."
                                />
                                <button
                                    className="btn btn-primary"
                                    style={{ width: '100%', marginTop: '1.25rem', minHeight: '48px', fontWeight: 700 }}
                                    onClick={goToStep2}
                                    disabled={!serviceId}
                                >
                                    Elegir insumos →
                                </button>
                            </div>
                        )}

                        {/* ── STEP 2: Insumos ── */}
                        {step === 2 && (
                            <div>
                                {/* Header + search */}
                                <div className="card" style={{ padding: '1rem 1.25rem', marginBottom: '0.75rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                        <button
                                            className="btn btn-secondary"
                                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', flexShrink: 0 }}
                                            onClick={() => setStep(1)}
                                        >
                                            ← Volver
                                        </button>
                                        <div style={{ minWidth: 0 }}>
                                            <div style={{ fontWeight: 600, fontSize: '0.95rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {selectedService?.name}
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Seleccioná los insumos</div>
                                        </div>
                                    </div>
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        placeholder="Buscar insumo..."
                                        autoFocus
                                        style={{
                                            width: '100%', padding: '0.6rem 0.9rem',
                                            borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)',
                                            fontSize: '0.95rem', background: 'var(--color-surface)', color: 'var(--text-main)',
                                            outline: 'none',
                                        }}
                                    />
                                </div>

                                {/* Alpha index */}
                                {!search && letters.length > 0 && (
                                    <div style={{
                                        display: 'flex', flexWrap: 'wrap', gap: '0.3rem',
                                        marginBottom: '0.75rem', position: 'sticky', top: '0', zIndex: 10,
                                        background: 'var(--color-bg)', padding: '0.5rem 0',
                                    }}>
                                        {letters.map(l => (
                                            <button
                                                key={l}
                                                onClick={() => letterRefs.current[l]?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                                                style={{
                                                    padding: '0.22rem 0.55rem', borderRadius: 'var(--radius-sm)',
                                                    border: '1px solid var(--border-color)', background: 'var(--color-surface)',
                                                    fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                                    color: 'var(--color-primary)', minWidth: '30px', textAlign: 'center',
                                                }}
                                            >
                                                {l}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Supply list */}
                                <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: totalItems > 0 ? '80px' : 0 }}>
                                    {letters.length === 0 ? (
                                        <p style={{ padding: '1.5rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                            No se encontraron insumos.
                                        </p>
                                    ) : letters.map((letter, li) => (
                                        <div key={letter} ref={el => letterRefs.current[letter] = el}>
                                            <div style={{
                                                padding: '0.45rem 1.25rem',
                                                background: 'var(--color-muted-surface)',
                                                borderBottom: '1px solid var(--border-color)',
                                                fontWeight: 700, fontSize: '0.78rem',
                                                color: 'var(--text-muted)', letterSpacing: '0.08em',
                                            }}>
                                                {letter}
                                            </div>
                                            {groupedByLetter[letter].map((supply, idx) => {
                                                const qty = items[supply.id] || 0;
                                                const isLast = idx === groupedByLetter[letter].length - 1 && li === letters.length - 1;
                                                return (
                                                    <div
                                                        key={supply.id}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                            padding: '0.65rem 1.25rem',
                                                            borderBottom: isLast ? 'none' : '1px solid var(--border-color)',
                                                            background: qty > 0 ? 'var(--color-primary-light)' : 'var(--color-surface)',
                                                            transition: 'background 0.15s',
                                                        }}
                                                    >
                                                        <div style={{ flex: 1, minWidth: 0 }}>
                                                            <div style={{ fontWeight: qty > 0 ? 600 : 400, fontSize: '0.93rem' }}>
                                                                {supply.nombre}
                                                            </div>
                                                            {supply.unidad && (
                                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{supply.unidad}</div>
                                                            )}
                                                        </div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}>
                                                            {qty > 0 && (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => setQty(supply.id, qty - 1)}
                                                                        style={{
                                                                            width: '30px', height: '30px', borderRadius: '50%',
                                                                            border: '1px solid var(--border-color)',
                                                                            background: 'var(--color-surface)', cursor: 'pointer',
                                                                            fontSize: '1.1rem', color: 'var(--text-main)',
                                                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                        }}
                                                                    >−</button>
                                                                    <input
                                                                        type="number"
                                                                        min="1"
                                                                        value={qty}
                                                                        onChange={e => setQty(supply.id, e.target.value)}
                                                                        style={{
                                                                            width: '42px', textAlign: 'center',
                                                                            padding: '0.28rem 0.2rem',
                                                                            borderRadius: 'var(--radius-sm)',
                                                                            border: '1px solid var(--color-primary)',
                                                                            fontSize: '0.88rem', fontWeight: 700,
                                                                            background: 'var(--color-surface)',
                                                                            color: 'var(--text-main)',
                                                                        }}
                                                                    />
                                                                </>
                                                            )}
                                                            <button
                                                                type="button"
                                                                onClick={() => setQty(supply.id, qty + 1)}
                                                                style={{
                                                                    width: '30px', height: '30px', borderRadius: '50%',
                                                                    border: 'none',
                                                                    background: qty > 0 ? 'var(--color-primary)' : 'var(--border-color)',
                                                                    color: qty > 0 ? '#fff' : 'var(--text-muted)',
                                                                    fontSize: '1.15rem', cursor: 'pointer',
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                    transition: 'all 0.15s',
                                                                }}
                                                            >+</button>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>

                                {/* Floating FAB */}
                                {totalItems > 0 && (
                                    <div style={{ position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)', zIndex: 1000 }}>
                                        <button
                                            className="btn btn-primary"
                                            onClick={goToStep3}
                                            style={{
                                                padding: '0.85rem 1.75rem', borderRadius: 'var(--radius-full)',
                                                fontWeight: 700, fontSize: '0.97rem',
                                                boxShadow: '0 8px 24px rgba(0,180,216,0.4)',
                                                display: 'flex', alignItems: 'center', gap: '0.55rem',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            <span style={{
                                                background: '#fff', color: 'var(--color-primary)',
                                                borderRadius: '50%', width: '22px', height: '22px',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                fontSize: '0.78rem', fontWeight: 800, flexShrink: 0,
                                            }}>
                                                {totalItems}
                                            </span>
                                            Revisar pedido →
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── STEP 3: Revisión ── */}
                        {step === 3 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div className="card" style={{ padding: '1.25rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                        <button
                                            className="btn btn-secondary"
                                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', flexShrink: 0 }}
                                            onClick={() => setStep(2)}
                                        >
                                            ← Volver
                                        </button>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>Revisión del pedido</div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{selectedService?.name}</div>
                                        </div>
                                    </div>

                                    {selectedSupplies.length === 0 ? (
                                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No hay insumos seleccionados.</p>
                                    ) : (
                                        <div>
                                            {selectedSupplies.map((supply, idx) => (
                                                <div
                                                    key={supply.id}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '0.75rem',
                                                        padding: '0.65rem 0',
                                                        borderBottom: idx < selectedSupplies.length - 1 ? '1px solid var(--border-color)' : 'none',
                                                    }}
                                                >
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <span style={{ fontWeight: 500, fontSize: '0.93rem' }}>{supply.nombre}</span>
                                                        {supply.unidad && (
                                                            <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginLeft: '0.3rem' }}>
                                                                ({supply.unidad})
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setQty(supply.id, items[supply.id] - 1)}
                                                            style={{
                                                                width: '28px', height: '28px', borderRadius: '50%',
                                                                border: '1px solid var(--border-color)',
                                                                background: 'var(--color-surface)', cursor: 'pointer',
                                                                fontSize: '1rem', color: 'var(--text-main)',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            }}
                                                        >−</button>
                                                        <span style={{ fontWeight: 700, fontSize: '1rem', minWidth: '28px', textAlign: 'center' }}>
                                                            {items[supply.id]}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setQty(supply.id, items[supply.id] + 1)}
                                                            style={{
                                                                width: '28px', height: '28px', borderRadius: '50%',
                                                                border: 'none', background: 'var(--color-primary)',
                                                                color: '#fff', cursor: 'pointer', fontSize: '1rem',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            }}
                                                        >+</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <button
                                    className="btn btn-primary"
                                    style={{ width: '100%', minHeight: '48px', fontWeight: 700 }}
                                    onClick={() => setStep(4)}
                                    disabled={selectedSupplies.length === 0}
                                >
                                    Continuar ({totalItems} insumo{totalItems !== 1 ? 's' : ''}) →
                                </button>
                            </div>
                        )}

                        {/* ── STEP 4: Confirmar ── */}
                        {step === 4 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div className="card" style={{ padding: '1.25rem' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                        <button
                                            className="btn btn-secondary"
                                            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem', flexShrink: 0 }}
                                            onClick={() => setStep(3)}
                                        >
                                            ← Volver
                                        </button>
                                        <div>
                                            <div style={{ fontWeight: 600 }}>Confirmar pedido</div>
                                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                                                {selectedService?.name} · {totalItems} insumo{totalItems !== 1 ? 's' : ''}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="form-group" style={{ marginBottom: '1rem' }}>
                                        <label>
                                            Notas{' '}
                                            <span style={{ color: 'var(--text-muted)', fontWeight: 400, fontSize: '0.85rem' }}>(opcional)</span>
                                        </label>
                                        <textarea
                                            value={notes}
                                            onChange={e => setNotes(e.target.value)}
                                            placeholder="Aclaraciones sobre el pedido..."
                                            rows={3}
                                            style={{ width: '100%', resize: 'vertical' }}
                                        />
                                    </div>

                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', userSelect: 'none' }}>
                                        <input
                                            type="checkbox"
                                            checked={urgent}
                                            onChange={e => setUrgent(e.target.checked)}
                                            style={{ width: '18px', height: '18px', accentColor: 'var(--error)', cursor: 'pointer' }}
                                        />
                                        <span style={{ fontWeight: 500 }}>Marcar como urgente</span>
                                        {urgent && (
                                            <span className="badge badge-warning" style={{ fontSize: '0.7rem' }}>URGENTE</span>
                                        )}
                                    </label>
                                </div>

                                <button
                                    type="button"
                                    className="btn btn-primary"
                                    style={{ width: '100%', minHeight: '52px', fontSize: '1rem', fontWeight: 700 }}
                                    onClick={handleSubmit}
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? 'Enviando...' : 'Enviar pedido'}
                                </button>
                            </div>
                        )}
                    </>
                )}
            </div>
        </MainLayout>
    );
}
