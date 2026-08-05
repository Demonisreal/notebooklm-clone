'use client';

import { useCallback, useEffect, useState } from 'react';
import { studioLabels, type MindMapNode, type Note, type StudioKind } from 'shared';
import { api } from '@/lib/api';
import { MindMap } from './mind-map';

type Props = { notebookId: string; reloadKey: number };

export function StudioPanel({ notebookId, reloadKey }: Props) {
	const [notes, setNotes] = useState<Note[]>([]);
	const [tree, setTree] = useState<MindMapNode | null>(null);
	const [busy, setBusy] = useState<StudioKind | null>(null);
	const [error, setError] = useState<string | null>(null);

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
			setError(err instanceof Error ? err.message : 'Erzeugen fehlgeschlagen');
		} finally {
			setBusy(null);
		}
	}

	async function remove(id: string) {
		await api(`/notes/${id}`, { method: 'DELETE' });
		await load();
	}

	return (
		<div className="flex h-full flex-col">
			<div className="border-b border-[var(--color-line)] px-4 py-3">
				<h2 className="text-sm font-semibold">Studio</h2>
			</div>

			<div className="grid grid-cols-2 gap-2 border-b border-[var(--color-line)] px-4 py-3">
				{(Object.keys(studioLabels) as StudioKind[]).map((kind) => (
					<button
						key={kind}
						onClick={() => generate(kind)}
						disabled={busy !== null}
						className="rounded-md border border-[var(--color-line)] px-2 py-1.5 text-xs hover:border-[var(--color-accent)] disabled:opacity-50"
					>
						{busy === kind ? 'läuft…' : studioLabels[kind]}
					</button>
				))}
			</div>

			{error && <p className="px-4 py-2 text-xs text-red-500">{error}</p>}

			<div className="flex-1 overflow-y-auto p-3">
				{tree && (
					<div className="mb-4">
						<div className="mb-1 flex items-center justify-between">
							<h3 className="text-xs font-semibold">Mind Map</h3>
							<button
								onClick={() => setTree(null)}
								className="text-xs text-[var(--color-muted)] hover:underline"
							>
								ausblenden
							</button>
						</div>
						<MindMap tree={tree} />
					</div>
				)}

				<h3 className="mb-2 text-xs font-semibold text-[var(--color-muted)]">
					Notizen ({notes.length})
				</h3>

				{notes.length === 0 && (
					<p className="px-1 py-6 text-center text-xs text-[var(--color-muted)]">
						Noch keine Notizen. Speichere eine Antwort aus dem Chat oder erzeuge oben ein Briefing.
					</p>
				)}

				<ul className="space-y-2">
					{notes.map((note) => (
						<li
							key={note.id}
							className="group rounded-md border border-[var(--color-line)] bg-[var(--color-panel)] p-2"
						>
							<div className="flex items-start justify-between gap-2">
								<span className="text-xs font-medium">
									{note.title ?? (note.origin === 'chat' ? 'Aus dem Chat' : 'Notiz')}
								</span>
								<button
									onClick={() => remove(note.id)}
									className="text-xs text-[var(--color-muted)] opacity-0 hover:text-red-500 group-hover:opacity-100"
								>
									löschen
								</button>
							</div>
							<p className="mt-1 line-clamp-6 whitespace-pre-wrap text-xs text-[var(--color-muted)]">
								{note.content}
							</p>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}
