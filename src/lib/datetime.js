export const ARGENTINA_LOCALE = 'es-AR';
export const ARGENTINA_TIME_ZONE = 'America/Argentina/Buenos_Aires';

const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_WITHOUT_TZ_REGEX = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

function getFormatter(options) {
    return new Intl.DateTimeFormat(ARGENTINA_LOCALE, {
        timeZone: ARGENTINA_TIME_ZONE,
        ...options,
    });
}

export function parseAppDate(value) {
    if (value instanceof Date) {
        return value;
    }

    if (typeof value === 'number') {
        return new Date(value);
    }

    if (typeof value === 'string') {
        const normalizedValue = value.trim();

        if (DATE_ONLY_REGEX.test(normalizedValue)) {
            const [year, month, day] = normalizedValue.split('-').map(Number);
            return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
        }

        if (DATETIME_WITHOUT_TZ_REGEX.test(normalizedValue)) {
            return new Date(normalizedValue.replace(' ', 'T') + 'Z');
        }

        return new Date(normalizedValue);
    }

    return new Date(value);
}

export function formatArgentinaDate(value) {
    const date = parseAppDate(value);

    if (Number.isNaN(date.getTime())) {
        return '---';
    }

    return getFormatter({
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).format(date);
}

export function formatArgentinaDateTime(value) {
    const date = parseAppDate(value);

    if (Number.isNaN(date.getTime())) {
        return '---';
    }

    return getFormatter({
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
    }).format(date);
}

export function getArgentinaDateStamp(value = new Date()) {
    const date = parseAppDate(value);
    const parts = getFormatter({
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
    }).formatToParts(date);

    const day = parts.find((part) => part.type === 'day')?.value || '01';
    const month = parts.find((part) => part.type === 'month')?.value || '01';
    const year = parts.find((part) => part.type === 'year')?.value || '1970';

    return `${year}-${month}-${day}`;
}

export function toArgentinaDateInputValue(value) {
    if (!value) {
        return '';
    }

    if (typeof value === 'string' && DATE_ONLY_REGEX.test(value.trim())) {
        return value.trim();
    }

    return getArgentinaDateStamp(value);
}
