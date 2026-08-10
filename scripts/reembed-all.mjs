// vektoren aus einem anderen modell liegen in einem anderen raum
import { createClient } from '@supabase/supabase-js';

const SUPA = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SECRET = process.env.SUPABASE_SECRET_KEY;
const API = process.env.API_URL ?? 'http://localhost:3001';
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@notebook.local';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'demo12345';

if (!SECRET) {
	console.error('SUPABASE_SECRET_KEY fehlt');
	process.exit(1);
}

const session = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json', apikey: SECRET },
	body: JSON.stringify({ email: EMAIL, password: PASSWORD })
}).then((r) => r.json());

if (!session.access_token) {
	console.error('Anmeldung fehlgeschlagen — stimmen DEMO_EMAIL und DEMO_PASSWORD?');
	process.exit(1);
}

const auth = { Authorization: `Bearer ${session.access_token}` };
const admin = createClient(SUPA, SECRET, { auth: { persistSession: false } });

const { data: sources } = await admin.from('sources').select('id, title, notebook_id');
if (!sources?.length) {
	console.log('Keine Quellen vorhanden.');
	process.exit(0);
}

console.log(`${sources.length} Quelle(n) werden neu verarbeitet…\n`);

for (const source of sources) {
	const response = await fetch(`${API}/sources/${source.id}/reprocess`, {
		method: 'POST',
		headers: auth
	});
	console.log(`  ${response.ok ? 'gestartet' : 'FEHLER'}  ${source.title}`);
}

console.log('\nWarte auf Abschluss…');

for (let i = 0; i < 120; i++) {
	await new Promise((r) => setTimeout(r, 2000));

	const { data } = await admin.from('sources').select('status');
	const offen = data.filter((s) => s.status === 'pending' || s.status === 'processing').length;
	if (offen === 0) break;

	process.stdout.write(`\r  noch ${offen} offen…   `);
}

const { data: final } = await admin.from('sources').select('title, status, error_message');
console.log('\n');
for (const s of final) {
	console.log(
		`  ${s.status.padEnd(10)} ${s.title}${s.error_message ? ` — ${s.error_message}` : ''}`
	);
}
