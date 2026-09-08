'use client';

import { ChevronLeft, Pencil } from 'lucide-react';
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

const TABS: { id: Tab; label: string }[] = [
	{ id: 'sources', label: 'Sources' },
	{ id: 'chat', label: 'Chat' },
	{ id: 'studio', label: 'Studio' }
];

export default function NotebookPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = use(params);
	const router = useRouter();

	const [notebook, setNotebook] = useState<Notebook | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [viewer, setViewer] = useState<Viewer | null>(null);
	const [notesKey, setNotesKey] = useState(0);
	const [tab, setTab] = useState<Tab>('chat');
	const [renaming, setRenaming] = useState(false);
	const [title, setTitle] = useState('');
	const [readyCount, setReadyCount] = useState(0);

	useEffect(() => {
		api<Notebook[]>('/notebooks')
			.then((all) => {
				const found = all.find((n) => n.id === id);
				if (!found) throw new ApiError('Notebook not found', 404);
				setNotebook(found);
				setTitle(found.title);
			})
			.catch((err) => {
				if (err instanceof ApiError && err.status === 401) return router.replace('/login');
				setError(err instanceof Error ? err.message : 'Could not load the notebook');
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
		setRenaming(false);
		const next = title.trim();
		if (!next || next === notebook?.title) {
			setTitle(notebook?.title ?? '');
			return;
		}
		setNotebook(
			await api<Notebook>(`/notebooks/${id}`, {
				method: 'PATCH',
				body: JSON.stringify({ title: next })
			})
		);
	}

	if (error) {
		return (
			<main className="grid min-h-screen place-items-center px-6">
				<div className="text-center">
					<p className="text-lg font-medium">{error}</p>
					<a
						href="/notebooks"
						className="mt-4 inline-block rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent-fg)]"
					>
						Back to notebooks
					</a>
				</div>
			</main>
		);
	}

	return (
		<div className="flex h-screen flex-col">
			<header className="flex items-center gap-3 border-b border-[var(--color-line)] px-4 py-2.5">
				<a
					href="/notebooks"
					aria-label="Back to notebooks"
					className="rounded-lg p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-panel)] hover:text-[var(--color-fg)]"
				>
					<ChevronLeft className="h-4 w-4" />
				</a>

				<span className="text-lg">{notebook?.emoji}</span>

				{renaming ? (
					<input
						autoFocus
						value={title}
						onChange={(e) => setTitle(e.target.value)}
						onBlur={rename}
						onKeyDown={(e) => {
							if (e.key === 'Enter') rename();
							if (e.key === 'Escape') {
								setTitle(notebook?.title ?? '');
								setRenaming(false);
							}
						}}
						className="min-w-0 flex-1 rounded-lg border border-[var(--color-accent)] bg-transparent px-2 py-0.5 text-sm font-medium outline-none"
					/>
				) : (
					<button
						onClick={() => setRenaming(true)}
						className="group flex min-w-0 items-center gap-1.5 rounded-lg px-2 py-0.5 transition hover:bg-[var(--color-panel)]"
					>
						<span className="truncate text-sm font-medium">{notebook?.title ?? 'Loading…'}</span>
						<Pencil className="h-3 w-3 shrink-0 text-[var(--color-faint)] opacity-0 transition group-hover:opacity-100" />
					</button>
				)}

				<nav className="ml-auto flex gap-0.5 rounded-lg bg-[var(--color-panel)] p-0.5 md:hidden">
					{TABS.map((t) => (
						<button
							key={t.id}
							onClick={() => setTab(t.id)}
							className={cn(
								'rounded-md px-2.5 py-1 text-xs transition',
								tab === t.id
									? 'bg-[var(--color-surface)] font-medium shadow-[var(--shadow-card)]'
									: 'text-[var(--color-muted)]'
							)}
						>
							{t.label}
						</button>
					))}
				</nav>
			</header>

			<div className="grid min-h-0 flex-1 md:grid-cols-[minmax(240px,1fr)_minmax(0,2.1fr)_minmax(280px,1.25fr)]">
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
						onReadyCount={setReadyCount}
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
						hasSources={readyCount > 0}
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
						<StudioPanel notebookId={id} reloadKey={notesKey} hasSources={readyCount > 0} />
					)}
				</section>
			</div>
		</div>
	);
}
