'use client';

import { Highlighter, X } from 'lucide-react';
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
		<div className="flex h-full flex-col bg-[var(--color-surface)]">
			<header className="flex items-start justify-between gap-3 border-b border-[var(--color-line)] px-5 py-4">
				<div className="min-w-0">
					<h2 className="truncate font-medium">{source?.title ?? 'Quelle'}</h2>
					{highlight && (
						<p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
							<Highlighter className="h-3 w-3" />
							Belegstelle{highlight.page ? ` auf Seite ${highlight.page}` : ''} markiert
						</p>
					)}
				</div>
				<button
					onClick={onClose}
					aria-label="Quelle schließen"
					className="rounded-lg p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-panel)] hover:text-[var(--color-fg)]"
				>
					<X className="h-4 w-4" />
				</button>
			</header>

			<div className="flex-1 overflow-y-auto px-5 py-5">
				{error && (
					<p className="rounded-lg bg-[var(--color-bad-soft)] px-3 py-2 text-sm text-[var(--color-bad)]">
						{error}
					</p>
				)}

				{!source && !error && (
					<div className="space-y-2.5">
						{[100, 92, 96, 70, 88].map((w, i) => (
							<div
								key={i}
								className="h-3 animate-pulse rounded bg-[var(--color-panel)]"
								style={{ width: `${w}%` }}
							/>
						))}
					</div>
				)}

				{source && (
					<article className="animate-fade whitespace-pre-wrap font-serif text-[15px] leading-[1.85]">
						{segments(source.text, highlight).map((segment, i) =>
							segment.marked ? (
								// ein chunk ist lang, flaechiges gelb erschlaegt den text.
								// ruhiger hintergrund plus balken am rand zeigt den umfang genauso
								<mark
									key={i}
									ref={marked}
									className="-mx-2 my-1 block rounded-r border-l-[3px] border-[var(--color-warn)] bg-[color-mix(in_oklab,var(--color-mark)_22%,transparent)] px-2 py-1 text-[var(--color-fg)]"
								>
									{segment.text}
								</mark>
							) : (
								<span key={i}>{segment.text}</span>
							)
						)}
					</article>
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
