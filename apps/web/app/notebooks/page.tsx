'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import type { Notebook } from 'shared';
import { api, ApiError } from '@/lib/api';
import { supabase } from '@/lib/supabase';

export default function NotebooksPage() {
	const router = useRouter();
	const [notebooks, setNotebooks] = useState<Notebook[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [creating, setCreating] = useState(false);
	// two steps instead of confirm(), so no browser dialog blocks the flow
	const [confirming, setConfirming] = useState<string | null>(null);

	const load = useCallback(async () => {
		try {
			setNotebooks(await api<Notebook[]>('/notebooks'));
		} catch (err) {
			if (err instanceof ApiError && err.status === 401) {
				router.replace('/login');
				return;
			}
			setError(err instanceof Error ? err.message : 'Unknown error');
		}
	}, [router]);

	useEffect(() => {
		void load();
	}, [load]);

	async function create() {
		setCreating(true);
		try {
			const created = await api<Notebook>('/notebooks', {
				method: 'POST',
				body: JSON.stringify({ title: 'New notebook' })
			});
			router.push(`/notebooks/${created.id}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not create the notebook');
			setCreating(false);
		}
	}

	async function remove(id: string) {
		setConfirming(null);
		try {
			await api(`/notebooks/${id}`, { method: 'DELETE' });
			await load();
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not delete the notebook');
		}
	}

	async function logout() {
		await supabase().auth.signOut();
		router.replace('/login');
	}

	return (
		<div className="min-h-screen">
			<header className="bg-[var(--color-bg)]/85 sticky top-0 z-10 border-b border-[var(--color-line)] backdrop-blur">
				<div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
					<span className="font-medium">Notebook</span>
					<button
						onClick={logout}
						className="rounded-lg px-3 py-1.5 text-sm text-[var(--color-muted)] transition hover:bg-[var(--color-panel)] hover:text-[var(--color-fg)]"
					>
						Sign out
					</button>
				</div>
			</header>

			<main className="mx-auto max-w-5xl px-6 py-12">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<h1 className="text-3xl font-semibold">My notebooks</h1>
						<p className="mt-1.5 text-[var(--color-muted)]">{summary(notebooks)}</p>
					</div>

					<button
						onClick={create}
						disabled={creating}
						className="rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent-fg)] shadow-[var(--shadow-card)] transition hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
					>
						{creating ? 'Creating…' : 'New notebook'}
					</button>
				</div>

				{error && (
					<p className="animate-fade mt-8 rounded-xl bg-[var(--color-bad-soft)] px-4 py-3 text-sm text-[var(--color-bad)]">
						{error}
					</p>
				)}

				{notebooks === null && !error && (
					<ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
						{[0, 1, 2].map((i) => (
							<li
								key={i}
								className="h-[132px] animate-pulse rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-panel)]"
							/>
						))}
					</ul>
				)}

				{notebooks?.length === 0 && (
					<div className="animate-rise bg-[var(--color-panel)]/50 mt-10 rounded-[var(--radius-panel)] border border-dashed border-[var(--color-line-strong)] px-8 py-20 text-center">
						<span className="text-4xl">📓</span>
						<p className="mt-4 text-lg font-medium">No notebooks yet</p>
						<p className="mx-auto mt-1.5 max-w-sm text-sm text-[var(--color-muted)]">
							Create one, upload a PDF and ask your first question about it.
						</p>
						<button
							onClick={create}
							className="mt-6 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent-fg)] transition hover:bg-[var(--color-accent-hover)]"
						>
							Create your first notebook
						</button>
					</div>
				)}

				<ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{notebooks?.map((notebook, i) => (
						<li
							key={notebook.id}
							className="animate-rise group relative"
							style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
						>
							<a
								href={`/notebooks/${notebook.id}`}
								className="block h-full rounded-[var(--radius-panel)] border border-[var(--color-line)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-card)] transition duration-200 hover:-translate-y-0.5 hover:border-[var(--color-line-strong)] hover:shadow-[var(--shadow-lift)]"
							>
								<span className="grid h-12 w-12 place-items-center rounded-xl bg-[var(--color-panel)] text-2xl">
									{notebook.emoji}
								</span>

								<p className="mt-5 text-balance pr-14 text-[17px] font-medium">{notebook.title}</p>

								<p className="mt-1 text-sm text-[var(--color-muted)]">
									{notebook.sourceCount === 0
										? 'No sources yet'
										: `${notebook.sourceCount} ${notebook.sourceCount === 1 ? 'source' : 'sources'}`}
									<span className="mx-1.5 text-[var(--color-faint)]">·</span>
									{new Date(notebook.updatedAt).toLocaleDateString('en-US', {
										day: 'numeric',
										month: 'short'
									})}
								</p>
							</a>

							<div className="absolute right-4 top-4 flex items-center gap-2">
								{confirming === notebook.id ? (
									<div className="animate-fade flex items-center gap-1.5 rounded-lg bg-[var(--color-surface)] p-1 shadow-[var(--shadow-pop)]">
										<button
											onClick={() => remove(notebook.id)}
											className="rounded-md bg-[var(--color-bad)] px-2 py-1 text-xs font-medium text-white"
										>
											Delete
										</button>
										<button
											onClick={() => setConfirming(null)}
											className="rounded-md px-2 py-1 text-xs text-[var(--color-muted)] hover:bg-[var(--color-panel)]"
										>
											Cancel
										</button>
									</div>
								) : (
									<button
										onClick={() => setConfirming(notebook.id)}
										aria-label={`Delete ${notebook.title}`}
										className="rounded-lg px-2 py-1 text-xs text-[var(--color-faint)] opacity-0 transition hover:bg-[var(--color-panel)] hover:text-[var(--color-bad)] focus-visible:opacity-100 group-hover:opacity-100"
									>
										Delete
									</button>
								)}
							</div>
						</li>
					))}
				</ul>
			</main>
		</div>
	);
}

function summary(notebooks: Notebook[] | null): string {
	if (!notebooks) return 'Loading…';
	if (notebooks.length === 0) return 'Create your first notebook.';

	const sources = notebooks.reduce((sum, n) => sum + n.sourceCount, 0);
	const books = `${notebooks.length} ${notebooks.length === 1 ? 'notebook' : 'notebooks'}`;
	if (sources === 0) return books;

	return `${books} · ${sources} ${sources === 1 ? 'source' : 'sources'} in total`;
}
