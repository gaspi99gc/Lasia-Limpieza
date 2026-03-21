import { db } from '@/lib/db';

// Haversine formula
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) *
        Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function getZone(distanceMeters) {
    if (distanceMeters <= 200) return 'green';
    if (distanceMeters <= 500) return 'yellow';
    return 'red';
}

export async function GET(req) {
    try {
        const { searchParams } = new URL(req.url);
        const supervisorId = searchParams.get('supervisor_id');
        const serviceId = searchParams.get('service_id');
        const active = searchParams.get('active'); // 'true' to get only active (unclosed) check-ins
        const today = searchParams.get('today'); // 'true' to get only today's records

        let query = `
      SELECT a.*, s.name as service_name, s.address as service_address, 
             sup.name as supervisor_name, sup.surname as supervisor_surname
      FROM attendance a
      JOIN services s ON a.service_id = s.id
      JOIN supervisors sup ON a.supervisor_id = sup.id
    `;
        const conditions = [];
        const args = [];

        if (supervisorId) {
            conditions.push('a.supervisor_id = ?');
            args.push(supervisorId);
        }

        if (serviceId) {
            conditions.push('a.service_id = ?');
            args.push(serviceId);
        }

        if (active === 'true') {
            // Find check-ins that don't have a corresponding check-out
            conditions.push(`a.type = 'check-in'`);
            conditions.push(`NOT EXISTS (
                SELECT 1 FROM attendance a2 
                WHERE a2.supervisor_id = a.supervisor_id 
                AND a2.service_id = a.service_id 
                AND a2.type = 'check-out' 
                AND a2.timestamp > a.timestamp
            )`);
        }

        if (today === 'true') {
            conditions.push(`date(datetime(a.timestamp, '-3 hours')) = date(datetime('now', '-3 hours'))`);
        }

        if (conditions.length > 0) {
            query += ` WHERE ${conditions.join(' AND ')}`;
        }

        query += ' ORDER BY a.timestamp DESC';

        const { rows } = await db.execute({ sql: query, args });
        return Response.json(rows);
    } catch (error) {
        console.error('Error fetching attendance:', error);
        return Response.json({ error: 'Failed to fetch attendance' }, { status: 500 });
    }
}

export async function POST(req) {
    try {
        const { supervisor_id, service_id, type, lat, lng } = await req.json();

        // Validation: Check for active (unclosed) check-in
        const { rows: activeCheckins } = await db.execute({
            sql: `SELECT a.*, s.name as service_name FROM attendance a
                  JOIN services s ON a.service_id = s.id
                  WHERE a.supervisor_id = ? AND a.type = 'check-in'
                  AND NOT EXISTS (
                      SELECT 1 FROM attendance a2 
                      WHERE a2.supervisor_id = a.supervisor_id 
                      AND a2.service_id = a.service_id 
                      AND a2.type = 'check-out' 
                      AND a2.timestamp > a.timestamp
                  )
                  ORDER BY a.timestamp DESC LIMIT 1`,
            args: [supervisor_id]
        });

        const hasActiveCheckin = activeCheckins.length > 0;
        const activeCheckin = hasActiveCheckin ? activeCheckins[0] : null;

        if (type === 'check-in' && hasActiveCheckin) {
            return Response.json({
                error: `Ya tenés una entrada activa en "${activeCheckin.service_name}". Fichá la salida primero.`,
                active_checkin: activeCheckin
            }, { status: 400 });
        }

        if (type === 'check-out' && (!hasActiveCheckin || activeCheckin.service_id !== service_id)) {
            return Response.json({
                error: 'No hay una entrada activa para este servicio.',
            }, { status: 400 });
        }

        // Get service coordinates and calculate distance
        const service = await db.execute({
            sql: 'SELECT lat, lng FROM services WHERE id = ?',
            args: [service_id]
        });

        let verified = false;
        let distance_meters = null;
        let zone = 'red';

        if (service.rows.length > 0 && service.rows[0].lat && service.rows[0].lng) {
            const sLat = service.rows[0].lat;
            const sLng = service.rows[0].lng;
            distance_meters = haversineDistance(lat, lng, sLat, sLng);
            zone = getZone(distance_meters);
            verified = zone === 'green';
        }

        const result = await db.execute({
            sql: `INSERT INTO attendance (supervisor_id, service_id, type, lat, lng, verified, distance_meters, zone) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
            args: [supervisor_id, service_id, type, lat, lng, verified ? 1 : 0, distance_meters, zone]
        });

        return Response.json(result.rows[0], { status: 201 });
    } catch (error) {
        console.error('Error recording attendance:', error);
        return Response.json({ error: 'Failed to record attendance' }, { status: 500 });
    }
}
