// La fecha de una fila de agenda (trabajos programados, vencimientos de RRHH),
// como la hoja de un calendario: el día grande, el mes y el día de la semana.
// El tono ('rojo' | 'ambar' | 'verde') dice la urgencia; sin tono, neutra.
// Los estilos están en globals.css (.agenda-fecha).

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export default function HojaFecha({ fecha, tono }) {
    if (!fecha) return <div className="agenda-fecha" />;
    const [a, m, d] = String(fecha).slice(0, 10).split('-').map(Number);
    // Mediodía UTC: el día de la semana no se corre por el huso horario.
    const semana = DIAS[new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay()];
    return (
        <div className="agenda-fecha" data-tono={tono || undefined} aria-label={`${d}/${m}/${a}`}>
            <span className="agenda-fecha__dia">{d}</span>
            <span className="agenda-fecha__mes">{MESES[m - 1]}</span>
            <span className="agenda-fecha__semana">{semana}</span>
        </div>
    );
}
