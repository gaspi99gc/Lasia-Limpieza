'use client';

import { useState, useMemo } from 'react';

const LICENSE_TYPES = {
    vacaciones: { label: 'Vacaciones', color: '#3b82f6' },
    enfermedad: { label: 'Enfermedad', color: '#eab308' },
    maternidad: { label: 'Maternidad', color: '#a855f7' },
    paternidad: { label: 'Paternidad', color: '#a855f7' },
    psiquiatrica: { label: 'Psiquiátrica', color: '#ef4444' },
    sin_goce: { label: 'Sin goce', color: '#6b7280' },
};

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

const DAY_NUM_HEIGHT = 26;
const BAR_H = 20;
const BAR_GAP = 3;
const MAX_BARS = 3;
const ROW_HEIGHT = DAY_NUM_HEIGHT + MAX_BARS * (BAR_H + BAR_GAP) + 10;

// Devuelve el "ancla" inicial del período laboral 26→25 para hoy.
// Es una fecha que apunta al día 1 del mes cuyo día 25 marca el fin del período.
// (Ej: hoy 27/05 → ancla 01/06; hoy 20/05 → ancla 01/05.)
function getAnchorForToday() {
    const now = new Date();
    const m = now.getDate() >= 26 ? now.getMonth() + 1 : now.getMonth();
    return new Date(now.getFullYear(), m, 1);
}

const SHORT_MONTHS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

export default function LicensesCalendar({ licenses, onLicenseClick }) {
    // currentDate apunta al "ancla" (1 del mes que cierra el período laboral actual).
    const [currentDate, setCurrentDate] = useState(getAnchorForToday);
    const [hiddenTypes, setHiddenTypes] = useState(new Set());

    const today = new Date().toISOString().split('T')[0];

    // Período laboral: del 26 del mes anterior al ancla, al 25 del mes ancla.
    const periodStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 26);
    const periodEnd   = new Date(currentDate.getFullYear(), currentDate.getMonth(), 25);

    const visibleLicenses = useMemo(() => {
        return licenses
            .map((l) => ({
                ...l,
                start_date: l.start_date?.slice(0, 10),
                end_date: l.end_date?.slice(0, 10),
            }))
            .filter((l) => !hiddenTypes.has(l.type));
    }, [licenses, hiddenTypes]);

    const weeks = useMemo(() => {
        // Padding inicial: celdas vacías para alinear el primer día con la columna del día de la semana.
        const startPadding = periodStart.getDay();
        const totalDays = Math.round((periodEnd - periodStart) / 86400000) + 1;

        const cells = [];
        for (let i = 0; i < startPadding; i++) cells.push(null);
        for (let i = 0; i < totalDays; i++) {
            const d = new Date(periodStart);
            d.setDate(periodStart.getDate() + i);
            cells.push(
                `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
            );
        }
        while (cells.length % 7 !== 0) cells.push(null);

        const result = [];
        for (let i = 0; i < cells.length; i += 7) result.push(cells.slice(i, i + 7));
        return result;
    }, [periodStart, periodEnd]);

    const weeksWithBars = useMemo(() => {
        return weeks.map((week) => {
            const validDates = week.filter(Boolean);
            if (validDates.length === 0) return { week, bars: [], overflow: 0 };

            const weekStart = validDates[0];
            const weekEnd = validDates[validDates.length - 1];

            const overlapping = visibleLicenses
                .filter((l) => l.start_date <= weekEnd && l.end_date >= weekStart)
                .sort((a, b) =>
                    a.start_date.localeCompare(b.start_date) ||
                    a.end_date.localeCompare(b.end_date)
                );

            const bars = overlapping.map((license) => {
                const barStart = license.start_date > weekStart ? license.start_date : weekStart;
                const barEnd = license.end_date < weekEnd ? license.end_date : weekEnd;
                const startCol = week.indexOf(barStart);
                const endCol = week.indexOf(barEnd);
                return {
                    license,
                    startCol: startCol === -1 ? 0 : startCol,
                    endCol: endCol === -1 ? 6 : endCol,
                    continuesBefore: license.start_date < weekStart,
                    continuesAfter: license.end_date > weekEnd,
                };
            });

            return { week, bars: bars.slice(0, MAX_BARS), overflow: Math.max(0, bars.length - MAX_BARS) };
        });
    }, [weeks, visibleLicenses]);

    const toggleType = (type) => {
        setHiddenTypes((prev) => {
            const next = new Set(prev);
            if (next.has(type)) next.delete(type);
            else next.add(type);
            return next;
        });
    };

    const goToPrevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    const goToNextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    const goToToday = () => setCurrentDate(getAnchorForToday());

    const periodLabel = `${periodStart.getDate()} ${SHORT_MONTHS[periodStart.getMonth()]} – ${periodEnd.getDate()} ${SHORT_MONTHS[periodEnd.getMonth()]} ${periodEnd.getFullYear()}`;

    return (
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            {/* Sidebar */}
            <div
                className="card"
                style={{ minWidth: '150px', padding: '1rem', flexShrink: 0 }}
            >
                <p
                    style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        marginBottom: '0.75rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                    }}
                >
                    Tipos
                </p>
                {Object.entries(LICENSE_TYPES).map(([key, type]) => (
                    <label
                        key={key}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            cursor: 'pointer',
                            marginBottom: '0.55rem',
                            fontSize: '0.85rem',
                            userSelect: 'none',
                        }}
                    >
                        <input
                            type="checkbox"
                            checked={!hiddenTypes.has(key)}
                            onChange={() => toggleType(key)}
                            style={{ accentColor: type.color, width: 14, height: 14, flexShrink: 0 }}
                        />
                        <span
                            style={{
                                width: 10,
                                height: 10,
                                borderRadius: 2,
                                background: type.color,
                                flexShrink: 0,
                                opacity: hiddenTypes.has(key) ? 0.3 : 1,
                            }}
                        />
                        <span
                            style={{
                                color: hiddenTypes.has(key) ? 'var(--text-muted)' : 'inherit',
                                textDecoration: hiddenTypes.has(key) ? 'line-through' : 'none',
                            }}
                        >
                            {type.label}
                        </span>
                    </label>
                ))}
            </div>

            {/* Calendar */}
            <div className="licenses-calendar" style={{ flex: 1, minWidth: 0 }}>
                <div className="calendar-header">
                    <div className="calendar-nav">
                        <button
                            className="btn btn-secondary"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                            onClick={goToPrevMonth}
                        >
                            ◀
                        </button>
                        <h3>{periodLabel}</h3>
                        <button
                            className="btn btn-secondary"
                            style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                            onClick={goToNextMonth}
                        >
                            ▶
                        </button>
                    </div>
                    <button
                        className="btn btn-primary"
                        style={{ padding: '0.3rem 0.8rem', fontSize: '0.8rem' }}
                        onClick={goToToday}
                    >
                        Hoy
                    </button>
                </div>

                {/* Day headers */}
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(7, 1fr)',
                        borderBottom: '1px solid var(--border-color)',
                    }}
                >
                    {DAY_NAMES.map((d) => (
                        <div key={d} className="calendar-day-header">
                            {d}
                        </div>
                    ))}
                </div>

                {/* Week rows */}
                {weeksWithBars.map((weekData, wi) => (
                    <div
                        key={wi}
                        style={{
                            position: 'relative',
                            display: 'grid',
                            gridTemplateColumns: 'repeat(7, 1fr)',
                            height: `${ROW_HEIGHT}px`,
                            borderBottom: '1px solid var(--border-color)',
                        }}
                    >
                        {/* Day cells */}
                        {weekData.week.map((date, di) => (
                            <div
                                key={di}
                                style={{
                                    borderRight: di < 6 ? '1px solid var(--border-color)' : 'none',
                                    background:
                                        date === today
                                            ? 'var(--color-primary-light, rgba(59,130,246,0.07))'
                                            : !date
                                            ? 'var(--color-muted-surface)'
                                            : 'transparent',
                                    paddingTop: '4px',
                                    paddingLeft: '6px',
                                }}
                            >
                                {date && (
                                    <span
                                        style={{
                                            fontSize: '0.78rem',
                                            fontWeight: date === today ? 700 : 400,
                                            color:
                                                date === today
                                                    ? 'var(--color-primary, #3b82f6)'
                                                    : 'var(--text-color)',
                                        }}
                                    >
                                        {Number(date.split('-')[2])}
                                    </span>
                                )}
                            </div>
                        ))}

                        {/* License bars */}
                        {weekData.bars.map((bar, bi) => {
                            const color = LICENSE_TYPES[bar.license.type]?.color || '#666';
                            const leftPct = (bar.startCol / 7) * 100;
                            const widthPct = ((bar.endCol - bar.startCol + 1) / 7) * 100;
                            const top = DAY_NUM_HEIGHT + bi * (BAR_H + BAR_GAP);
                            const marginH = 3;

                            return (
                                <div
                                    key={bi}
                                    title={`${bar.license.apellido}, ${bar.license.nombre} — ${LICENSE_TYPES[bar.license.type]?.label}`}
                                    onClick={() => onLicenseClick?.(bar.license)}
                                    style={{
                                        position: 'absolute',
                                        top: `${top}px`,
                                        left: `calc(${leftPct}% + ${bar.continuesBefore ? 0 : marginH}px)`,
                                        width: `calc(${widthPct}% - ${(bar.continuesBefore ? 0 : marginH) + (bar.continuesAfter ? 0 : marginH)}px)`,
                                        height: `${BAR_H}px`,
                                        background: color + '28',
                                        borderLeft: bar.continuesBefore ? 'none' : `3px solid ${color}`,
                                        borderTop: `1px solid ${color}55`,
                                        borderBottom: `1px solid ${color}55`,
                                        borderRight: bar.continuesAfter ? 'none' : `1px solid ${color}55`,
                                        borderRadius: bar.continuesBefore
                                            ? bar.continuesAfter
                                                ? '0'
                                                : '0 4px 4px 0'
                                            : bar.continuesAfter
                                            ? '4px 0 0 4px'
                                            : '0 4px 4px 0',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        paddingLeft: bar.continuesBefore ? '4px' : '5px',
                                        paddingRight: '4px',
                                        overflow: 'hidden',
                                        zIndex: 1,
                                        fontSize: '0.7rem',
                                        color,
                                        fontWeight: 600,
                                        whiteSpace: 'nowrap',
                                        textOverflow: 'ellipsis',
                                        transition: 'filter 0.15s',
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.filter = 'brightness(0.88)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.filter = '')}
                                >
                                    {!bar.continuesBefore && `${bar.license.apellido}, ${bar.license.nombre}`}
                                </div>
                            );
                        })}

                        {/* Overflow */}
                        {weekData.overflow > 0 && (
                            <div
                                style={{
                                    position: 'absolute',
                                    bottom: '4px',
                                    right: '6px',
                                    fontSize: '0.68rem',
                                    color: 'var(--text-muted)',
                                    fontWeight: 500,
                                }}
                            >
                                +{weekData.overflow} más
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
