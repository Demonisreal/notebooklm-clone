import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import type { MindMapNode, StudioKind } from 'shared';
import type { AuthUser } from '../auth/jwt.guard';
import { LLM_PROVIDER, LlmProvider } from '../llm/llm.provider';
import { NotesService } from '../notes/notes.service';
import { SupabaseService } from '../supabase/supabase.service';

// gemini flash schafft deutlich mehr, aber lange prompts kosten zeit und quota
const MAX_CONTEXT_CHARS = 24000;

const INSTRUCTIONS: Record<Exclude<StudioKind, 'mindmap'>, string> = {
	briefing:
		'Fasse die Quellen zu einem Briefing zusammen: worum es geht, die wichtigsten Aussagen als Stichpunkte, offene Fragen. Höchstens 400 Wörter.',
	faq: 'Formuliere sechs bis acht Fragen, die jemand zu diesen Quellen stellen würde, und beantworte sie jeweils in zwei bis drei Sätzen.',
	studyguide:
		'Erstelle eine Lernhilfe: die zentralen Begriffe mit kurzer Erklärung, danach fünf Verständnisfragen ohne Antworten.'
};

@Injectable()
export class StudioService {
	constructor(
		private readonly supabase: SupabaseService,
		private readonly notes: NotesService,
		@Inject(LLM_PROVIDER) private readonly llm: LlmProvider
	) {}

	async generate(user: AuthUser, notebookId: string, kind: StudioKind) {
		const context = await this.context(user, notebookId);
		if (!context) {
			throw new InternalServerErrorException('Für dieses Notizbuch gibt es noch keine Quellen.');
		}

		if (kind === 'mindmap') return { kind, tree: await this.mindmap(context) };

		const text = await this.llm.complete(`${context}\n\n${INSTRUCTIONS[kind]}`, {
			system: 'Du arbeitest ausschließlich mit den übergebenen Quellen und antwortest auf Deutsch.'
		});

		const note = await this.notes.create(user, notebookId, {
			title: labelFor(kind),
			content: text.trim(),
			origin: 'studio'
		});

		return { kind, note };
	}

	private async mindmap(context: string): Promise<MindMapNode> {
		const raw = await this.llm.complete(
			`${context}\n\nErstelle eine Mind Map der Quellen als JSON. Format: {"label": "Thema", "children": [{"label": "Unterthema", "children": []}]}. Höchstens drei Ebenen, nur JSON, kein Fließtext.`,
			{ system: 'Du antwortest ausschließlich mit gültigem JSON.' }
		);

		return parseTree(raw);
	}

	private async context(user: AuthUser, notebookId: string): Promise<string | null> {
		const { data, error } = await this.supabase
			.forUser(user.token)
			.from('chunks')
			.select('content, idx, source_id')
			.eq('notebook_id', notebookId)
			.order('source_id')
			.order('idx')
			.limit(200);

		if (error) throw new InternalServerErrorException(error.message);
		if (!data?.length) return null;

		let text = '';
		for (const row of data) {
			if (text.length + row.content.length > MAX_CONTEXT_CHARS) break;
			text += `${row.content}\n\n`;
		}
		return text.trim();
	}
}

function labelFor(kind: StudioKind): string {
	if (kind === 'briefing') return 'Briefing';
	if (kind === 'faq') return 'Häufige Fragen';
	return 'Lernhilfe';
}

// modelle verpacken json gern in code-fences oder schreiben text davor
export function parseTree(raw: string): MindMapNode {
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start === -1 || end <= start) return { label: 'Keine Struktur erkannt' };

	try {
		const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
		return normalize(parsed) ?? { label: 'Keine Struktur erkannt' };
	} catch {
		return { label: 'Keine Struktur erkannt' };
	}
}

function normalize(value: unknown, depth = 0): MindMapNode | null {
	if (depth > 4 || typeof value !== 'object' || value === null) return null;

	const node = value as { label?: unknown; children?: unknown };
	if (typeof node.label !== 'string' || !node.label.trim()) return null;

	const children = Array.isArray(node.children)
		? node.children.map((child) => normalize(child, depth + 1)).filter((n): n is MindMapNode => !!n)
		: [];

	return children.length ? { label: node.label, children } : { label: node.label };
}
