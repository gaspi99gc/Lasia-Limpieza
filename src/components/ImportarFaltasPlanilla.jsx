'use client';

import { useRef, useState } from 'react';
import { notify } from '@/lib/toast';

// Importar la hoja AUSENTES del PRESENTISMO desde la app.
//
// Mientras la encargada siga anotando las faltas en la planilla, esa planilla es
// la fuente real. Esto no reemplaza la carga del día a día: convive con ella.
//
// Va en dos pasos a propósito: se elige el archivo, se muestra QUÉ va a pasar, y
// recién ahí se confirma. Cargar a ciegas sobre datos que ya existen es
// exactamente la forma de duplicar todo sin enterarse.

const fmtDM = (ymd) => {
    if (!ymd) return '';
    const [, m, d] = ymd.split('-');
    return `${Number(d)}/${Number(m)}`;
};

export default function ImportarFaltasPlanilla({ onImportado }) {
    const fileRef = useRef(null);
    const [archivo, setArchivo] = useState(null);
    const [previo, setPrevio] = useState(null);
    const [trabajando, setTrabajando] = useState(false);
    const [abierto, setAbierto] = useState(false);
    const [verNombres, setVerNombres] = useState(false);

    const limpiar = () => {
        setArchivo(null);
        setPrevio(null);
        setVerNombres(false);
        if (fileRef.current) fileRef.current.value = '';
    };

    const enviar = async (file, confirmar) => {
        setTrabajando(true);
        try {
            const fd = new FormData();
            fd.append('file', file);
            if (confirmar) fd.append('confirmar', '1');
            const res = await fetch('/api/operativo/faltas/import', {
                method: 'POST', body: fd, credentials: 'include',
            });
            const json = await res.json().catch(() => ({}));
            if (!res.ok) { notify.error(json.error || 'No se pudo leer el archivo.'); return null; }
            return json;
        } catch {
            notify.error('Error de red al importar.');
            return null;
        } finally {
            setTrabajando(false);
        }
    };

    const elegirArchivo = async (file) => {
        if (!file) return;
        setArchivo(file);
        setPrevio(null);
        const json = await enviar(file, false);
        if (json) setPrevio(json);
        else limpiar();
    };

    const confirmar = async () => {
        if (!archivo) return;
        const json = await enviar(archivo, true);
        if (!json) return;
        notify.success(
            json.creadas > 0
                ? `${json.creadas} faltas nuevas cargadas.`
                : 'No había nada nuevo para cargar.'
        );
        limpiar();
        setAbierto(false);
        onImportado?.();
    };

    if (!abierto) {
        return (
            <button
                className="btn btn-secondary"
                onClick={() => setAbierto(true)}
                style={{ marginBottom: '1.25rem' }}
            >
                ⬆ Importar planilla
            </button>
        );
    }

    return (
        <div className="card" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                <h3 style={{ margin: 0, fontSize: '1.05rem' }}>Importar la planilla de ausencias</h3>
                <button
                    onClick={() => { limpiar(); setAbierto(false); }}
                    style={{ marginLeft: 'auto', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '1.2rem', lineHeight: 1 }}
                    title="Cerrar"
                >
                    ✕
                </button>
            </div>

            {/* El PRESENTISMO entero pesa 30 MB y no se puede subir. Que el paso
                de recortar la hoja esté explicado acá evita el intento fallido. */}
            <ol style={{ margin: '0 0 1rem', paddingLeft: '1.2rem', color: 'var(--text-muted)', fontSize: '0.87rem', lineHeight: 1.7 }}>
                <li>Abrí el PRESENTISMO y andá a la pestaña <strong>AUSENTES</strong>.</li>
                <li>Clic derecho en la pestaña → <strong>Mover o copiar</strong> → <strong>(nuevo libro)</strong> → Aceptar.</li>
                <li>Guardalo con cualquier nombre y subilo acá. Se puede repetir las veces que quieras: lo que ya está cargado no se duplica.</li>
            </ol>

            <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={e => elegirArchivo(e.target.files?.[0])}
            />

            {!previo && (
                <button
                    className="btn btn-primary"
                    onClick={() => fileRef.current?.click()}
                    disabled={trabajando}
                >
                    {trabajando ? 'Leyendo el archivo…' : 'Elegir archivo'}
                </button>
            )}

            {previo && (
                <div>
                    <p style={{ margin: '0 0 0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        <strong style={{ color: 'var(--color-text)' }}>{previo.archivo}</strong>
                        {' · '}hoja {previo.hoja}
                        {previo.desde && <> · del {fmtDM(previo.desde)} al {fmtDM(previo.hasta)}</>}
                    </p>

                    {/* Lo que va a pasar, en números. El que confirma tiene que
                        poder ver de un vistazo que no está por duplicar nada. */}
                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
                        <div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1, color: previo.aCargar ? 'var(--color-primary)' : 'var(--text-muted)' }}>
                                {previo.aCargar}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {previo.aCargar === 1 ? 'falta nueva' : 'faltas nuevas'}
                            </div>
                        </div>
                        <div>
                            <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1, color: 'var(--text-muted)' }}>
                                {previo.yaImportadas}
                            </div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ya estaban</div>
                        </div>
                        {previo.yaCargadasPorOperaciones > 0 && (
                            <div>
                                <div style={{ fontSize: '1.7rem', fontWeight: 800, lineHeight: 1, color: 'var(--text-muted)' }}>
                                    {previo.yaCargadasPorOperaciones}
                                </div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>las cargó Operaciones</div>
                            </div>
                        )}
                    </div>

                    {previo.yaCargadasPorOperaciones > 0 && (
                        <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                            Las {previo.yaCargadasPorOperaciones} que ya cargó Operaciones se dejan como están:
                            esas tienen el servicio y el turno, la planilla no.
                        </p>
                    )}

                    {previo.aCargar > 0 && (
                        <div style={{ marginBottom: '0.9rem', fontSize: '0.85rem' }}>
                            <div style={{ color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                                Por mes: {Object.entries(previo.porMes).sort().map(([m, n]) => `${m} (${n})`).join(' · ')}
                                {previo.horas > 0 && ` · ${String(previo.horas).replace('.', ',')} horas`}
                            </div>
                            <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--text-muted)' }}>
                                {previo.muestra.map((r, i) => (
                                    <li key={i}>{fmtDM(r.fecha)} · {r.nombre}{r.horas ? ` · ${String(r.horas).replace('.', ',')} hs` : ''}</li>
                                ))}
                                {previo.aCargar > previo.muestra.length && (
                                    <li style={{ listStyle: 'none', marginLeft: '-1.1rem' }}>…y {previo.aCargar - previo.muestra.length} más</li>
                                )}
                            </ul>
                        </div>
                    )}

                    {/* Los que no matchean con ningún legajo NO se cargan. Decirlo
                        acá evita que alguien crea que entró todo. */}
                    {previo.sinLegajoFilas > 0 && (
                        <div style={{ marginBottom: '0.9rem', fontSize: '0.83rem', color: '#B45309' }}>
                            {previo.sinLegajoFilas} filas no se van a cargar porque el nombre no coincide con ningún
                            legajo ({previo.sinLegajoNombres.length} nombres distintos).{' '}
                            <button
                                onClick={() => setVerNombres(v => !v)}
                                style={{ border: 'none', background: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', textDecoration: 'underline' }}
                            >
                                {verNombres ? 'ocultar' : 'ver quiénes'}
                            </button>
                            {verNombres && (
                                <ul style={{ margin: '0.4rem 0 0', paddingLeft: '1.1rem', maxHeight: '160px', overflowY: 'auto' }}>
                                    {previo.sinLegajoNombres.map(n => <li key={n}>{n}</li>)}
                                </ul>
                            )}
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
                        <button
                            className="btn btn-primary"
                            onClick={confirmar}
                            disabled={trabajando || previo.aCargar === 0}
                        >
                            {trabajando ? 'Cargando…' : previo.aCargar > 0 ? `Cargar ${previo.aCargar}` : 'No hay nada nuevo'}
                        </button>
                        <button className="btn btn-secondary" onClick={limpiar} disabled={trabajando}>
                            Elegir otro archivo
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
