import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { hashPassword } from './passwords.js';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

const isLocal = !url || !authToken;
const dbUrl = isLocal ? 'file:local.db' : url;

if (isLocal) {
    console.log('ℹ️ Modo local activado: usando SQLite local (local.db)');
}

const db = createClient({ url: dbUrl, authToken: isLocal ? undefined : authToken });

async function seed() {
    console.log(isLocal ? "Iniciando seed de la base de datos local..." : "Iniciando seed de la base de datos Turso...");

    // 1. Ejecutar schema.sql
    const schemaPath = path.join(process.cwd(), 'src/lib/schema.sql');
    const schemaSql = fs.readFileSync(schemaPath, 'utf8');

    // Dividir por sentencias (separadas por ;)
    const statements = schemaSql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0);

    console.log(`Ejecutando ${statements.length} sentencias SQL del esquema...`);

    for (const stmt of statements) {
        try {
            await db.execute(stmt);
        } catch (err) {
            if (err.message.includes("already exists")) {
                console.log("La tabla ya existe (skippeando)");
            } else {
                console.error("Error ejecutando:", stmt);
                console.error(err);
            }
        }
    }

    // 2. Los supervisores se crean desde la sección Usuarios en Configuración
    console.log("Skippeando inserción de supervisores default (se crean desde Usuarios)...");

    // 3. Insertar Servicios default
    console.log("Insertando servicios default...");
    for (let i = 1; i <= 15; i++) {
        try {
            const name = `Servicio ${i}`;
            const address = `Dirección del Servicio ${i}`;
            const lat = -34.6037 + (Math.random() - 0.5) * 0.1;
            const lng = -58.3816 + (Math.random() - 0.5) * 0.1;

            const resp = await db.execute({
                sql: "SELECT id FROM services WHERE name = ?",
                args: [name]
            });
            if (resp.rows.length === 0) {
                await db.execute({
                    sql: "INSERT INTO services (name, address, lat, lng) VALUES (?, ?, ?, ?)",
                    args: [name, address, lat, lng]
                });
            }
        } catch (e) { console.error(e); }
    }

    // 4. Tipos de documento
    console.log("Insertando tipos de documento...");
    const docTypes = [
        { nombre: 'DNI', req: false, dias: 30, oblig: true },
        { nombre: 'CUIL/CUIT', req: false, dias: 30, oblig: true },
        { nombre: 'Alta Temprana', req: false, dias: 30, oblig: true },
        { nombre: 'Apto Médico', req: true, dias: 30, oblig: true },
        { nombre: 'ART', req: true, dias: 15, oblig: true },
        { nombre: 'Constancia Domicilio', req: false, dias: 30, oblig: false },
    ];

    for (const doc of docTypes) {
        try {
            const resp = await db.execute({
                sql: "SELECT id FROM document_types WHERE nombre = ?",
                args: [doc.nombre]
            });
            if (resp.rows.length === 0) {
                await db.execute({
                    sql: "INSERT INTO document_types (nombre, requiere_vencimiento, dias_alerta, obligatorio) VALUES (?, ?, ?, ?)",
                    args: [doc.nombre, doc.req ? 1 : 0, doc.dias, doc.oblig ? 1 : 0]
                });
            }
        } catch (e) { console.error(e); }
    }

    // 5. Insumos por defecto (NUEVO)
    console.log("Insertando insumos por defecto...");
    const insumosItems = [
        { nombre: 'Lavandina', unidad: 'litros' },
        { nombre: 'Detergente', unidad: 'litros' },
        { nombre: 'Trapo de piso', unidad: 'unidades' },
        { nombre: 'Papel Higiénico', unidad: 'rollos' },
        { nombre: 'Bolsas de Consorcio', unidad: 'unidades' },
        { nombre: 'Guantes de látex', unidad: 'pares' },
        { nombre: 'Desodorante de ambiente', unidad: 'unidades' },
        { nombre: 'Cera', unidad: 'litros' }
    ];

    for (const ins of insumosItems) {
        try {
            const resp = await db.execute({
                sql: "SELECT id FROM supplies WHERE nombre = ?",
                args: [ins.nombre]
            });
            if (resp.rows.length === 0) {
                await db.execute({
                    sql: "INSERT INTO supplies (nombre, unidad) VALUES (?, ?)",
                    args: [ins.nombre, ins.unidad]
                });
            }
        } catch (e) { console.error(e); }
    }

    // 6. Usuarios de aplicación (app_users)
    console.log("Insertando usuarios de aplicación...");

    // Admin
    try {
        const resp = await db.execute({
            sql: "SELECT id FROM app_users WHERE username = ?",
            args: ['admin']
        });
        if (resp.rows.length === 0) {
            await db.execute({
                sql: "INSERT INTO app_users (username, password_hash, name, surname, role, login_enabled) VALUES (?, ?, ?, ?, ?, 1)",
                args: ['admin', hashPassword('admin1234'), 'Admin', 'LASIA', 'admin']
            });
        }
    } catch (e) { console.error(e); }

    // Compras
    try {
        const resp = await db.execute({
            sql: "SELECT id FROM app_users WHERE username = ?",
            args: ['compras']
        });
        if (resp.rows.length === 0) {
            await db.execute({
                sql: "INSERT INTO app_users (username, password_hash, name, surname, role, login_enabled) VALUES (?, ?, ?, ?, ?, 1)",
                args: ['compras', hashPassword('compras1234'), 'Compras', 'LASIA', 'purchases']
            });
        }
    } catch (e) { console.error(e); }

    // Supervisor demo
    let supervisorDemoId = null;
    try {
        const resp = await db.execute({
            sql: "SELECT id FROM supervisors WHERE dni = ?",
            args: ['supervisor']
        });
        if (resp.rows.length === 0) {
            const insertResp = await db.execute({
                sql: "INSERT INTO supervisors (name, surname, dni) VALUES (?, ?, ?)",
                args: ['Supervisor', 'Demo', 'supervisor']
            });
            supervisorDemoId = Number(insertResp.lastInsertRowid);
        } else {
            supervisorDemoId = resp.rows[0].id;
        }
    } catch (e) { console.error(e); }

    if (supervisorDemoId) {
        try {
            const resp = await db.execute({
                sql: "SELECT id FROM app_users WHERE username = ?",
                args: ['supervisor']
            });
            if (resp.rows.length === 0) {
                await db.execute({
                    sql: "INSERT INTO app_users (username, password_hash, name, surname, role, login_enabled, supervisor_id) VALUES (?, ?, ?, ?, ?, 1, ?)",
                    args: ['supervisor', hashPassword('supervisor'), 'Supervisor', 'Demo', 'supervisor', supervisorDemoId]
                });
            }
        } catch (e) { console.error(e); }
    }

    console.log("✅ Seed completado con éxito.");
    process.exit(0);
}

seed().catch((err) => {
    console.error("Error fatal en seed:", err);
    process.exit(1);
});
