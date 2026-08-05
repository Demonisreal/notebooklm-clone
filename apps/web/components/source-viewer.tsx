'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';

type Props = {
	sourceId: string;
	highlight?: { charStart: number; charEnd: number; page: number | null } | null;
	onClose: () => void;
};

type SourceText = { id: string; title: string; kind: string; text: string };

export function SourceViewer({ sourceId, highlight, onClose }: Props) {
	const [source, setSource] = useState<SourceText | null>(null);
	const [error, setError] = useState<string | null>(null);
	const marked = useRef<HTMLSpanElement>(null);

	useEffect(() => {
		setSource(null);
		setError(null);
		api<SourceText>(`/sources/${sourceId}/text`)
			.then(setSource)
			.catch((err) => setError(err instanceof Error ? err.message : 'Konnte nicht laden'));
	}, [sourceId]);

	// ein chunk ist lang, bei 'center' landet man mitten drin statt am anfang
	useEffect(() => {
		if (source && highlight) marked.current?.scrollIntoView({ block: 'start' });
	}, [source, highlight]);

	return (
		<div className="flex h-full flex-col">
			<div className="flex items-start justify-between gap-2 border-b border-[var(--color-line)] px-4 py-3">
				<div className="min-w-0">
					<h2 className="truncate text-sm font-semibold">{source?.title ?? 'Quelle'}</h2>
					{highlight && (
						<p className="mt-0.5 text-xs text-[var(--color-muted)]">
							Belegstelle{highlight.page ? ` auf Seite ${highlight.page}` : ''} markiert
						</p>
					)}
				</div>
				<button onClick={onClose} className="text-xs text-[var(--color-muted)] hover:underline">
					schließen
				</button>
			</div>

			<div className="flex-1 overflow-y-auto px-4 py-4">
				{error && <p className="text-sm text-red-500">{error}</p>}
				{!source && !error && <p className="text-sm text-[var(--color-muted)]">Wird geladen…</p>}
				{source && (
					<pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
						{segments(source.text, highlight).map((segment, i) =>
							segment.marked ? (
								<span
									key={i}
									ref={marked}
									className="rounded bg-amber-300/40 px-0.5 dark:bg-amber-500/30"
								>
									{segment.text}
								</span>
							) : (
								<span key={i}>{segment.text}</span>
							)
						)}
					</pre>
				)}
			</div>
		</div>
	);
}

// die offsets zeigen exakt in diesen text, weil genau er auch indexiert wurde
function segments(text: string, highlight?: { charStart: number; charEnd: number } | null) {
	if (!highlight) return [{ text, marked: false }];

	const start = Math.max(0, Math.min(highlight.charStart, text.length));
	const end = Math.max(start, Math.min(highlight.charEnd, text.length));

	return [
		{ text: text.slice(0, start), marked: false },
		{ text: text.slice(start, end), marked: true },
		{ text: text.slice(end), marked: false }
	].filter((segment) => segment.text.length > 0);
}
