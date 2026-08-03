import { Inject, Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import { LLM_PROVIDER, LlmProvider } from '../llm/llm.provider';
import { chunk } from './chunker';
import { Extracted, pageForOffset, UnsupportedSourceError } from './extractors/extractor';
import { extractDocx } from './extractors/docx';
import { fetchArticle } from './extractors/html';
import { extractPdf } from './extractors/pdf';

const EMBED_BATCH = 50;
const STALE_AFTER_MINUTES = 10;

type SourceRow = {
	id: string;
	notebook_id: string;
	user_id: string;
	kind: string;
	storage_path: string | null;
	source_url: string | null;
	metadata: { rawText?: string };
};

@Injectable()
export class IngestionService implements OnApplicationBootstrap {
	private readonly log = new Logger(IngestionService.name);

	constructor(
		private readonly supabase: SupabaseService,
		@Inject(LLM_PROVIDER) private readonly llm: LlmProvider
	) {}

	// in-process verarbeitung ueberlebt keinen neustart, sonst haengen quellen ewig auf processing
	async onApplicationBootstrap() {
		const cutoff = new Date(Date.now() - STALE_AFTER_MINUTES * 60_000).toISOString();
		const { data } = await this.supabase
			.asAdmin()
			.from('sources')
			.update({
				status: 'error',
				error_message: 'Verarbeitung wurde durch einen Neustart unterbrochen.'
			})
			.eq('status', 'processing')
			.lt('processing_started_at', cutoff)
			.select('id');

		if (data?.length) this.log.warn(`${data.length} unterbrochene Quelle(n) zurückgesetzt`);
	}

	// laeuft absichtlich ohne await im controller, der status steht in der db
	async run(sourceId: string): Promise<void> {
		const db = this.supabase.asAdmin();

		const { data: source } = await db
			.from('sources')
			.select('id, notebook_id, user_id, kind, storage_path, source_url, metadata')
			.eq('id', sourceId)
			.single();

		if (!source) return;

		await db
			.from('sources')
			.update({ status: 'processing', processing_started_at: new Date().toISOString() })
			.eq('id', sourceId);

		try {
			const extracted = await this.extract(db, source as SourceRow);
			await this.store(db, source as SourceRow, extracted);

			await db
				.from('sources')
				.update({
					status: 'ready',
					extracted_text: extracted.text,
					char_count: extracted.text.length,
					error_message: null
				})
				.eq('id', sourceId);
		} catch (error) {
			const message =
				error instanceof UnsupportedSourceError
					? error.message
					: 'Die Quelle konnte nicht verarbeitet werden.';

			if (!(error instanceof UnsupportedSourceError)) this.log.error(error);
			await db
				.from('sources')
				.update({ status: 'error', error_message: message })
				.eq('id', sourceId);
		}
	}

	private async extract(db: SupabaseClient, source: SourceRow): Promise<Extracted> {
		if (source.kind === 'url') {
			if (!source.source_url) throw new UnsupportedSourceError('Keine Adresse hinterlegt.');
			return fetchArticle(source.source_url);
		}

		if (source.kind === 'text' || source.kind === 'markdown') {
			const raw = source.metadata?.rawText ?? '';
			if (!raw.trim()) throw new UnsupportedSourceError('Der Text ist leer.');
			return { text: raw, pageStarts: [] };
		}

		const buffer = await this.download(db, source);
		if (source.kind === 'pdf') return extractPdf(buffer);
		if (source.kind === 'docx') return extractDocx(buffer);

		throw new UnsupportedSourceError('Dieser Dateityp wird nicht unterstützt.');
	}

	private async download(db: SupabaseClient, source: SourceRow): Promise<Buffer> {
		if (!source.storage_path) throw new UnsupportedSourceError('Datei fehlt.');

		const { data, error } = await db.storage.from('sources').download(source.storage_path);
		if (error || !data) throw new UnsupportedSourceError('Die Datei konnte nicht geladen werden.');

		return Buffer.from(await data.arrayBuffer());
	}

	private async store(db: SupabaseClient, source: SourceRow, extracted: Extracted) {
		const chunks = chunk(extracted.text);
		if (chunks.length === 0) throw new UnsupportedSourceError('Die Quelle enthält keinen Text.');

		await db.from('chunks').delete().eq('source_id', source.id);

		for (let i = 0; i < chunks.length; i += EMBED_BATCH) {
			const batch = chunks.slice(i, i + EMBED_BATCH);
			const embeddings = await this.llm.embed(batch.map((c) => c.content));

			const rows = batch.map((c, n) => ({
				source_id: source.id,
				notebook_id: source.notebook_id,
				idx: c.idx,
				content: c.content,
				// chunks laufen ueber seitengrenzen, die mitte trifft oefter als der anfang
				page: pageForOffset(extracted.pageStarts, Math.floor((c.charStart + c.charEnd) / 2)),
				char_start: c.charStart,
				char_end: c.charEnd,
				embedding: JSON.stringify(embeddings[n])
			}));

			const { error } = await db.from('chunks').insert(rows);
			if (error) throw new Error(error.message);
		}
	}
}
