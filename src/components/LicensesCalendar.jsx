'use client';

import { useState, useMemo } from 'react';

const LICENSE_TYPES = {
    vacaciones: { label: 'Vacaciones', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)' },
    enfermedad: { label: 'Enfermedad', color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)' },
    maternidad: { label: 'Maternidad', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' },
    paternidad: { label: 'Paternidad', color: '#a855f7', bg: 'rgba(168, 85, 247, 0.15)' },
    psiquiatrica: { label: 'Psiquiátrica', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' },
    sin_goce: { label: 'Sin goce', color: '#6b7280', bg: 'rgba(107, 114, 128, 0.15)' }
};

const MONTH_NAMES = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

export default function LicensesCalendar({ licenses, onDateClick, onLicenseClick }) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [tooltip, setTooltip] = useState(null);
    
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    const calendarDays = useMemo(() => {
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startPadding = firstDay.getDay();
        const daysInMonth = lastDay.getDate();
        
        const days = [];
        
        // Días del mes anterior (padding)
        for (let i = 0; i < startPadding; i++) {
            days.push({ day: null, date: null, licenses: [] });
        }
        
        // Días del mes actual
        for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayLicenses = licenses.filter(l => {
                return dateStr >= l.start_date && dateStr <= l.end_date;
            });
            days.push({ day, date: dateStr, licenses: dayLicenses });
        }
        
        return days;
    }, [year, month, licenses]);
    
    const goToPrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
    const goToNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
    const goToToday = () => setCurrentDate(new Date());
    
    const today = new Date().toISOString().split('T')[0];
    
    return (
        <div className="licenses-calendar">
            <div className="calendar-header">
                <div className="calendar-nav">
                    <button className="btn btn-secondary" onClick={goToPrevMonth}>◀</button>
                    <h3>{MONTH_NAMES[month]} {year}</h3>
                    <button className="btn btn-secondary" onClick={goToNextMonth}>▶</button>
                </div>
                <button className="btn btn-primary" onClick={goToToday}>Hoy</button>
            </div>
            
            <div className="calendar-legend">
                {Object.entries(LICENSE_TYPES).map(([key, type]) => (
                    <div key={key} className="legend-item">
                        <span className="legend-dot" style={{ background: type.color }}></span>
                        <span>{type.label}</span>
                    </div>
                ))}
            </div>
            
            <div className="calendar-grid">
                {DAY_NAMES.map(day => (
                    <div key={day} className="calendar-day-header">{day}</div>
                ))}
                
                {calendarDays.map((dayData, index) => (
                    <div
                        key={index}
                        className={`calendar-day ${dayData.date === today ? 'today' : ''} ${!dayData.day ? 'empty' : ''}`}
                        onClick={() => dayData.day && onDateClick?.(dayData.date, dayData.licenses)}
                        onMouseEnter={(e) => {
                            if (dayData.licenses.length > 0) {
                                setTooltip({
                                    x: e.clientX,
                                    y: e.clientY,
                                    licenses: dayData.licenses
                                });
                            }
                        }}
                        onMouseLeave={() => setTooltip(null)}
                    >
                        {dayData.day && (
                            <>
                                <span className="day-number">{dayData.day}</span>
                                <div className="day-licenses">
                                    {dayData.licenses.slice(0, 4).map((license, i) => (
                                        <div
                                            key={i}
                                            className="license-dot"
                                            style={{ background: LICENSE_TYPES[license.type]?.color || '#666' }}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onLicenseClick?.(license);
                                            }}
                                        />
                                    ))}
                                    {dayData.licenses.length > 4 && (
                                        <span className="license-more">+{dayData.licenses.length - 4}</span>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
            
            {tooltip && (
                <div className="calendar-tooltip" style={{ left: tooltip.x + 10, top: tooltip.y + 10 }}>
                    {tooltip.licenses.map((license, i) => (
                        <div key={i} className="tooltip-item">
                            <span className="tooltip-dot" style={{ background: LICENSE_TYPES[license.type]?.color }} ></span>
                            <span>{license.apellido}, {license.nombre} - {LICENSE_TYPES[license.type]?.label}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
