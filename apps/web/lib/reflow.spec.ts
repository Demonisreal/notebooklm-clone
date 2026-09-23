import { describe, expect, it } from 'vitest';
import { reflow } from './reflow';

// excerpt of what unpdf pulls out of the demo contract, one line per pdf line
const contract = [
	'Framework Agreement Zephyr-7',
	'Framework agreement on the supply and maintenance',
	'of the Zephyr-7 product',
	'between Meridian Systems Ltd., 12 Harbour Road, London EC3R 6AF,',
	'hereinafter the "Supplier", and the contracting party named in the',
	'order form, hereinafter the "Customer".',
	'Section 1 Subject matter',
	'The Supplier provides the Customer with the Zephyr-7 product in the',
	'configuration ordered and performs the maintenance set out in Section 6.',
	'Technical data are specified in Annex 1. Deviations that do not',
	'materially impair function remain reserved.',
	'Section 2 Term and termination',
	'The agreement starts on the delivery date and runs for twelve months.',
	'It renews for further periods of twelve months unless it is terminated.',
	'The notice period is four weeks to the end of a month. Receipt by the',
	'Supplier is decisive for meeting the deadline.',
	'',
	'Liability for defects and warranty',
	'Section 5 Warranty',
	'The warranty on Zephyr-7 runs for 24 months from the delivery date. It',
	'covers repair free of charge or the replacement of parts that are shown',
	'to have failed because of a material or manufacturing defect.',
	'The warranty does not cover:',
	'a) wear parts as listed in Annex 2,',
	'b) damage caused by improper operation or work by third parties,',
	'c) damage caused by operation outside the specified conditions.',
	''
].join('\n');

describe('reflow', () => {
	it('keeps every character where it was, the citation offsets point into the raw text', () => {
		const flowed = reflow(contract);

		expect(flowed).toHaveLength(contract.length);
		for (let i = 0; i < contract.length; i++) {
			if (flowed[i] !== contract[i]) {
				expect([contract[i], flowed[i]]).toEqual(['\n', ' ']);
			}
		}
	});

	it('marks the same passage before and after', () => {
		const start = contract.indexOf('The warranty on');
		const end = contract.indexOf('The warranty does not');

		expect(reflow(contract).slice(start, end)).toBe(
			'The warranty on Zephyr-7 runs for 24 months from the delivery date. It ' +
				'covers repair free of charge or the replacement of parts that are shown ' +
				'to have failed because of a material or manufacturing defect.\n'
		);
	});

	it('joins lines the page layout broke mid-sentence', () => {
		const flowed = reflow(contract);
		expect(flowed).toContain(
			'contracting party named in the order form, hereinafter the "Customer".'
		);
		expect(flowed).toContain('London EC3R 6AF, hereinafter the "Supplier"');
	});

	it('keeps the break before an upper case start, that may be a heading or a table row', () => {
		expect(reflow(contract)).toContain('Receipt by the\nSupplier is decisive');
		expect(
			reflow('Maintenance package with travel to the site\nSpare parts kit for the warranty repair')
		).toContain('\n');
	});

	it('leaves headings on a line of their own', () => {
		const flowed = reflow(contract);
		expect(flowed).toContain('"Customer".\nSection 1 Subject matter\nThe Supplier provides');
		expect(flowed).toContain('reserved.\nSection 2 Term and termination\nThe agreement');
	});

	it('leaves list items apart', () => {
		expect(reflow(contract)).toContain('Annex 2,\nb) damage caused by improper operation');
	});

	it('keeps the blank line between pages', () => {
		expect(reflow(contract)).toContain('deadline.\n\nLiability for defects and warranty\n');
	});

	it('leaves short text alone', () => {
		expect(reflow('One line')).toBe('One line');
		expect(reflow('')).toBe('');
	});
});
