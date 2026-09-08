import { writeFile } from 'node:fs/promises';

const PAGES = [
	{
		title: 'Framework Agreement Zephyr-7',
		lines: [
			'Framework agreement on the supply and maintenance',
			'of the Zephyr-7 product',
			'',
			'between Meridian Systems Ltd., 12 Harbour Road, London EC3R 6AF,',
			'hereinafter the "Supplier", and the contracting party named in the',
			'order form, hereinafter the "Customer".',
			'',
			'Section 1 Subject matter',
			'',
			'The Supplier provides the Customer with the Zephyr-7 product in the',
			'configuration ordered and performs the maintenance set out in Section 6.',
			'Technical data are specified in Annex 1. Deviations that do not',
			'materially impair function remain reserved.',
			'',
			'Section 2 Term and termination',
			'',
			'The agreement starts on the delivery date and runs for twelve months.',
			'It renews for further periods of twelve months unless it is terminated.',
			'The notice period is four weeks to the end of a month. Receipt by the',
			'Supplier is decisive for meeting the deadline.',
			'',
			'The right of either party to terminate for good cause remains',
			'unaffected.',
			'',
			'Section 3 Prices and payment terms',
			'',
			'The price list in force at the time of the order applies. Invoices fall',
			'due for payment within 30 days without deduction.'
		]
	},
	{
		title: 'Liability for defects and warranty',
		lines: [
			'Section 4 Liability for defects',
			'',
			'The Supplier warrants that the product has the agreed quality at the',
			'passing of risk. Obvious defects must be reported in writing within',
			'two weeks of delivery.',
			'',
			'Section 5 Warranty',
			'',
			'The warranty on Zephyr-7 runs for 24 months from the delivery date. It',
			'covers repair free of charge or the replacement of parts that are shown',
			'to have failed because of a material or manufacturing defect.',
			'',
			'The warranty does not cover:',
			'',
			'  a) wear parts as listed in Annex 2,',
			'  b) damage caused by improper operation or work by third parties,',
			'  c) damage caused by operation outside the specified conditions.',
			'',
			'Work carried out under warranty does not extend the warranty period.',
			'Replaced parts are covered for the remainder of the original period.',
			'',
			'Section 6 Maintenance',
			'',
			'The Supplier carries out one inspection per year. The date is agreed',
			'at least four weeks in advance. Response times for fault reports',
			'depend on the service level booked and are eight working hours as',
			'standard.'
		]
	},
	{
		title: 'Special terms for existing customers',
		lines: [
			'Section 15 Special terms',
			'',
			'Section 15a Existing customers',
			'',
			'A customer counts as an existing customer if it entered into a framework',
			'agreement with the Supplier before 1 January 2024 and has kept it in',
			'force without interruption.',
			'',
			'For existing customers the warranty period under Section 5 is extended',
			'from 24 to 36 months. The exclusions under Section 5 paragraph 3 remain',
			'unaffected.',
			'',
			'Decisions on goodwill in these cases rest with the legal department of',
			'the Supplier. A rejection must state the reasons.',
			'',
			'Section 15b Transfer on a change of shareholders',
			'',
			'Existing customer status survives a change of shareholders as long as',
			'the company name continues.',
			'',
			'Section 16 Final provisions',
			'',
			'Amendments and additions must be made in writing. The same applies to',
			'any waiver of this requirement of form. Should a provision be invalid,',
			'the remainder of the agreement stays in force.',
			'',
			'The place of jurisdiction is London where the Customer is a merchant.'
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

const target = new URL('../apps/api/test/fixtures/framework-agreement.pdf', import.meta.url);
await writeFile(target, Buffer.concat(chunks));
console.log(`${PAGES.length} pages written: ${target.pathname}`);
