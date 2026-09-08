'use client';

import { FileText, HelpCircle, Network, Sparkles, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import type { MindMapNode, Note, StudioKind } from 'shared';
import { api } from '@/lib/api';
import { AudioOverview } from './audio-overview';
import { MindMap } from './mind-map';

type Props = { notebookId: string; reloadKey: number; hasSources: boolean };

const ACTIONS: { kind: StudioKind; label: string; icon: typeof FileText; hint: string }[] = [
	{ kind: 'briefing', label: 'Briefing', icon: Sparkles, hint: 'Short overview of all sources' },
	{ kind: 'faq', label: 'FAQ', icon: HelpCircle, hint: 'Common questions with answers' },
	{
		kind: 'studyguide',
		label: 'Study guide',
		icon: FileText,
		hint: 'Key terms and review questions'
	},
	{ kind: 'mindmap', label: 'Mind map', icon: Network, hint: 'Structure as a diagram' }
];

export function StudioPanel({ notebookId, reloadKey, hasSources }: Props) {
	const [notes, setNotes] = useState<Note[] | null>(null);
	const [tree, setTree] = useState<MindMapNode | null>(null);
	const [busy, setBusy] = useState<StudioKind | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [open, setOpen] = useState<string | null>(null);

	const load = useCallback(async () => {
		setNotes(await api<Note[]>(`/notebooks/${notebookId}/notes`));
	}, [notebookId]);

	useEffect(() => {
		void load();
	}, [load, reloadKey]);

	async function generate(kind: StudioKind) {
		setBusy(kind);
		setError(null);
		try {
			const result = await api<{ tree?: MindMapNode }>(`/notebooks/${notebookId}/studio/${kind}`, {
				method: 'POST'
			});
			if (kind === 'mindmap' && result.tree) setTree(result.tree);
			else await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Generating failed');
		} finally {
			setBusy(null);
		}
	}

	return (
		<div className="bg-[var(--color-panel)]/40 flex h-full flex-col">
			<header className="px-5 pb-3 pt-5">
				<h2 className="font-medium">Studio</h2>
			</header>

			<div className="grid grid-cols-2 gap-2 px-4 pb-4">
				{ACTIONS.map(({ kind, label, icon: Icon, hint }) => (
					<button
						key={kind}
						onClick={() => generate(kind)}
						disabled={busy !== null || !hasSources}
						title={hasSources ? hint : 'Add a source first'}
						className="flex flex-col items-start gap-1.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 text-left transition hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-card)] disabled:opacity-40 disabled:hover:border-[var(--color-line)] disabled:hover:shadow-none"
					>
						<Icon className="h-4 w-4 text-[var(--color-accent)]" />
						<span className="text-xs font-medium">{busy === kind ? 'working…' : label}</span>
					</button>
				))}
			</div>

			{error && (
				<p className="animate-fade mx-4 mb-3 rounded-lg bg-[var(--color-bad-soft)] px-3 py-2 text-xs text-[var(--color-bad)]">
					{error}
				</p>
			)}

			<div className="flex-1 overflow-y-auto px-4 pb-4">
				<AudioOverview notebookId={notebookId} hasSources={hasSources} />

				{tree && (
					<div className="animate-rise mb-5">
						<div className="mb-2 flex items-center justify-between">
							<h3 className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
								Mind map
							</h3>
							<button
								onClick={() => setTree(null)}
								className="text-xs text-[var(--color-faint)] hover:text-[var(--color-fg)]"
							>
								hide
							</button>
						</div>
						<MindMap tree={tree} />
					</div>
				)}

				<h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
					Notes {notes && notes.length > 0 && `(${notes.length})`}
				</h3>

				{notes?.length === 0 && (
					<p className="rounded-xl border border-dashed border-[var(--color-line)] px-4 py-8 text-center text-xs leading-relaxed text-[var(--color-muted)]">
						No notes yet. Save an answer from the chat or generate a briefing above.
					</p>
				)}

				<ul className="space-y-2">
					{notes?.map((note) => {
						const expanded = open === note.id;
						return (
							<li
								key={note.id}
								className="animate-fade group rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3 transition hover:border-[var(--color-line-strong)]"
							>
								<div className="flex items-start justify-between gap-2">
									<button
										onClick={() => setOpen(expanded ? null : note.id)}
										className="flex-1 text-left text-xs font-medium"
									>
										{note.title ?? (note.origin === 'chat' ? 'From the chat' : 'Note')}
									</button>
									<button
										onClick={async () => {
											await api(`/notes/${note.id}`, { method: 'DELETE' });
											await load();
										}}
										aria-label="Delete note"
										className="rounded p-1 text-[var(--color-faint)] opacity-0 transition hover:bg-[var(--color-panel)] hover:text-[var(--color-bad)] group-hover:opacity-100"
									>
										<Trash2 className="h-3 w-3" />
									</button>
								</div>

								<p
									className={`mt-1.5 whitespace-pre-wrap text-xs leading-relaxed text-[var(--color-muted)] ${expanded ? '' : 'line-clamp-3'}`}
								>
									{note.content}
								</p>

								{note.content.length > 160 && (
									<button
										onClick={() => setOpen(expanded ? null : note.id)}
										className="mt-1.5 text-[11px] text-[var(--color-accent)]"
									>
										{expanded ? 'show less' : 'show more'}
									</button>
								)}
							</li>
						);
					})}
				</ul>
			</div>
		</div>
	);
}
