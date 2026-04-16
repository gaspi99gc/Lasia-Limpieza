'use client';

import { useState, useEffect, useMemo } from 'react';
import MainLayout from '@/components/MainLayout';

export default function ConfigPage() {
    const [configTab, setConfigTab] = useState('supervisors');
    const [editingEntity, setEditingEntity] = useState(null);
    const [formData, setFormData] = useState({});

    const [supervisors, setSupervisors] = useState([]);
    const [services, setServices] = useState([]);
    const [supplies, setSupplies] = useState([]);
    const [appUsers, setAppUsers] = useState([]);

    // Recorridos state
    const [selectedSupervisorForRoute, setSelectedSupervisorForRoute] = useState('');
    const [currentRoute, setCurrentRoute] = useState([]);
    const [availableServices, setAvailableServices] = useState([]);
    const [routeMessage, setRouteMessage] = useState(null);
    const [serviceSearchTerm, setServiceSearchTerm] = useState('');
    const [routeServiceSearchTerm, setRouteServiceSearchTerm] = useState('');
    const [serviceGeoState, setServiceGeoState] = useState({
        loading: false,
        text: '',
        type: 'idle',
        isValidated: false,
        validatedAddress: '',
        candidateId: '',
    });
    const [serviceCandidates, setServiceCandidates] = useState([]);

    useEffect(() => {
        const load = async () => {
            try {
                const [supRes, servRes, supListRes, usersRes] = await Promise.all([
                    fetch('/api/supervisors'),
                    fetch('/api/services'),
                    fetch('/api/supplies'),
                    fetch('/api/app-users')
                ]);
                if (supRes.ok) setSupervisors(await supRes.json());
                if (servRes.ok) setServices(await servRes.json());
                if (supListRes.ok) setSupplies(await supListRes.json());
                if (usersRes.ok) setAppUsers(await usersRes.json());
            } catch (err) {
                console.error(err);
            }
        };
        load();
    }, []);

    // Load route when supervisor selected
    useEffect(() => {
        if (!selectedSupervisorForRoute) {
            setCurrentRoute([]);
            return;
        }
        const loadRoute = async () => {
            try {
                const res = await fetch(`/api/supervisor-routes?supervisor_id=${selectedSupervisorForRoute}`);
                if (res.ok) {
                    const data = await res.json();
                    setCurrentRoute(data);
                }
            } catch (err) {
                console.error(err);
            }
        };
        loadRoute();
    }, [selectedSupervisorForRoute]);

    // Update available services (exclude already in route)
    useEffect(() => {
        const routeServiceIds = currentRoute.map(r => r.service_id);
        setAvailableServices(services.filter(s => !routeServiceIds.includes(s.id)));
    }, [currentRoute, services]);

    const getSearchableText = (value) => {
        return (value || '')
            .toString()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    };

    const geocodeServiceAddress = async (address) => {
        const res = await fetch('/api/geocode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address })
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(data.error || 'No se pudo ubicar la direccion ingresada.');
        }

        return data.candidates || [];
    };

    const closeModal = () => {
        setEditingEntity(null);
        setServiceCandidates([]);
        setServiceGeoState({
            loading: false,
            text: '',
            type: 'idle',
            isValidated: false,
            validatedAddress: '',
            candidateId: '',
        });
    };

    const openModal = (type, data = null) => {
        setEditingEntity({ type, data });
        setServiceCandidates([]);
        if (type === 'supervisor') {
            setFormData(data ? {
                ...data,
                login_enabled: data.login_enabled !== false,
                password: '',
                confirmPassword: '',
            } : {
                name: '',
                surname: '',
                dni: '',
                login_enabled: true,
                password: '',
                confirmPassword: '',
            });
            setServiceGeoState({ loading: false, text: '', type: 'idle', isValidated: false, validatedAddress: '', candidateId: '' });
        } else if (type === 'user') {
            setFormData(data ? {
                ...data,
                username: data.username || '',
                login_enabled: data.login_enabled !== false,
                password: '',
                confirmPassword: '',
            } : {
                name: '',
                surname: '',
                username: '',
                role: 'supervisor',
                login_enabled: true,
                password: '',
                confirmPassword: '',
            });
            setServiceGeoState({ loading: false, text: '', type: 'idle', isValidated: false, validatedAddress: '', candidateId: '' });
        } else if (type === 'service') {
            const hasSavedLocation = Boolean(data?.address && data?.lat && data?.lng);
            setFormData(data ? {
                ...data,
                lat: data.lat ?? '',
                lng: data.lng ?? '',
                geocodeCandidateId: '',
            } : { name: '', address: '', lat: '', lng: '', geocodeCandidateId: '' });
            setServiceGeoState({
                loading: false,
                text: hasSavedLocation
                    ? 'Direccion actual cargada. Si la cambias, validala de nuevo dentro de AMBA.'
                    : 'Validá la direccion exacta dentro de AMBA antes de guardar.',
                type: 'info',
                isValidated: hasSavedLocation,
                validatedAddress: data?.address || '',
                candidateId: '',
            });
        } else if (type === 'supply') {
            setFormData(data || { nombre: '', unidad: '', activo: true });
            setServiceGeoState({ loading: false, text: '', type: 'idle', isValidated: false, validatedAddress: '', candidateId: '' });
        }
    };

    const handleServiceAddressChange = (value) => {
        const normalizedValue = value.trim();
        const keepValidatedAddress = normalizedValue && normalizedValue === serviceGeoState.validatedAddress;

        setFormData(prev => ({
            ...prev,
            address: value,
            lat: keepValidatedAddress ? prev.lat : '',
            lng: keepValidatedAddress ? prev.lng : '',
            geocodeCandidateId: keepValidatedAddress ? serviceGeoState.candidateId : '',
        }));

        if (keepValidatedAddress) {
            return;
        }

        setServiceCandidates([]);
        setServiceGeoState({
            loading: false,
            text: normalizedValue ? 'La direccion cambio. Validala y elegi una coincidencia exacta dentro de AMBA.' : '',
            type: normalizedValue ? 'info' : 'idle',
            isValidated: false,
            validatedAddress: '',
            candidateId: '',
        });
    };

    const handleLookupServiceAddress = async () => {
        if (!formData.address?.trim()) {
            setServiceCandidates([]);
            setServiceGeoState({ loading: false, text: 'Ingresá la direccion exacta para ubicar el servicio.', type: 'error', isValidated: false, validatedAddress: '', candidateId: '' });
            return;
        }

        try {
            setServiceGeoState({ loading: true, text: 'Buscando direcciones exactas en AMBA...', type: 'info', isValidated: false, validatedAddress: '', candidateId: '' });
            const candidates = await geocodeServiceAddress(formData.address);
            setServiceCandidates(candidates);
            setServiceGeoState({
                loading: false,
                text: candidates.length === 1
                    ? 'Encontramos 1 direccion exacta en AMBA. Seleccionala para guardar.'
                    : `Encontramos ${candidates.length} direcciones exactas en AMBA. Elegi una para guardar.`,
                type: 'info',
                isValidated: false,
                validatedAddress: '',
                candidateId: '',
            });
        } catch (error) {
            setServiceCandidates([]);
            setFormData(prev => ({ ...prev, lat: '', lng: '', geocodeCandidateId: '' }));
            setServiceGeoState({ loading: false, text: error.message || 'No se pudo ubicar la direccion.', type: 'error', isValidated: false, validatedAddress: '', candidateId: '' });
        }
    };

    const handleSelectServiceCandidate = (candidate) => {
        setServiceCandidates([]);
        setFormData(prev => ({
            ...prev,
            address: candidate.address,
            lat: candidate.lat,
            lng: candidate.lng,
            geocodeCandidateId: candidate.id,
        }));
        setServiceGeoState({
            loading: false,
            text: `Direccion validada en AMBA: ${candidate.address}`,
            type: 'success',
            isValidated: true,
            validatedAddress: candidate.address,
            candidateId: candidate.id,
        });
    };

    const handleSave = async () => {
        const type = editingEntity.type;
        const isEdit = !!editingEntity.data;
        let endpoint = '/api/services';
        if (type === 'supervisor') endpoint = '/api/supervisors';
        else if (type === 'supply') endpoint = '/api/supplies';
        else if (type === 'user') endpoint = '/api/app-users';
        const url = isEdit ? `${endpoint}/${editingEntity.data.id}` : endpoint;
        const method = isEdit ? 'PUT' : 'POST';
        let payload = formData;

        try {
            if (type === 'supervisor') {
                if (!formData.name?.trim() || !formData.surname?.trim() || !formData.dni?.toString().trim()) {
                    alert('Completá nombre, apellido y DNI del supervisor.');
                    return;
                }

                if (!isEdit && !formData.password) {
                    alert('Definí una contraseña inicial para el supervisor.');
                    return;
                }

                if (formData.password && formData.password.length < 6) {
                    alert('La contraseña debe tener al menos 6 caracteres.');
                    return;
                }

                if ((formData.password || formData.confirmPassword) && formData.password !== formData.confirmPassword) {
                    alert('Las contraseñas no coinciden.');
                    return;
                }

                payload = {
                    name: formData.name.trim(),
                    surname: formData.surname.trim(),
                    dni: formData.dni.toString().trim(),
                    login_enabled: formData.login_enabled !== false,
                    password: formData.password || undefined,
                };
            } else if (type === 'user') {
                if (!formData.name?.trim() || !formData.surname?.trim() || !formData.username?.toString().trim()) {
                    alert('Completá nombre, apellido y DNI del usuario.');
                    return;
                }

                if (!isEdit && !formData.password) {
                    alert('Definí una contraseña inicial para el usuario.');
                    return;
                }

                if (formData.password && formData.password.length < 6) {
                    alert('La contraseña debe tener al menos 6 caracteres.');
                    return;
                }

                if ((formData.password || formData.confirmPassword) && formData.password !== formData.confirmPassword) {
                    alert('Las contraseñas no coinciden.');
                    return;
                }

                if (!['admin', 'purchases', 'supervisor'].includes(formData.role)) {
                    alert('Seleccioná un rol válido.');
                    return;
                }

                payload = {
                    username: formData.username.toString().trim(),
                    name: formData.name.trim(),
                    surname: formData.surname.trim(),
                    role: formData.role,
                    login_enabled: formData.login_enabled !== false,
                    password: formData.password || undefined,
                };
            } else if (type === 'service') {
                if (!formData.name?.trim()) {
                    alert('Ingresá el nombre del servicio.');
                    return;
                }

                if (!formData.address?.trim()) {
                    alert('Ingresá la direccion exacta del servicio.');
                    return;
                }

                if (!serviceGeoState.isValidated || serviceGeoState.validatedAddress !== formData.address.trim()) {
                    alert('Validá la direccion y elegí una coincidencia exacta dentro de AMBA antes de guardar.');
                    return;
                }

                payload = {
                    ...formData,
                    name: formData.name.trim(),
                    address: formData.address.trim(),
                    geocodeCandidateId: serviceGeoState.candidateId || formData.geocodeCandidateId || '',
                };
                setFormData(payload);
                setServiceGeoState(prev => ({ ...prev, loading: true, text: 'Guardando servicio con direccion validada...', type: 'info' }));
            }

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json().catch(() => ({}));

            if (res.ok) {
                if (type === 'supervisor') {
                    const savedSupervisor = data.id ? data : { ...payload, id: editingEntity.data?.id };
                    if (isEdit) {
                        setSupervisors(supervisors.map(s => s.id === editingEntity.data.id ? savedSupervisor : s));
                    } else {
                        setSupervisors([...supervisors, savedSupervisor]);
                    }
                } else if (type === 'service') {
                    const savedService = data.id ? data : { ...payload, id: editingEntity.data?.id };
                    if (isEdit) {
                        setServices(services.map(s => s.id === editingEntity.data.id ? savedService : s));
                        setCurrentRoute(currentRoute.map(route => route.service_id === savedService.id ? {
                            ...route,
                            service_name: savedService.name,
                            service_address: savedService.address,
                            lat: savedService.lat,
                            lng: savedService.lng
                        } : route));
                    } else {
                        setServices([...services, savedService]);
                    }
                } else if (type === 'supply') {
                    if (isEdit) {
                        setSupplies(supplies.map(s => s.id === editingEntity.data.id ? { ...s, ...payload } : s));
                    } else {
                        setSupplies([...supplies, data]);
                    }
                } else if (type === 'user') {
                    if (isEdit) {
                        setAppUsers(appUsers.map(u => u.id === editingEntity.data.id ? data : u));
                    } else {
                        setAppUsers([...appUsers, data]);
                    }
                }
                closeModal();
            } else {
                if (type === 'service') {
                    setServiceGeoState(prev => ({ ...prev, loading: false, text: data.error || prev.text, type: 'error' }));
                }
                alert(data.error || 'Error al guardar');
            }
        } catch (err) {
            console.error(err);
            if (type === 'service') {
                setServiceGeoState(prev => ({ ...prev, loading: false, text: err.message || 'No se pudo validar la direccion.', type: 'error' }));
            }
            alert(err.message || 'Error de red');
        }
    };

    const handleDelete = async (type, id) => {
        const label = type === 'supervisor' ? 'supervisor' : type === 'service' ? 'servicio' : type === 'user' ? 'usuario' : 'insumo';
        if (!confirm(`¿Estás seguro de eliminar este ${label}?`)) return;

        const endpoint = type === 'supervisor' ? `/api/supervisors/${id}` : type === 'service' ? `/api/services/${id}` : type === 'user' ? `/api/app-users/${id}` : `/api/supplies/${id}`;
        try {
            const res = await fetch(endpoint, { method: 'DELETE' });
            if (res.ok) {
                if (type === 'supervisor') {
                    setSupervisors(supervisors.filter(s => s.id !== id));
                } else if (type === 'service') {
                    setServices(services.filter(s => s.id !== id));
                } else if (type === 'supply') {
                    setSupplies(supplies.filter(s => s.id !== id));
                } else if (type === 'user') {
                    setAppUsers(appUsers.filter(u => u.id !== id));
                }
            } else {
                alert('No se pudo eliminar');
            }
        } catch (err) {
            console.error(err);
        }
    };

    // Route management functions
    const addToRoute = (serviceId) => {
        const service = services.find(s => s.id === parseInt(serviceId));
        if (!service) return;
        setCurrentRoute([...currentRoute, {
            service_id: service.id,
            service_name: service.name,
            service_address: service.address,
            lat: service.lat,
            lng: service.lng,
            route_order: currentRoute.length + 1,
        }]);
    };

    const removeFromRoute = (index) => {
        const newRoute = currentRoute.filter((_, i) => i !== index).map((r, i) => ({
            ...r,
            route_order: i + 1,
        }));
        setCurrentRoute(newRoute);
    };

    const moveInRoute = (index, direction) => {
        const newRoute = [...currentRoute];
        const targetIdx = index + direction;
        if (targetIdx < 0 || targetIdx >= newRoute.length) return;
        [newRoute[index], newRoute[targetIdx]] = [newRoute[targetIdx], newRoute[index]];
        setCurrentRoute(newRoute.map((r, i) => ({ ...r, route_order: i + 1 })));
    };

    const saveRoute = async () => {
        if (!selectedSupervisorForRoute) return;
        setRouteMessage(null);
        try {
            const res = await fetch('/api/supervisor-routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    supervisor_id: parseInt(selectedSupervisorForRoute),
                    services: currentRoute.map((r, i) => ({
                        service_id: r.service_id,
                        route_order: i + 1,
                    })),
                }),
            });

            if (res.ok) {
                setRouteMessage({ text: 'Recorrido guardado correctamente.', type: 'success' });
            } else {
                setRouteMessage({ text: 'Error al guardar el recorrido.', type: 'error' });
            }
        } catch (err) {
            setRouteMessage({ text: 'Error de red.', type: 'error' });
        }
    };

    const tabs = [
        { key: 'users', label: 'Usuarios' },
        { key: 'supervisors', label: 'Supervisores' },
        { key: 'services', label: 'Servicios' },
        { key: 'supplies', label: 'Insumos' },
        { key: 'routes', label: 'Recorridos' },
    ];

    const filteredServices = useMemo(() => {
        const normalizedSearch = getSearchableText(serviceSearchTerm);

        if (!normalizedSearch) return services;

        return services.filter(service => {
            const haystack = getSearchableText(`${service.name} ${service.address}`);
            return haystack.includes(normalizedSearch);
        });
    }, [serviceSearchTerm, services]);

    const filteredAvailableServices = useMemo(() => {
        const normalizedSearch = getSearchableText(routeServiceSearchTerm);

        if (!normalizedSearch) return availableServices;

        return availableServices.filter(service => {
            const haystack = getSearchableText(`${service.name} ${service.address}`);
            return haystack.includes(normalizedSearch);
        });
    }, [availableServices, routeServiceSearchTerm]);

    return (
        <MainLayout>
            <div className="config-view">
                <header className="page-header" style={{ marginBottom: '2rem' }}>
                    <div>
                        <h1>Configuración del Sistema</h1>
                        <p style={{ color: 'var(--text-muted)' }}>Gestión de recursos y acceso</p>
                    </div>
                    <div className="tabs tabs-scroll segmented-shell">
                        {tabs.map(tab => (
                            <button
                                key={tab.key}
                                className={`btn ${configTab === tab.key ? 'btn-primary' : 'btn-secondary'}`}
                                onClick={() => setConfigTab(tab.key)}
                                style={{ boxShadow: configTab === tab.key ? '' : 'none' }}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </header>

                {/* ============ USUARIOS ============ */}
                {configTab === 'users' ? (
                    <div className="card" style={{ padding: 0 }}>
                        <div className="page-header" style={{ padding: '1.5rem' }}>
                            <h3>Usuarios del Sistema</h3>
                            <button className="btn btn-primary" onClick={() => openModal('user')}>+ Crear Usuario</button>
                        </div>
                        <div className="table-container">
                            <table className="table mobile-cards-table">
                                <thead>
                                    <tr>
                                        <th>Nombre completo</th>
                                        <th>Usuario (DNI)</th>
                                        <th>Rol</th>
                                        <th>Acceso</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {appUsers.map(u => (
                                        <tr key={u.id}>
                                            <td data-label="Nombre completo"><strong>{u.surname}, {u.name}</strong></td>
                                            <td data-label="Usuario (DNI)">
                                                <strong>{u.username}</strong>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Usuario de inicio de sesión</div>
                                            </td>
                                            <td data-label="Rol">
                                                <span className="badge badge-info">
                                                    {u.role === 'admin' ? 'Administrador' : u.role === 'purchases' ? 'Compras' : 'Supervisor'}
                                                </span>
                                            </td>
                                            <td data-label="Acceso">
                                                <span className={`badge ${u.login_enabled ? 'badge-success' : 'badge-danger'}`}>
                                                    {u.login_enabled ? 'Habilitado' : 'Bloqueado'}
                                                </span>
                                            </td>
                                            <td data-label="Acciones" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                                <div className="table-action-group">
                                                    <button className="btn btn-secondary" onClick={() => openModal('user', u)}>✏️</button>
                                                    <button className="btn btn-secondary" style={{ color: 'var(--error)' }} onClick={() => handleDelete('user', u.id)}>🗑️</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    /* ============ SUPERVISORES ============ */
                ) : configTab === 'supervisors' ? (
                    <div className="card" style={{ padding: 0 }}>
                        <div className="page-header" style={{ padding: '1.5rem' }}>
                            <h3>Lista de Supervisores</h3>
                            <button className="btn btn-primary" onClick={() => openModal('supervisor')}>+ Añadir Supervisor</button>
                        </div>
                        <div className="table-container">
                            <table className="table mobile-cards-table">
                                <thead>
                                    <tr>
                                        <th>Nombre completo</th>
                                        <th>Usuario</th>
                                        <th>Acceso</th>
                                        <th>Contraseña</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {supervisors.map(s => (
                                        <tr key={s.id}>
                                            <td data-label="Nombre completo"><strong>{s.surname}, {s.name}</strong></td>
                                            <td data-label="Usuario">
                                                <strong>{s.dni}</strong>
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Usuario de inicio de sesión</div>
                                            </td>
                                            <td data-label="Acceso">
                                                <span className={`badge ${s.login_enabled ? 'badge-success' : 'badge-danger'}`}>
                                                    {s.login_enabled ? 'Habilitado' : 'Bloqueado'}
                                                </span>
                                            </td>
                                            <td data-label="Contraseña">
                                                <span className={`badge ${s.has_password ? 'badge-success' : 'badge-warning'}`}>
                                                    {s.has_password ? 'Configurada' : 'Pendiente'}
                                                </span>
                                            </td>
                                            <td data-label="Acciones" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                                <div className="table-action-group">
                                                    <button className="btn btn-secondary" onClick={() => openModal('supervisor', s)}>✏️</button>
                                                    <button className="btn btn-secondary" style={{ color: 'var(--error)' }} onClick={() => handleDelete('supervisor', s.id)}>🗑️</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    /* ============ SERVICIOS ============ */
                ) : configTab === 'services' ? (
                    <div className="card" style={{ padding: 0 }}>
                        <div className="page-header" style={{ padding: '1.5rem' }}>
                            <h3>Lista de Servicios</h3>
                            <button className="btn btn-primary" onClick={() => openModal('service')}>+ Añadir Servicio</button>
                        </div>
                        <div style={{ padding: '0 1.5rem 1rem' }}>
                            <input
                                type="text"
                                placeholder="Buscar por nombre o direccion..."
                                value={serviceSearchTerm}
                                onChange={(e) => setServiceSearchTerm(e.target.value)}
                                className="card"
                                style={{ margin: 0, width: '100%' }}
                            />
                        </div>
                        <div className="table-container">
                            <table className="table mobile-cards-table">
                                <thead>
                                    <tr>
                                        <th>Servicio</th>
                                        <th>Ubicación</th>
                                        <th>Coordenadas</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredServices.map(s => (
                                        <tr key={s.id}>
                                            <td data-label="Servicio"><strong>{s.name}</strong></td>
                                            <td data-label="Ubicación">{s.address}</td>
                                            <td data-label="Coordenadas" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                {s.lat && s.lng ? `${Number(s.lat)?.toFixed(4)}, ${Number(s.lng)?.toFixed(4)}` : (
                                                    <span style={{ color: 'var(--warning)', fontWeight: 600 }}>⚠️ Sin GPS</span>
                                                )}
                                            </td>
                                            <td data-label="Acciones" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                                <div className="table-action-group">
                                                    <button className="btn btn-secondary" onClick={() => openModal('service', s)}>✏️</button>
                                                    <button className="btn btn-secondary" style={{ color: 'var(--error)' }} onClick={() => handleDelete('service', s.id)}>🗑️</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredServices.length === 0 && (
                                        <tr>
                                            <td data-label="" colSpan="4" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)' }}>
                                                {serviceSearchTerm ? 'No se encontraron servicios con esa busqueda.' : 'No hay servicios cargados todavia.'}
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    /* ============ INSUMOS ============ */
                ) : configTab === 'supplies' ? (
                    <div className="card" style={{ padding: 0 }}>
                        <div className="page-header" style={{ padding: '1.5rem' }}>
                            <h3>Lista Fija de Insumos</h3>
                            <button className="btn btn-primary" onClick={() => openModal('supply')}>+ Añadir Insumo</button>
                        </div>
                        <div className="table-container">
                            <table className="table mobile-cards-table">
                                <thead>
                                    <tr>
                                        <th>Insumo</th>
                                        <th>Unidad de Medida</th>
                                        <th>Estado</th>
                                        <th style={{ textAlign: 'right' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {supplies.map(s => (
                                        <tr key={s.id}>
                                            <td data-label="Insumo"><strong>{s.nombre}</strong></td>
                                            <td data-label="Unidad de Medida">{s.unidad}</td>
                                            <td data-label="Estado">
                                                <span className={`badge ${s.activo ? 'badge-success' : 'badge-danger'}`}>
                                                    {s.activo ? 'Activo' : 'Inactivo'}
                                                </span>
                                            </td>
                                            <td data-label="Acciones" className="mobile-hide-label" style={{ textAlign: 'right' }}>
                                                <div className="table-action-group">
                                                    <button className="btn btn-secondary" onClick={() => openModal('supply', s)}>✏️</button>
                                                    <button className="btn btn-secondary" style={{ color: 'var(--error)' }} onClick={() => handleDelete('supply', s.id)}>🗑️</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    /* ============ RECORRIDOS ============ */
                ) : configTab === 'routes' ? (
                    <div>
                        <div className="card">
                            <h3 style={{ marginBottom: '1.5rem' }}>📋 Asignar Recorrido a Supervisor</h3>
                            <div className="form-group">
                                <label>Seleccionar Supervisor:</label>
                                <select
                                    value={selectedSupervisorForRoute}
                                    onChange={(e) => setSelectedSupervisorForRoute(e.target.value)}
                                    style={{ width: '100%', padding: '0.75rem', fontSize: '1rem' }}
                                >
                                    <option value="">-- Elegí un supervisor --</option>
                                    {supervisors.map(s => (
                                        <option key={s.id} value={s.id}>{s.surname}, {s.name} (DNI: {s.dni})</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {selectedSupervisorForRoute && (
                            <>
                                {/* Current Route */}
                                <div className="card">
                                    <div className="page-header" style={{ marginBottom: '1rem' }}>
                                        <h3>🗺️ Recorrido Actual</h3>
                                        <button
                                            className="btn btn-primary"
                                            onClick={saveRoute}
                                            style={{ gap: '0.4rem' }}
                                        >
                                            💾 Guardar Recorrido
                                        </button>
                                    </div>

                                    {routeMessage && (
                                        <div style={{
                                            padding: '0.75rem',
                                            borderRadius: 'var(--radius-sm)',
                                            marginBottom: '1rem',
                                            background: routeMessage.type === 'success' ? '#DCFCE7' : '#FEE2E2',
                                            color: routeMessage.type === 'success' ? '#166534' : '#991B1B',
                                            fontWeight: 500,
                                            textAlign: 'center',
                                        }}>
                                            {routeMessage.text}
                                        </div>
                                    )}

                                    {currentRoute.length === 0 ? (
                                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                            <p>No hay servicios asignados. Agregá servicios desde la lista de abajo.</p>
                                        </div>
                                    ) : (
                                        <div>
                                            {currentRoute.map((r, idx) => (
                                                <div key={`${r.service_id}-${idx}`} className="route-item" style={{
                                                    padding: '0.85rem 1rem',
                                                    background: idx % 2 === 0 ? 'var(--color-muted-surface)' : 'var(--color-surface)',
                                                    borderRadius: 'var(--radius-sm)',
                                                    marginBottom: '0.35rem',
                                                    border: '1px solid var(--border-color)',
                                                }}>
                                                    <div style={{
                                                        width: '32px',
                                                        height: '32px',
                                                        borderRadius: '50%',
                                                        background: 'var(--color-primary)',
                                                        color: '#fff',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        fontWeight: 700,
                                                        fontSize: '0.85rem',
                                                        flexShrink: 0,
                                                    }}>
                                                        {idx + 1}
                                                    </div>
                                                    <div className="route-item-main">
                                                        <strong>{r.service_name}</strong>
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                            {r.service_address || 'Sin dirección'}
                                                            {r.lat && r.lng && (
                                                                <span> • GPS: {Number(r.lat).toFixed(4)}, {Number(r.lng).toFixed(4)}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="route-item-actions" style={{ gap: '0.25rem' }}>
                                                        <button
                                                            className="btn btn-secondary"
                                                            style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                                                            onClick={() => moveInRoute(idx, -1)}
                                                            disabled={idx === 0}
                                                            title="Subir"
                                                        >
                                                            ⬆️
                                                        </button>
                                                        <button
                                                            className="btn btn-secondary"
                                                            style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem' }}
                                                            onClick={() => moveInRoute(idx, 1)}
                                                            disabled={idx === currentRoute.length - 1}
                                                            title="Bajar"
                                                        >
                                                            ⬇️
                                                        </button>
                                                        <button
                                                            className="btn btn-secondary"
                                                            style={{ padding: '0.3rem 0.5rem', fontSize: '0.8rem', color: 'var(--error)' }}
                                                            onClick={() => removeFromRoute(idx)}
                                                            title="Quitar"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Available Services */}
                                <div className="card">
                                    <div className="flex-between" style={{ gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                        <h3 style={{ margin: 0 }}>➕ Agregar Servicio al Recorrido</h3>
                                        <input
                                            type="text"
                                            placeholder="Buscar servicio o direccion..."
                                            value={routeServiceSearchTerm}
                                            onChange={(e) => setRouteServiceSearchTerm(e.target.value)}
                                            className="card"
                                            style={{ margin: 0, width: 'min(360px, 100%)' }}
                                        />
                                    </div>
                                    {availableServices.length === 0 ? (
                                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                                            Todos los servicios ya están en el recorrido.
                                        </p>
                                    ) : filteredAvailableServices.length === 0 ? (
                                        <p style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '1rem' }}>
                                            No hay servicios que coincidan con la búsqueda.
                                        </p>
                                    ) : (
                                        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem' }}>
                                            {filteredAvailableServices.map(s => (
                                                <div key={s.id} className="service-option-card">
                                                    <div>
                                                        <strong>{s.name}</strong>
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                            {s.address || 'Sin dirección'}
                                                        </div>
                                                    </div>
                                                    <button
                                                        className="btn btn-primary"
                                                        style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                                                        onClick={() => addToRoute(s.id)}
                                                    >
                                                        + Agregar
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                ) : null}

                {/* ============ MODAL ============ */}
                {editingEntity && (
                    <div className="modal-overlay">
                        <div className="modal-content">
                            <h2>{editingEntity.data ? 'Editar' : 'Crear'} {editingEntity.type === 'supervisor' ? 'Supervisor' : editingEntity.type === 'service' ? 'Servicio' : editingEntity.type === 'user' ? 'Usuario' : 'Insumo'}</h2>
                            <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {editingEntity.type === 'supervisor' ? (
                                    <>
                                        <div style={{ padding: '0.9rem 1rem', borderRadius: 'var(--radius-sm)', background: 'var(--color-muted-surface)', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                            Usuario de inicio de sesión: <strong style={{ color: 'var(--text-main)' }}>{formData.dni || 'DNI del supervisor'}</strong>. El administrador define y actualiza la contraseña desde esta pantalla.
                                        </div>
                                        <input
                                            type="text" placeholder="Nombre" className="card" style={{ margin: 0 }}
                                            value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        />
                                        <input
                                            type="text" placeholder="Apellido" className="card" style={{ margin: 0 }}
                                            value={formData.surname || ''} onChange={e => setFormData({ ...formData, surname: e.target.value })}
                                        />
                                        <input
                                            type="text" placeholder="DNI" className="card" style={{ margin: 0 }}
                                            value={formData.dni || ''} onChange={e => setFormData({ ...formData, dni: e.target.value })}
                                        />
                                        <div className="supervisor-toggle-row" style={{ padding: '0.9rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--color-surface)' }}>
                                            <div>
                                                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>Acceso habilitado</div>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Si lo desactivás, el supervisor no podrá iniciar sesión.</div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={formData.login_enabled !== false}
                                                onChange={e => setFormData({ ...formData, login_enabled: e.target.checked })}
                                                style={{ width: 'auto', margin: 0, transform: 'scale(1.2)' }}
                                            />
                                        </div>
                                        <input
                                            type="password"
                                            placeholder={editingEntity.data ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'}
                                            className="card"
                                            style={{ margin: 0 }}
                                            value={formData.password || ''}
                                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        />
                                        <input
                                            type="password"
                                            placeholder={editingEntity.data ? 'Confirmar nueva contraseña' : 'Confirmar contraseña'}
                                            className="card"
                                            style={{ margin: 0 }}
                                            value={formData.confirmPassword || ''}
                                            onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                                        />
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                            {editingEntity.data
                                                ? (formData.has_password
                                                    ? 'Dejá la contraseña vacía si querés mantener la actual.'
                                                    : 'Este supervisor todavía no tiene contraseña configurada.')
                                                : 'La contraseña inicial debe tener al menos 6 caracteres.'}
                                        </div>
                                    </>
                                ) : editingEntity.type === 'user' ? (
                                    <>
                                        <div style={{ padding: '0.9rem 1rem', borderRadius: 'var(--radius-sm)', background: 'var(--color-muted-surface)', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                                            El DNI será el nombre de usuario para iniciar sesión.
                                        </div>
                                        <input
                                            type="text" placeholder="Nombre" className="card" style={{ margin: 0 }}
                                            value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        />
                                        <input
                                            type="text" placeholder="Apellido" className="card" style={{ margin: 0 }}
                                            value={formData.surname || ''} onChange={e => setFormData({ ...formData, surname: e.target.value })}
                                        />
                                        <input
                                            type="text" placeholder="DNI (usuario de login)" className="card" style={{ margin: 0 }}
                                            value={formData.username || ''} onChange={e => setFormData({ ...formData, username: e.target.value })}
                                        />
                                        <select
                                            className="card"
                                            style={{ margin: 0, padding: '0.75rem' }}
                                            value={formData.role || 'supervisor'}
                                            onChange={e => setFormData({ ...formData, role: e.target.value })}
                                        >
                                            <option value="supervisor">Supervisor</option>
                                            <option value="admin">Administrador</option>
                                            <option value="purchases">Compras</option>
                                        </select>
                                        <div className="supervisor-toggle-row" style={{ padding: '0.9rem 1rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-color)', background: 'var(--color-surface)' }}>
                                            <div>
                                                <div style={{ fontWeight: 700, color: 'var(--text-main)' }}>Acceso habilitado</div>
                                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Si lo desactivás, el usuario no podrá iniciar sesión.</div>
                                            </div>
                                            <input
                                                type="checkbox"
                                                checked={formData.login_enabled !== false}
                                                onChange={e => setFormData({ ...formData, login_enabled: e.target.checked })}
                                                style={{ width: 'auto', margin: 0, transform: 'scale(1.2)' }}
                                            />
                                        </div>
                                        <input
                                            type="password"
                                            placeholder={editingEntity.data ? 'Nueva contraseña (opcional)' : 'Contraseña inicial'}
                                            className="card"
                                            style={{ margin: 0 }}
                                            value={formData.password || ''}
                                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                                        />
                                        <input
                                            type="password"
                                            placeholder={editingEntity.data ? 'Confirmar nueva contraseña' : 'Confirmar contraseña'}
                                            className="card"
                                            style={{ margin: 0 }}
                                            value={formData.confirmPassword || ''}
                                            onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                                        />
                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                                            {editingEntity.data
                                                ? 'Dejá la contraseña vacía si querés mantener la actual.'
                                                : 'La contraseña inicial debe tener al menos 6 caracteres.'}
                                        </div>
                                    </>
                                ) : editingEntity.type === 'service' ? (
                                    <>
                                        <input
                                            type="text" placeholder="Nombre del Servicio" className="card" style={{ margin: 0 }}
                                            value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        />
                                        <input
                                            type="text" placeholder="Dirección" className="card" style={{ margin: 0 }}
                                            value={formData.address || ''} onChange={e => handleServiceAddressChange(e.target.value)}
                                        />
                                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                            Ingresá calle, altura y localidad. Solo se aceptan direcciones exactas dentro de AMBA.
                                        </p>
                                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                                            <button className="btn btn-secondary" onClick={handleLookupServiceAddress} disabled={serviceGeoState.loading}>
                                                {serviceGeoState.loading ? 'Validando...' : '🧭 Validar direccion AMBA'}
                                            </button>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                                                {formData.lat && formData.lng ? `GPS: ${Number(formData.lat).toFixed(6)}, ${Number(formData.lng).toFixed(6)}` : 'GPS pendiente de validar'}
                                            </div>
                                        </div>
                                        {serviceCandidates.length > 0 ? (
                                            <div style={{ display: 'grid', gap: '0.75rem' }}>
                                                {serviceCandidates.map(candidate => (
                                                    <button
                                                        key={candidate.id}
                                                        type="button"
                                                        onClick={() => handleSelectServiceCandidate(candidate)}
                                                        style={{
                                                            border: '1px solid var(--border-color)',
                                                            borderRadius: 'var(--radius-md)',
                                                            background: 'var(--color-surface)',
                                                            padding: '1rem',
                                                            textAlign: 'left',
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                                            <strong style={{ color: 'var(--text-main)' }}>{candidate.address}</strong>
                                                            <span className="badge badge-success">{candidate.type}</span>
                                                        </div>
                                                        <div style={{ marginTop: '0.4rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                                            {candidate.city || 'AMBA'}{candidate.region ? `, ${candidate.region}` : ''} • Confianza {Math.round(candidate.score)}%
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}
                                        {serviceGeoState.text ? (
                                            <div style={{
                                                padding: '0.85rem 1rem',
                                                borderRadius: 'var(--radius-sm)',
                                                background: serviceGeoState.type === 'success' ? '#DCFCE7' : serviceGeoState.type === 'error' ? '#FEE2E2' : '#E0F2FE',
                                                color: serviceGeoState.type === 'success' ? '#166534' : serviceGeoState.type === 'error' ? '#991B1B' : '#075985',
                                                fontSize: '0.9rem',
                                                lineHeight: 1.5
                                            }}>
                                                {serviceGeoState.text}
                                            </div>
                                        ) : null}
                                    </>
                                ) : editingEntity.type === 'supply' ? (
                                    <>
                                        <input
                                            type="text" placeholder="Nombre del Insumo (ej: Lavandina)" className="card" style={{ margin: 0 }}
                                            value={formData.nombre || ''} onChange={e => setFormData({ ...formData, nombre: e.target.value })}
                                        />
                                        <input
                                            type="text" placeholder="Unidad (ej: litros, unidades)" className="card" style={{ margin: 0 }}
                                            value={formData.unidad || ''} onChange={e => setFormData({ ...formData, unidad: e.target.value })}
                                        />
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                                            <input
                                                type="checkbox"
                                                id="supply-active"
                                                checked={formData.activo === undefined ? true : formData.activo}
                                                onChange={e => setFormData({ ...formData, activo: e.target.checked })}
                                                style={{ width: 'auto', margin: 0 }}
                                            />
                                            <label htmlFor="supply-active" style={{ margin: 0 }}>Insumo Activo</label>
                                        </div>
                                    </>
                                ) : null}
                            </div>
                            <div className="config-modal-actions" style={{ marginTop: '2rem' }}>
                                <button className="btn btn-secondary" onClick={closeModal}>Cancelar</button>
                                <button className="btn btn-primary" onClick={handleSave} disabled={serviceGeoState.loading}>
                                    {serviceGeoState.loading && editingEntity.type === 'service' ? 'Guardando...' : 'Guardar Cambios'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </MainLayout>
    );
}
