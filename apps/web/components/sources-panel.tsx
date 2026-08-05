'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Source } from 'shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';

type Props = {
	notebookId: string;
	selected: Set<string>;
	onToggle: (id: string) => void;
	onOpen: (sourceId: string) => void;
};

const STATUS_LABEL: Record<Source['status'], string> = {
	pending: 'wartet',
	processing: 'wird gelesen',
	ready: 'bereit',
	error: 'Fehler'
};

export function SourcesPanel({ notebookId, selected, onToggle, onOpen }: Props) {
	const [sources, setSources] = useState<Source[]>([]);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [adding, setAdding] = useState<'url' | 'text' | null>(null);
	const fileInput = useRef<HTMLInputElement>(null);

	const load = useCallback(async () => {
		setSources(await api<Source[]>(`/notebooks/${notebookId}/sources`));
	}, [notebookId]);

	useEffect(() => {
		void load();
	}, [load]);

	// ohne die publication und eine select-policy verwirft realtime die events stillschweigend
	useEffect(() => {
		const channel = supabase()
			.channel(`sources-${notebookId}`)
			.on(
				'postgres_changes',
				{
					event: '*',
					schema: 'public',
					table: 'sources',
					filter: `notebook_id=eq.${notebookId}`
				},
				() => void load()
			)
			.subscribe();

		return () => {
			void supabase().removeChannel(channel);
		};
	}, [notebookId, load]);

	async function upload(file: File) {
		setBusy(true);
		setError(null);
		try {
			const { path, signedUrl } = await api<{ path: string; signedUrl: string }>(
				`/notebooks/${notebookId}/sources/upload-url`,
				{ method: 'POST', body: JSON.stringify({ filename: file.name, size: file.size }) }
			);

			const upload = await fetch(signedUrl, { method: 'PUT', body: file });
			if (!upload.ok) throw new Error('Die Datei ließ sich nicht hochladen');

			await api(`/notebooks/${notebookId}/sources`, {
				method: 'POST',
				body: JSON.stringify({ kind: 'file', storagePath: path, title: file.name })
			});
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Hochladen fehlgeschlagen');
		} finally {
			setBusy(false);
			if (fileInput.current) fileInput.current.value = '';
		}
	}

	async function add(body: unknown) {
		setBusy(true);
		setError(null);
		try {
			await api(`/notebooks/${notebookId}/sources`, {
				method: 'POST',
				body: JSON.stringify(body)
			});
			setAdding(null);
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Hinzufügen fehlgeschlagen');
		} finally {
			setBusy(false);
		}
	}

	async function remove(id: string) {
		await api(`/sources/${id}`, { method: 'DELETE' });
		await load();
	}

	async function retry(id: string) {
		await api(`/sources/${id}/reprocess`, { method: 'POST' });
		await load();
	}

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
				<h2 className="text-sm font-semibold">Quellen</h2>
				<span className="text-xs text-[var(--color-muted)]">{sources.length}</span>
			</div>

			<div className="flex flex-wrap gap-2 border-b border-[var(--color-line)] px-4 py-3">
				<button
					onClick={() => fileInput.current?.click()}
					disabled={busy}
					className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
				>
					Datei
				</button>
				<button
					onClick={() => setAdding(adding === 'url' ? null : 'url')}
					className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs"
				>
					Website
				</button>
				<button
					onClick={() => setAdding(adding === 'text' ? null : 'text')}
					className="rounded-md border border-[var(--color-line)] px-3 py-1.5 text-xs"
				>
					Text
				</button>
				<input
					ref={fileInput}
					type="file"
					accept=".pdf,.docx,.txt,.md"
					className="hidden"
					onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
				/>
			</div>

			{adding === 'url' && <UrlForm busy={busy} onSubmit={(url) => add({ kind: 'url', url })} />}
			{adding === 'text' && (
				<TextForm
					busy={busy}
					onSubmit={(title, content) => add({ kind: 'text', title, content })}
				/>
			)}

			{error && <p className="px-4 py-2 text-xs text-red-500">{error}</p>}

			<ul className="flex-1 overflow-y-auto p-2">
				{sources.length === 0 && (
					<li className="px-2 py-8 text-center text-xs text-[var(--color-muted)]">
						Noch keine Quellen. Lade ein PDF hoch, um zu starten.
					</li>
				)}
				{sources.map((source) => (
					<li key={source.id} className="group rounded-md px-2 py-2 hover:bg-[var(--color-panel)]">
						<div className="flex items-start gap-2">
							<input
								type="checkbox"
								checked={selected.has(source.id)}
								disabled={source.status !== 'ready'}
								onChange={() => onToggle(source.id)}
								className="mt-1"
							/>
							<div className="min-w-0 flex-1">
								<button
									onClick={() => source.status === 'ready' && onOpen(source.id)}
									className="block w-full truncate text-left text-sm"
									title={source.title}
								>
									{source.title}
								</button>
								<div className="mt-0.5 flex items-center gap-2">
									<StatusBadge status={source.status} />
									{source.status === 'error' && (
										<button
											onClick={() => retry(source.id)}
											className="text-xs text-[var(--color-accent)] hover:underline"
										>
											erneut
										</button>
									)}
									<button
										onClick={() => remove(source.id)}
										className="text-xs text-[var(--color-muted)] opacity-0 hover:text-red-500 group-hover:opacity-100"
									>
										löschen
									</button>
								</div>
								{source.errorMessage && (
									<p className="mt-1 text-xs text-red-500">{source.errorMessage}</p>
								)}
							</div>
						</div>
					</li>
				))}
			</ul>
		</div>
	);
}

function StatusBadge({ status }: { status: Source['status'] }) {
	return (
		<span
			className={cn(
				'rounded px-1.5 py-0.5 text-[10px] font-medium',
				status === 'ready' && 'bg-green-500/15 text-green-600 dark:text-green-400',
				status === 'error' && 'bg-red-500/15 text-red-600 dark:text-red-400',
				(status === 'pending' || status === 'processing') &&
					'bg-amber-500/15 text-amber-700 dark:text-amber-400'
			)}
		>
			{STATUS_LABEL[status]}
		</span>
	);
}

function UrlForm({ busy, onSubmit }: { busy: boolean; onSubmit: (url: string) => void }) {
	const [url, setUrl] = useState('');
	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit(url);
				setUrl('');
			}}
			className="border-b border-[var(--color-line)] px-4 py-3"
		>
			<input
				type="url"
				required
				placeholder="https://…"
				value={url}
				onChange={(e) => setUrl(e.target.value)}
				className="w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-sm"
			/>
			<button
				disabled={busy}
				className="mt-2 w-full rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs text-white disabled:opacity-50"
			>
				Hinzufügen
			</button>
		</form>
	);
}

function TextForm({
	busy,
	onSubmit
}: {
	busy: boolean;
	onSubmit: (title: string, content: string) => void;
}) {
	const [title, setTitle] = useState('');
	const [content, setContent] = useState('');

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				onSubmit(title, content);
				setTitle('');
				setContent('');
			}}
			className="border-b border-[var(--color-line)] px-4 py-3"
		>
			<input
				required
				placeholder="Titel"
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				className="w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-sm"
			/>
			<textarea
				required
				rows={4}
				placeholder="Text einfügen…"
				value={content}
				onChange={(e) => setContent(e.target.value)}
				className="mt-2 w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-sm"
			/>
			<button
				disabled={busy}
				className="mt-2 w-full rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs text-white disabled:opacity-50"
			>
				Hinzufügen
			</button>
		</form>
	);
}
