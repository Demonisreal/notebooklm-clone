import { writeFile } from 'node:fs/promises';

const PAGES = [
	{
		title: 'Rahmenvertrag Zephyr-7',
		lines: [
			'Rahmenvertrag über die Lieferung und Wartung',
			'des Produkts Zephyr-7',
			'',
			'zwischen der Meridian Systems GmbH, Hafenstraße 12, 20359 Hamburg,',
			'nachfolgend "Lieferant", und dem im Auftragsformular benannten',
			'Vertragspartner, nachfolgend "Kunde".',
			'',
			'§ 1 Vertragsgegenstand',
			'',
			'Der Lieferant überlässt dem Kunden das Produkt Zephyr-7 in der jeweils',
			'bestellten Ausbaustufe und übernimmt die in § 6 beschriebene Wartung.',
			'Die technischen Daten ergeben sich aus Anlage 1. Abweichungen, die die',
			'Funktion nicht wesentlich einschränken, bleiben vorbehalten.',
			'',
			'§ 2 Laufzeit und Kündigung',
			'',
			'Der Vertrag beginnt mit dem Lieferdatum und läuft zunächst zwölf Monate.',
			'Er verlängert sich jeweils um weitere zwölf Monate, sofern er nicht',
			'gekündigt wird. Die Kündigungsfrist beträgt vier Wochen zum Monatsende.',
			'Maßgeblich für die Fristwahrung ist der Eingang beim Lieferanten.',
			'',
			'Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt',
			'für beide Seiten unberührt.',
			'',
			'§ 3 Preise und Zahlungsbedingungen',
			'',
			'Es gilt die zum Zeitpunkt der Bestellung gültige Preisliste. Rechnungen',
			'sind innerhalb von 30 Tagen ohne Abzug zur Zahlung fällig.'
		]
	},
	{
		title: 'Gewährleistung und Garantie',
		lines: [
			'§ 4 Gewährleistung',
			'',
			'Der Lieferant gewährleistet, dass das Produkt bei Gefahrübergang die',
			'vereinbarte Beschaffenheit aufweist. Offensichtliche Mängel sind',
			'innerhalb von zwei Wochen nach Lieferung schriftlich anzuzeigen.',
			'',
			'§ 5 Garantie',
			'',
			'Die Garantie auf Zephyr-7 läuft über 24 Monate ab Lieferdatum. Sie',
			'umfasst die kostenfreie Instandsetzung oder den Austausch von Teilen,',
			'die nachweislich auf einem Material- oder Fertigungsfehler beruhen.',
			'',
			'Von der Garantie ausgenommen sind:',
			'',
			'  a) Verschleißteile gemäß Anlage 2,',
			'  b) Schäden durch unsachgemäße Bedienung oder Eingriffe Dritter,',
			'  c) Schäden durch Betrieb außerhalb der spezifizierten Bedingungen.',
			'',
			'Garantieleistungen verlängern die Garantiefrist nicht. Für ersetzte',
			'Teile gilt die verbleibende Restlaufzeit der ursprünglichen Frist.',
			'',
			'§ 6 Wartung',
			'',
			'Der Lieferant führt jährlich eine Inspektion durch. Der Termin wird',
			'mindestens vier Wochen im Voraus abgestimmt. Reaktionszeiten bei',
			'Störungsmeldungen richten sich nach der gebuchten Servicestufe und',
			'betragen im Standardfall acht Arbeitsstunden.'
		]
	},
	{
		title: 'Sonderregelungen für Bestandskunden',
		lines: [
			'§ 15 Sonderregelungen',
			'',
			'§ 15a Bestandskunden',
			'',
			'Als Bestandskunde gilt, wer vor dem 1. Januar 2024 einen Rahmenvertrag',
			'mit dem Lieferanten geschlossen hat und diesen ununterbrochen fortführt.',
			'',
			'Für Bestandskunden verlängert sich die Garantiefrist nach § 5 von',
			'24 auf 36 Monate. Die Ausschlüsse nach § 5 Absatz 3 bleiben davon',
			'unberührt.',
			'',
			'Zuständig für Kulanzentscheidungen ist in diesen Fällen die',
			'Rechtsabteilung des Lieferanten. Eine Ablehnung ist zu begründen.',
			'',
			'§ 15b Übergang bei Gesellschafterwechsel',
			'',
			'Der Status als Bestandskunde bleibt bei einem Wechsel der',
			'Gesellschafter erhalten, sofern die Firmierung fortbesteht.',
			'',
			'§ 16 Schlussbestimmungen',
			'',
			'Änderungen und Ergänzungen bedürfen der Schriftform. Dies gilt auch',
			'für die Aufhebung dieses Formerfordernisses. Sollte eine Bestimmung',
			'unwirksam sein, bleibt der Vertrag im Übrigen wirksam.',
			'',
			'Gerichtsstand ist Hamburg, soweit der Kunde Kaufmann ist.'
		]
	}
];

const escape = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

function content(page) {
	const parts = [
		'BT',
		'/F2 15 Tf',
		'1 0 0 1 64 760 Tm',
		`(${escape(page.title)}) Tj`,
		'ET',
		'BT',
		'/F1 11 Tf'
	];
	let y = 718;
	for (const line of page.lines) {
		if (line) parts.push(`1 0 0 1 64 ${y} Tm`, `(${escape(line)}) Tj`);
		y -= 19;
	}
	parts.push('ET');
	return parts.join('\n');
}

const objects = [];
const add = (body) => objects.push(body) && objects.length;

const catalog = add('');
const pagesObj = add('');
const regular = add(
	'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
);
const bold = add(
	'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'
);

const pageIds = [];
for (const page of PAGES) {
	const stream = content(page);
	const streamId = add(
		`<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`
	);
	pageIds.push(
		add(
			`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 842] ` +
				`/Resources << /Font << /F1 ${regular} 0 R /F2 ${bold} 0 R >> >> /Contents ${streamId} 0 R >>`
		)
	);
}

objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
objects[pagesObj - 1] =
	`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;

const chunks = [Buffer.from('%PDF-1.4\n', 'latin1')];
const offsets = [];
let cursor = chunks[0].length;

objects.forEach((body, i) => {
	offsets.push(cursor);
	const buf = Buffer.from(`${i + 1} 0 obj\n${body}\nendobj\n`, 'latin1');
	chunks.push(buf);
	cursor += buf.length;
});

const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
for (const offset of offsets) xref.push(`${String(offset).padStart(10, '0')} 00000 n \n`);
chunks.push(
	Buffer.from(
		`${xref.join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${cursor}\n%%EOF\n`,
		'latin1'
	)
);

const target = new URL('../apps/api/test/fixtures/rahmenvertrag.pdf', import.meta.url);
await writeFile(target, Buffer.concat(chunks));
console.log(`${PAGES.length} Seiten geschrieben: ${target.pathname}`);
