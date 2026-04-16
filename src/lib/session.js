function isSameArgentinaCalendarDay(isoString) {
    if (!isoString) return false;

    const now = new Date();
    const loggedIn = new Date(isoString);

    const formatter = new Intl.DateTimeFormat('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
    });

    const nowParts = formatter.formatToParts(now);
    const loggedParts = formatter.formatToParts(loggedIn);

    const getPart = (parts, type) => parts.find((p) => p.type === type)?.value;

    return (
        getPart(nowParts, 'year') === getPart(loggedParts, 'year') &&
        getPart(nowParts, 'month') === getPart(loggedParts, 'month') &&
        getPart(nowParts, 'day') === getPart(loggedParts, 'day')
    );
}

export function saveSession(user) {
    const payload = { ...user, loggedInAt: new Date().toISOString() };
    localStorage.setItem('currentUser', JSON.stringify(payload));
}

export function getSessionUser() {
    const stored = localStorage.getItem('currentUser');
    if (!stored) return null;

    try {
        const parsed = JSON.parse(stored);
        if (!parsed || !isSameArgentinaCalendarDay(parsed.loggedInAt)) {
            clearSession();
            return null;
        }
        return parsed;
    } catch {
        clearSession();
        return null;
    }
}

export function clearSession() {
    localStorage.removeItem('currentUser');
}
