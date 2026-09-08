'use client';

import {
	FileText,
	FileType2,
	Globe,
	Loader2,
	Plus,
	RotateCw,
	TriangleAlert,
	Type,
	X
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Source, SourceKind } from 'shared';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase';

type Props = {
	notebookId: string;
	selected: Set<string>;
	onToggle: (id: string) => void;
	onOpen: (sourceId: string) => void;
	onReadyCount: (count: number) => void;
};

const ICONS: Record<SourceKind, typeof FileText> = {
	pdf: FileText,
	docx: FileType2,
	text: Type,
	markdown: Type,
	url: Globe
};

export function SourcesPanel({ notebookId, selected, onToggle, onOpen, onReadyCount }: Props) {
	const [sources, setSources] = useState<Source[] | null>(null);
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

	// without the publication and a select policy realtime drops the events silently
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

			const put = await fetch(signedUrl, { method: 'PUT', body: file });
			if (!put.ok) throw new Error('The file could not be uploaded');

			await api(`/notebooks/${notebookId}/sources`, {
				method: 'POST',
				body: JSON.stringify({ kind: 'file', storagePath: path, title: file.name })
			});
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Upload failed');
		} finally {
			setBusy(false);
			if (fileInput.current) fileInput.current.value = '';
		}
	}

	async function add(body: unknown) {
		setBusy(true);
		setError(null);
		try {
			await api(`/notebooks/${notebookId}/sources`, { method: 'POST', body: JSON.stringify(body) });
			setAdding(null);
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not add the source');
		} finally {
			setBusy(false);
		}
	}

	const ready = sources?.filter((s) => s.status === 'ready').length ?? 0;

	useEffect(() => {
		onReadyCount(ready);
	}, [ready, onReadyCount]);

	return (
		<div className="bg-[var(--color-panel)]/40 flex h-full flex-col">
			<header className="flex items-center justify-between px-5 pb-3 pt-5">
				<h2 className="font-medium">Sources</h2>
				{ready > 0 && (
					<span
						className={cn(
							'rounded-full px-2 py-0.5 text-[11px]',
							selected.size > 0
								? 'bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
								: 'text-[var(--color-muted)]'
						)}
					>
						{selected.size === 0 ? `${ready} searchable` : `${selected.size} selected`}
					</span>
				)}
			</header>

			<div className="flex gap-1.5 px-4 pb-3">
				<AddButton
					icon={Plus}
					label="File"
					onClick={() => fileInput.current?.click()}
					busy={busy}
				/>
				<AddButton
					icon={Globe}
					label="Website"
					onClick={() => setAdding(adding === 'url' ? null : 'url')}
					active={adding === 'url'}
				/>
				<AddButton
					icon={Type}
					label="Text"
					onClick={() => setAdding(adding === 'text' ? null : 'text')}
					active={adding === 'text'}
				/>
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

			{error && (
				<p className="animate-fade mx-4 mb-2 rounded-lg bg-[var(--color-bad-soft)] px-3 py-2 text-xs text-[var(--color-bad)]">
					{error}
				</p>
			)}

			<ul className="flex-1 space-y-1 overflow-y-auto px-3 pb-4">
				{sources === null &&
					[0, 1].map((i) => (
						<li key={i} className="h-14 animate-pulse rounded-xl bg-[var(--color-panel)]" />
					))}

				{sources?.length === 0 && (
					<li className="mt-8 px-4 text-center">
						<p className="text-sm font-medium">No sources yet</p>
						<p className="mt-1 text-xs leading-relaxed text-[var(--color-muted)]">
							Upload a PDF, add a web page or paste in some text.
						</p>
					</li>
				)}

				{sources?.map((source) => (
					<SourceRow
						key={source.id}
						source={source}
						checked={selected.has(source.id)}
						onToggle={() => onToggle(source.id)}
						onOpen={() => onOpen(source.id)}
						onRemove={async () => {
							await api(`/sources/${source.id}`, { method: 'DELETE' });
							await load();
						}}
						onRetry={async () => {
							await api(`/sources/${source.id}/reprocess`, { method: 'POST' });
							await load();
						}}
					/>
				))}
			</ul>
		</div>
	);
}

function SourceRow({
	source,
	checked,
	onToggle,
	onOpen,
	onRemove,
	onRetry
}: {
	source: Source;
	checked: boolean;
	onToggle: () => void;
	onOpen: () => void;
	onRemove: () => void;
	onRetry: () => void;
}) {
	const Icon = ICONS[source.kind] ?? FileText;
	const ready = source.status === 'ready';
	const failed = source.status === 'error';

	return (
		<li
			className={cn(
				'animate-fade group rounded-xl border px-2.5 py-2 transition',
				checked
					? 'border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)]'
					: 'border-transparent hover:border-[var(--color-line)] hover:bg-[var(--color-surface)]'
			)}
		>
			<div className="flex items-start gap-2.5">
				<input
					type="checkbox"
					checked={checked}
					disabled={!ready}
					onChange={onToggle}
					aria-label={`Include ${source.title} in the search`}
					className="mt-2 accent-[var(--color-accent)] disabled:opacity-30"
				/>

				<span
					className={cn(
						'mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-lg',
						failed ? 'bg-[var(--color-bad-soft)]' : 'bg-[var(--color-panel)]'
					)}
				>
					{source.status === 'processing' || source.status === 'pending' ? (
						<Loader2 className="h-3.5 w-3.5 animate-spin text-[var(--color-warn)]" />
					) : failed ? (
						<TriangleAlert className="h-3.5 w-3.5 text-[var(--color-bad)]" />
					) : (
						<Icon className="h-3.5 w-3.5 text-[var(--color-muted)]" />
					)}
				</span>

				<div className="min-w-0 flex-1">
					<button
						onClick={() => ready && onOpen()}
						disabled={!ready}
						title={source.title}
						className="block w-full truncate text-left text-sm disabled:cursor-default"
					>
						{source.title}
					</button>

					<div className="mt-0.5 flex items-center gap-2 text-[11px] text-[var(--color-muted)]">
						{ready ? (
							<span>{formatSize(source.charCount)}</span>
						) : failed ? (
							<span className="text-[var(--color-bad)]">could not be read</span>
						) : (
							<span className="text-[var(--color-warn)]">reading…</span>
						)}

						<span className="ml-auto flex items-center gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
							{failed && (
								<button
									onClick={onRetry}
									title="Process again"
									className="rounded p-1 hover:bg-[var(--color-panel)]"
								>
									<RotateCw className="h-3 w-3" />
								</button>
							)}
							<button
								onClick={onRemove}
								title="Remove source"
								className="rounded p-1 hover:bg-[var(--color-panel)] hover:text-[var(--color-bad)]"
							>
								<X className="h-3 w-3" />
							</button>
						</span>
					</div>

					{source.errorMessage && (
						<p className="mt-1.5 rounded-md bg-[var(--color-bad-soft)] px-2 py-1 text-[11px] leading-snug text-[var(--color-bad)]">
							{source.errorMessage}
						</p>
					)}
				</div>
			</div>
		</li>
	);
}

function AddButton({
	icon: Icon,
	label,
	onClick,
	active,
	busy
}: {
	icon: typeof FileText;
	label: string;
	onClick: () => void;
	active?: boolean;
	busy?: boolean;
}) {
	return (
		<button
			onClick={onClick}
			disabled={busy}
			className={cn(
				'flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs transition disabled:opacity-50',
				active
					? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]'
					: 'border-[var(--color-line)] bg-[var(--color-surface)] hover:border-[var(--color-line-strong)]'
			)}
		>
			<Icon className="h-3.5 w-3.5" />
			{label}
		</button>
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
			className="animate-fade mx-4 mb-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-2.5"
		>
			<input
				type="url"
				required
				autoFocus
				placeholder="https://…"
				value={url}
				onChange={(e) => setUrl(e.target.value)}
				className="w-full rounded-lg border border-[var(--color-line)] bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
			/>
			<button
				disabled={busy}
				className="mt-2 w-full rounded-lg bg-[var(--color-accent)] py-1.5 text-xs font-medium text-[var(--color-accent-fg)] transition hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
			>
				Add page
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
			className="animate-fade mx-4 mb-3 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-2.5"
		>
			<input
				required
				autoFocus
				placeholder="Title"
				value={title}
				onChange={(e) => setTitle(e.target.value)}
				className="w-full rounded-lg border border-[var(--color-line)] bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
			/>
			<textarea
				required
				rows={4}
				placeholder="Paste text…"
				value={content}
				onChange={(e) => setContent(e.target.value)}
				className="mt-2 w-full resize-none rounded-lg border border-[var(--color-line)] bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
			/>
			<button
				disabled={busy}
				className="mt-2 w-full rounded-lg bg-[var(--color-accent)] py-1.5 text-xs font-medium text-[var(--color-accent-fg)] transition hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
			>
				Add text
			</button>
		</form>
	);
}

function formatSize(chars: number | null): string {
	if (!chars) return 'ready';
	if (chars < 1000) return `${chars} characters`;
	return `${Math.round(chars / 1000)}k characters`;
}
