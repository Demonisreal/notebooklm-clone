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

	const load = useCallback(async () => {
		try {
			setNotebooks(await api<Notebook[]>('/notebooks'));
		} catch (err) {
			if (err instanceof ApiError && err.status === 401) {
				router.replace('/login');
				return;
			}
			setError(err instanceof Error ? err.message : 'Unbekannter Fehler');
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
				body: JSON.stringify({ title: 'Neues Notizbuch' })
			});
			router.push(`/notebooks/${created.id}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Anlegen fehlgeschlagen');
		} finally {
			setCreating(false);
		}
	}

	async function logout() {
		await supabase().auth.signOut();
		router.replace('/login');
	}

	return (
		<main className="mx-auto max-w-4xl px-6 py-10">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-semibold">Meine Notizbücher</h1>
				<div className="flex gap-3">
					<button
						onClick={create}
						disabled={creating}
						className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
					>
						{creating ? 'Wird angelegt…' : 'Neues Notizbuch'}
					</button>
					<button
						onClick={logout}
						className="rounded-md border border-[var(--color-line)] px-4 py-2 text-sm"
					>
						Abmelden
					</button>
				</div>
			</div>

			{error && <p className="mt-6 text-sm text-red-500">{error}</p>}

			{notebooks === null && !error && (
				<p className="mt-10 text-sm text-[var(--color-muted)]">Wird geladen…</p>
			)}

			{notebooks?.length === 0 && (
				<div className="mt-16 rounded-lg border border-dashed border-[var(--color-line)] p-12 text-center">
					<p className="font-medium">Noch keine Notizbücher</p>
					<p className="mt-1 text-sm text-[var(--color-muted)]">
						Leg eins an und lade ein PDF hoch, um zu starten.
					</p>
				</div>
			)}

			<ul className="mt-8 grid gap-3 sm:grid-cols-2">
				{notebooks?.map((notebook) => (
					<li key={notebook.id}>
						<a
							href={`/notebooks/${notebook.id}`}
							className="block rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] p-4 hover:border-[var(--color-accent)]"
						>
							<span className="text-2xl">{notebook.emoji}</span>
							<p className="mt-2 font-medium">{notebook.title}</p>
							<p className="mt-1 text-xs text-[var(--color-muted)]">
								{new Date(notebook.updatedAt).toLocaleDateString('de-DE')}
							</p>
						</a>
					</li>
				))}
			</ul>
		</main>
	);
}
