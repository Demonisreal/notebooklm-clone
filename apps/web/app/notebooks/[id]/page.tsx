'use client';

import { use } from 'react';

export default function NotebookPage({ params }: { params: Promise<{ id: string }> }) {
	const { id } = use(params);

	return (
		<main className="mx-auto max-w-4xl px-6 py-10">
			<a href="/notebooks" className="text-sm text-[var(--color-muted)] hover:underline">
				← Zurück
			</a>
			<h1 className="mt-4 text-2xl font-semibold">Notizbuch</h1>
			<p className="mt-2 text-sm text-[var(--color-muted)]">
				Quellen, Chat und Studio folgen hier. Notizbuch-ID: {id}
			</p>
		</main>
	);
}
