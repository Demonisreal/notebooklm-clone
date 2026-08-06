import { describe, expect, it, vi } from 'vitest';
import { IngestionService } from './ingestion.service';
import { UnsupportedSourceError } from './extractors/extractor';

type Row = {
	kind: string;
	storage_path: string | null;
	source_url: string | null;
	metadata: { rawText?: string };
};

// nur der verzweigungspfad in extract() wird geprueft, nicht die datenbank
function extractOf(service: IngestionService) {
	return (db: unknown, row: Row) =>
		(
			service as unknown as {
				extract(db: unknown, row: Row): Promise<{ text: string }>;
			}
		).extract(db, row);
}

function serviceWithFile(content: string) {
	const db = {
		storage: {
			from: () => ({
				download: async () => ({ data: { arrayBuffer: async () => Buffer.from(content) } })
			})
		}
	};
	const service = new IngestionService({} as never, { embed: vi.fn() } as never);
	return { extract: extractOf(service), db };
}

describe('IngestionService.extract', () => {
	it('liest hochgeladene textdateien aus dem storage', async () => {
		const { extract, db } = serviceWithFile('Inhalt einer hochgeladenen Datei');
		const result = await extract(db, {
			kind: 'text',
			storage_path: 'user/datei.txt',
			source_url: null,
			metadata: {}
		});
		expect(result.text).toBe('Inhalt einer hochgeladenen Datei');
	});

	it('liest markdown-dateien ebenso aus dem storage', async () => {
		const { extract, db } = serviceWithFile('# Titel\n\nAbsatz');
		const result = await extract(db, {
			kind: 'markdown',
			storage_path: 'user/datei.md',
			source_url: null,
			metadata: {}
		});
		expect(result.text).toContain('Titel');
	});

	it('nimmt eingefuegten text, wenn keine datei dahintersteht', async () => {
		const { extract, db } = serviceWithFile('sollte nicht benutzt werden');
		const result = await extract(db, {
			kind: 'text',
			storage_path: null,
			source_url: null,
			metadata: { rawText: 'Direkt eingefügter Text' }
		});
		expect(result.text).toBe('Direkt eingefügter Text');
	});

	it('meldet eine leere quelle statt sie als fertig zu speichern', async () => {
		const { extract, db } = serviceWithFile('   \n  ');
		await expect(
			extract(db, { kind: 'text', storage_path: 'user/leer.txt', source_url: null, metadata: {} })
		).rejects.toThrow(UnsupportedSourceError);
	});

	it('lehnt eine url ohne adresse ab', async () => {
		const { extract, db } = serviceWithFile('');
		await expect(
			extract(db, { kind: 'url', storage_path: null, source_url: null, metadata: {} })
		).rejects.toThrow(UnsupportedSourceError);
	});
});
