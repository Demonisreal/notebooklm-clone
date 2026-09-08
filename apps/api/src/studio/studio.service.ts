import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import type { MindMapNode, StudioKind } from 'shared';
import type { AuthUser } from '../auth/jwt.guard';
import { LLM_PROVIDER, LlmProvider } from '../llm/llm.provider';
import { NotesService } from '../notes/notes.service';
import { SupabaseService } from '../supabase/supabase.service';

// gemini flash handles far more, but long prompts cost time and quota
const MAX_CONTEXT_CHARS = 24000;

const INSTRUCTIONS: Record<Exclude<StudioKind, 'mindmap' | 'audio'>, string> = {
	briefing:
		'Condense the sources into a briefing: what this is about, the key statements as bullet points, open questions. At most 400 words.',
	faq: 'Write six to eight questions someone would ask about these sources and answer each of them in two or three sentences.',
	studyguide:
		'Put together a study guide: the central terms with a short explanation, then five comprehension questions without answers.'
};

@Injectable()
export class StudioService {
	constructor(
		private readonly supabase: SupabaseService,
		private readonly notes: NotesService,
		@Inject(LLM_PROVIDER) private readonly llm: LlmProvider
	) {}

	async generate(user: AuthUser, notebookId: string, kind: Exclude<StudioKind, 'audio'>) {
		const context = await this.context(user, notebookId);
		if (!context) {
			throw new InternalServerErrorException('This notebook has no sources yet.');
		}

		if (kind === 'mindmap') return { kind, tree: await this.mindmap(context) };

		const text = await this.llm.complete(`${context}\n\n${INSTRUCTIONS[kind]}`, {
			system: 'You work from the given sources only and answer in their language.'
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
			`${context}\n\nDraw a mind map of the sources as JSON. Format: {"label": "Topic", "children": [{"label": "Subtopic", "children": []}]}. At most three levels, JSON only, no prose.`,
			{ system: 'You answer with valid JSON and nothing else.' }
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

function labelFor(kind: Exclude<StudioKind, 'audio'>): string {
	if (kind === 'briefing') return 'Briefing';
	if (kind === 'faq') return 'FAQ';
	return 'Study guide';
}

// models like to wrap json in code fences or write text in front of it
export function parseTree(raw: string): MindMapNode {
	const start = raw.indexOf('{');
	const end = raw.lastIndexOf('}');
	if (start === -1 || end <= start) return { label: 'No structure detected' };

	try {
		const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
		return normalize(parsed) ?? { label: 'No structure detected' };
	} catch {
		return { label: 'No structure detected' };
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
