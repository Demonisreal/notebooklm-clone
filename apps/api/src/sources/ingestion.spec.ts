import { describe, expect, it, vi } from 'vitest';
import { IngestionService } from './ingestion.service';
import { UnsupportedSourceError } from './extractors/extractor';

type Row = {
	kind: string;
	storage_path: string | null;
	source_url: string | null;
	metadata: { rawText?: string };
};

// only the branching in extract() gets checked here, not the database
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
	it('reads uploaded text files from storage', async () => {
		const { extract, db } = serviceWithFile('Contents of an uploaded file');
		const result = await extract(db, {
			kind: 'text',
			storage_path: 'user/file.txt',
			source_url: null,
			metadata: {}
		});
		expect(result.text).toBe('Contents of an uploaded file');
	});

	it('reads markdown files from storage the same way', async () => {
		const { extract, db } = serviceWithFile('# Heading\n\nParagraph');
		const result = await extract(db, {
			kind: 'markdown',
			storage_path: 'user/file.md',
			source_url: null,
			metadata: {}
		});
		expect(result.text).toContain('Heading');
	});

	it('takes pasted text when there is no file behind it', async () => {
		const { extract, db } = serviceWithFile('should not be used');
		const result = await extract(db, {
			kind: 'text',
			storage_path: null,
			source_url: null,
			metadata: { rawText: 'Text pasted straight in' }
		});
		expect(result.text).toBe('Text pasted straight in');
	});

	it('flags an empty source instead of storing it as ready', async () => {
		const { extract, db } = serviceWithFile('   \n  ');
		await expect(
			extract(db, { kind: 'text', storage_path: 'user/empty.txt', source_url: null, metadata: {} })
		).rejects.toThrow(UnsupportedSourceError);
	});

	it('rejects a url without an address', async () => {
		const { extract, db } = serviceWithFile('');
		await expect(
			extract(db, { kind: 'url', storage_path: null, source_url: null, metadata: {} })
		).rejects.toThrow(UnsupportedSourceError);
	});
});
