// demo-zugang plus befuelltes notizbuch, sonst startet man vor leerer oberflaeche
import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const SUPA = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const SECRET = process.env.SUPABASE_SECRET_KEY;
const API = process.env.API_URL ?? 'http://localhost:3001';
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@notebook.local';
const PASSWORD = process.env.DEMO_PASSWORD;

if (!SECRET || !PASSWORD) {
	console.error('SUPABASE_SECRET_KEY und DEMO_PASSWORD müssen gesetzt sein');
	process.exit(1);
}

const admin = createClient(SUPA, SECRET, { auth: { persistSession: false } });

const { data: created, error } = await admin.auth.admin.createUser({
	email: EMAIL,
	password: PASSWORD,
	email_confirm: true
});

if (error && !error.message.includes('already been registered')) {
	console.error(`Demo-Nutzer anlegen fehlgeschlagen: ${error.message}`);
	process.exit(1);
}
console.log(created?.user ? 'Demo-Nutzer angelegt' : 'Demo-Nutzer existiert bereits');

const session = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
	method: 'POST',
	headers: { 'Content-Type': 'application/json', apikey: SECRET },
	body: JSON.stringify({ email: EMAIL, password: PASSWORD })
}).then((r) => r.json());

const token = session.access_token;
if (!token) {
	console.error('Anmeldung als Demo-Nutzer fehlgeschlagen');
	process.exit(1);
}

const call = (path, body, method = 'POST') =>
	fetch(`${API}${path}`, {
		method,
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: body ? JSON.stringify(body) : undefined
	}).then(async (r) => {
		if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
		return r.status === 204 ? null : r.json();
	});

const existing = await call('/notebooks', null, 'GET');
if (existing.some((n) => n.title === 'Beispiel-Notizbuch')) {
	console.log('Beispiel-Notizbuch existiert bereits, nichts zu tun');
	process.exit(0);
}

const notebook = await call('/notebooks', { title: 'Beispiel-Notizbuch', emoji: '📚' });
console.log(`Notizbuch angelegt: ${notebook.id}`);

const pdf = await readFile(new URL('../apps/api/test/fixtures/rahmenvertrag.pdf', import.meta.url));
const upload = await call(`/notebooks/${notebook.id}/sources/upload-url`, {
	filename: 'rahmenvertrag.pdf',
	size: pdf.length
});

const put = await fetch(upload.signedUrl, {
	method: 'PUT',
	headers: { 'Content-Type': 'application/pdf' },
	body: pdf
});
if (!put.ok) throw new Error(`Upload fehlgeschlagen: ${put.status}`);

await call(`/notebooks/${notebook.id}/sources`, {
	kind: 'file',
	storagePath: upload.path,
	title: 'Rahmenvertrag Zephyr-7.pdf'
});

await call(`/notebooks/${notebook.id}/sources`, {
	kind: 'text',
	title: 'Interne Notiz zur Garantie',
	content:
		'Die Garantie auf Zephyr-7 laeuft ueber 24 Monate ab Lieferdatum. ' +
		'Bei Bestandskunden verlaengert sich die Frist nach Paragraph 15a des Rahmenvertrags auf 36 Monate. ' +
		'Zustaendig fuer Kulanzentscheidungen ist die Rechtsabteilung.'
});

console.log('Quellen hinzugefügt, Verarbeitung läuft im Hintergrund');
console.log(`\nZugang: ${EMAIL} / ${PASSWORD}`);
