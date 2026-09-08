import { randomUUID } from 'node:crypto';
import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import type { AudioOverview } from 'shared';
import type { AuthUser } from '../auth/jwt.guard';
import { LLM_PROVIDER, LlmProvider, Speaker } from '../llm/llm.provider';
import { SupabaseService } from '../supabase/supabase.service';
import { durationSeconds, toWav } from './wav';

const SPEAKERS: Speaker[] = [
	{ name: 'Anna', voice: 'Kore' },
	{ name: 'Jonas', voice: 'Puck' }
];

const MAX_CONTEXT_CHARS = 12000;
const URL_TTL_SECONDS = 3600;

const SCRIPT_PROMPT = `Turn this into a short conversation between Anna and Jonas that sums up the sources for someone who has not read them.

Rules:
- Anna leads the conversation and asks the questions, Jonas explains.
- Open with one sentence on what this is about. Close with a takeaway.
- Twelve to eighteen turns, each at most three sentences.
- Spoken language, no bullet points, no headings, no stage directions.
- Only what the sources say. Carry over numbers and deadlines verbatim.
- Every line starts with "Anna:" or "Jonas:" and nothing else.`;

type Row = {
	id: string;
	status: AudioOverview['status'];
	script: string | null;
	storage_path: string | null;
	duration_seconds: number | null;
	error_message: string | null;
	created_at: string;
};

const COLUMNS = 'id, status, script, storage_path, duration_seconds, error_message, created_at';

@Injectable()
export class AudioService {
	private readonly log = new Logger(AudioService.name);

	constructor(
		private readonly supabase: SupabaseService,
		@Inject(LLM_PROVIDER) private readonly llm: LlmProvider
	) {}

	async get(user: AuthUser, notebookId: string): Promise<AudioOverview | null> {
		const { data, error } = await this.supabase
			.forUser(user.token)
			.from('audio_overviews')
			.select(COLUMNS)
			.eq('notebook_id', notebookId)
			.maybeSingle();

		if (error) throw new InternalServerErrorException(error.message);
		if (!data) return null;

		return this.toOverview(user, data as Row);
	}

	async start(user: AuthUser, notebookId: string): Promise<AudioOverview> {
		const { data, error } = await this.supabase
			.forUser(user.token)
			.from('audio_overviews')
			.upsert(
				{
					notebook_id: notebookId,
					user_id: user.id,
					status: 'processing',
					script: null,
					storage_path: null,
					duration_seconds: null,
					error_message: null
				},
				{ onConflict: 'notebook_id' }
			)
			.select(COLUMNS)
			.single();

		if (error) throw new InternalServerErrorException(error.message);

		// tts takes up to a minute depending on length, the status lives in the db
		void this.run(user, notebookId, (data as Row).id);
		return this.toOverview(user, data as Row);
	}

	private async run(user: AuthUser, notebookId: string, id: string) {
		const db = this.supabase.asAdmin();

		try {
			const context = await this.context(user, notebookId);
			if (!context) throw new Error('This notebook has no sources yet.');

			const script = clean(
				await this.llm.complete(`${context}\n\n${SCRIPT_PROMPT}`, {
					system: 'You write dialogue from the given sources and nothing else.'
				})
			);
			if (!script) throw new Error('The model returned no usable script.');

			const { pcm, sampleRate } = await this.llm.speak(script, SPEAKERS);
			const path = `${user.id}/${notebookId}/${randomUUID()}.wav`;

			const upload = await db.storage
				.from('audio')
				.upload(path, toWav(pcm, sampleRate), { contentType: 'audio/wav', upsert: true });
			if (upload.error) throw new Error(upload.error.message);

			await db
				.from('audio_overviews')
				.update({
					status: 'ready',
					script,
					storage_path: path,
					duration_seconds: durationSeconds(pcm, sampleRate),
					error_message: null
				})
				.eq('id', id);
		} catch (error) {
			this.log.error(error);
			await db
				.from('audio_overviews')
				.update({
					status: 'error',
					error_message:
						error instanceof Error ? error.message : 'The overview could not be generated.'
				})
				.eq('id', id);
		}
	}

	private async toOverview(user: AuthUser, row: Row): Promise<AudioOverview> {
		let url: string | null = null;

		if (row.storage_path) {
			const { data } = await this.supabase
				.forUser(user.token)
				.storage.from('audio')
				.createSignedUrl(row.storage_path, URL_TTL_SECONDS);
			url = data?.signedUrl ? this.supabase.toPublicUrl(data.signedUrl) : null;
		}

		return {
			id: row.id,
			status: row.status,
			script: row.script,
			url,
			durationSeconds: row.duration_seconds,
			errorMessage: row.error_message,
			createdAt: row.created_at
		};
	}

	private async context(user: AuthUser, notebookId: string): Promise<string | null> {
		const { data } = await this.supabase
			.forUser(user.token)
			.from('chunks')
			.select('content, idx, source_id')
			.eq('notebook_id', notebookId)
			.order('source_id')
			.order('idx')
			.limit(120);

		if (!data?.length) return null;

		let text = '';
		for (const row of data) {
			if (text.length + row.content.length > MAX_CONTEXT_CHARS) break;
			text += `${row.content}\n\n`;
		}
		return text.trim();
	}
}

// models like to push an intro or code fences in front
export function clean(raw: string): string {
	return raw
		.replace(/```[a-z]*\n?/gi, '')
		.split('\n')
		.filter((line) => /^\s*(Anna|Jonas)\s*:/i.test(line))
		.map((line) => line.trim())
		.join('\n');
}
