'use client';

import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import type { Citation, Notebook } from 'shared';
import { ChatPanel } from '@/components/chat-panel';
import { SourcesPanel } from '@/components/sources-panel';
import { SourceViewer } from '@/components/source-viewer';
import { StudioPanel } from '@/components/studio-panel';
import { api, ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';

type Viewer = {
	sourceId: string;
	highlight: { charStart: number; charEnd: number; page: number | null } | null;
};
type Tab = 'sources' | 'chat' | 'studio';

export default function NotebookPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = use(params);
	const router = useRouter();

	const [notebook, setNotebook] = useState<Notebook | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [viewer, setViewer] = useState<Viewer | null>(null);
	const [notesKey, setNotesKey] = useState(0);
	const [tab, setTab] = useState<Tab>('chat');

	useEffect(() => {
		api<Notebook[]>('/notebooks')
			.then((all) => {
				const found = all.find((n) => n.id === id);
				if (!found) throw new ApiError('Notizbuch nicht gefunden', 404);
				setNotebook(found);
			})
			.catch((err) => {
				if (err instanceof ApiError && err.status === 401) return router.replace('/login');
				setError(err instanceof Error ? err.message : 'Konnte nicht laden');
			});
	}, [id, router]);

	const toggle = useCallback((sourceId: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(sourceId)) next.delete(sourceId);
			else next.add(sourceId);
			return next;
		});
	}, []);

	const openCitation = useCallback((citation: Citation) => {
		setViewer({
			sourceId: citation.sourceId,
			highlight: {
				charStart: citation.charStart,
				charEnd: citation.charEnd,
				page: citation.page
			}
		});
		setTab('studio');
	}, []);

	const saveNote = useCallback(
		async (content: string) => {
			await api(`/notebooks/${id}/notes`, {
				method: 'POST',
				body: JSON.stringify({ content, origin: 'chat' })
			});
			setNotesKey((k) => k + 1);
		},
		[id]
	);

	async function rename() {
		const title = prompt('Neuer Titel', notebook?.title);
		if (!title?.trim()) return;

		const updated = await api<Notebook>(`/notebooks/${id}`, {
			method: 'PATCH',
			body: JSON.stringify({ title: title.trim() })
		});
		setNotebook(updated);
	}

	if (error) {
		return (
			<main className="flex min-h-screen items-center justify-center">
				<div className="text-center">
					<p className="text-sm">{error}</p>
					<a href="/notebooks" className="mt-2 inline-block text-sm text-[var(--color-accent)]">
						Zurück zur Übersicht
					</a>
				</div>
			</main>
		);
	}

	return (
		<div className="flex h-screen flex-col">
			<header className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-2">
				<div className="flex min-w-0 items-center gap-2">
					<a href="/notebooks" className="text-sm text-[var(--color-muted)] hover:underline">
						←
					</a>
					<span>{notebook?.emoji}</span>
					<button onClick={rename} className="truncate text-sm font-medium hover:underline">
						{notebook?.title ?? 'Wird geladen…'}
					</button>
				</div>

				<nav className="flex gap-1 md:hidden">
					{(['sources', 'chat', 'studio'] as Tab[]).map((t) => (
						<button
							key={t}
							onClick={() => setTab(t)}
							className={cn(
								'rounded px-2 py-1 text-xs',
								tab === t ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-muted)]'
							)}
						>
							{t === 'sources' ? 'Quellen' : t === 'chat' ? 'Chat' : 'Studio'}
						</button>
					))}
				</nav>
			</header>

			<div className="grid min-h-0 flex-1 md:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)_minmax(260px,1.2fr)]">
				<section
					className={cn(
						'min-h-0 border-[var(--color-line)] md:block md:border-r',
						tab === 'sources' ? 'block' : 'hidden'
					)}
				>
					<SourcesPanel
						notebookId={id}
						selected={selected}
						onToggle={toggle}
						onOpen={(sourceId) => {
							setViewer({ sourceId, highlight: null });
							setTab('studio');
						}}
					/>
				</section>

				<section
					className={cn(
						'min-h-0 border-[var(--color-line)] md:block md:border-r',
						tab === 'chat' ? 'block' : 'hidden'
					)}
				>
					<ChatPanel
						notebookId={id}
						sourceIds={[...selected]}
						onCite={openCitation}
						onSaveNote={saveNote}
					/>
				</section>

				<section className={cn('min-h-0 md:block', tab === 'studio' ? 'block' : 'hidden')}>
					{viewer ? (
						<SourceViewer
							sourceId={viewer.sourceId}
							highlight={viewer.highlight}
							onClose={() => setViewer(null)}
						/>
					) : (
						<StudioPanel notebookId={id} reloadKey={notesKey} />
					)}
				</section>
			</div>
		</div>
	);
}
