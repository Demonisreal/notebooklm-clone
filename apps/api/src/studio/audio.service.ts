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

const SCRIPT_PROMPT = `Schreibe daraus ein kurzes Gespräch zwischen Anna und Jonas, das die Quellen für jemanden zusammenfasst, der sie nicht gelesen hat.

Regeln:
- Anna führt durch das Gespräch und stellt die Fragen, Jonas erklärt.
- Beginne mit einem Satz, worum es geht. Ende mit einem Fazit.
- Zwölf bis achtzehn Wortbeiträge, jeder höchstens drei Sätze.
- Gesprochene Sprache, keine Aufzählungen, keine Überschriften, keine Regieanweisungen.
- Nur Inhalte aus den Quellen. Zahlen und Fristen wörtlich übernehmen.
- Jede Zeile beginnt mit "Anna:" oder "Jonas:" und sonst nichts.`;

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

		// tts dauert je nach laenge bis zu einer minute, der status steht in der db
		void this.run(user, notebookId, (data as Row).id);
		return this.toOverview(user, data as Row);
	}

	private async run(user: AuthUser, notebookId: string, id: string) {
		const db = this.supabase.asAdmin();

		try {
			const context = await this.context(user, notebookId);
			if (!context) throw new Error('Für dieses Notizbuch gibt es noch keine Quellen.');

			const script = clean(
				await this.llm.complete(`${context}\n\n${SCRIPT_PROMPT}`, {
					system: 'Du schreibst Dialoge ausschließlich auf Basis der übergebenen Quellen.'
				})
			);
			if (!script) throw new Error('Das Modell hat kein verwertbares Skript geliefert.');

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
						error instanceof Error ? error.message : 'Die Zusammenfassung ließ sich nicht erzeugen.'
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

// modelle schieben gern eine einleitung oder code-fences davor
export function clean(raw: string): string {
	return raw
		.replace(/```[a-z]*\n?/gi, '')
		.split('\n')
		.filter((line) => /^\s*(Anna|Jonas)\s*:/i.test(line))
		.map((line) => line.trim())
		.join('\n');
}
