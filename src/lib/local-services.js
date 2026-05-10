import fs from 'fs';
import path from 'path';

function parseCSV(content) {
    const lines = content.trim().split('\n');
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    return lines.slice(1).map((line, i) => {
        const values = [];
        let current = '';
        let inQuotes = false;
        for (const char of line) {
            if (char === '"') { inQuotes = !inQuotes; continue; }
            if (char === ',' && !inQuotes) { values.push(current); current = ''; continue; }
            current += char;
        }
        values.push(current);
        const obj = { id: i + 1 };
        headers.forEach((h, idx) => {
            const val = values[idx]?.trim() ?? '';
            obj[h] = (h === 'lat' || h === 'lng') ? (val ? parseFloat(val) : null) : val;
        });
        return obj;
    });
}

export function getLocalServices() {
    const csvPath = path.join(process.cwd(), 'services.csv');
    if (!fs.existsSync(csvPath)) return [];
    const content = fs.readFileSync(csvPath, 'utf8');
    return parseCSV(content);
}
