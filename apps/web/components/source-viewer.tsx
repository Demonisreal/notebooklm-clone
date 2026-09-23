'use client';

import { Highlighter, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { reflow } from '@/lib/reflow';

type Props = {
	sourceId: string;
	highlight?: { charStart: number; charEnd: number; page: number | null } | null;
	onClose: () => void;
};

type SourceText = { id: string; title: string; kind: string; text: string };

export function SourceViewer({ sourceId, highlight, onClose }: Props) {
	const [source, setSource] = useState<SourceText | null>(null);
	const [error, setError] = useState<string | null>(null);
	const marked = useRef<HTMLElement>(null);
	const pane = useRef<HTMLDivElement>(null);
	const shown = useRef(false);

	useEffect(() => {
		api<SourceText>(`/sources/${sourceId}/text`)
			.then(setSource)
			.catch((err) => setError(err instanceof Error ? err.message : 'Could not load the source'));
	}, [sourceId]);

	useEffect(() => {
		if (!source) return;

		const mark = marked.current;
		if (mark && pane.current) {
			const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
			mark.scrollIntoView({
				// a chunk can be taller than the panel, centered its start would sit above the fold
				block: mark.offsetHeight < pane.current.clientHeight ? 'center' : 'start',
				// freshly loaded text just jumps, only a jump within text already on screen glides
				behavior: shown.current && !reduced ? 'smooth' : 'auto'
			});
		}
		shown.current = true;
	}, [source, highlight]);

	return (
		<div className="flex h-full flex-col bg-[var(--color-surface)]">
			<header className="flex items-start justify-between gap-3 border-b border-[var(--color-line)] px-5 py-4">
				<div className="min-w-0">
					<h2 className="truncate font-medium">{source?.title ?? 'Source'}</h2>
					{highlight && (
						<p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
							<Highlighter className="h-3 w-3" />
							Cited passage{highlight.page ? ` on page ${highlight.page}` : ''} highlighted
						</p>
					)}
				</div>
				<button
					onClick={onClose}
					aria-label="Close source"
					className="rounded-lg p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-panel)] hover:text-[var(--color-fg)]"
				>
					<X className="h-4 w-4" />
				</button>
			</header>

			<div ref={pane} className="flex-1 overflow-y-auto px-5 py-5">
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
					<article className="animate-fade whitespace-pre-wrap text-[15px] leading-[1.75]">
						{segments(source.kind === 'pdf' ? reflow(source.text) : source.text, highlight).map(
							(segment, i) =>
								segment.marked ? (
									// a solid block of yellow over a whole chunk buries the text
									<mark
										key={i}
										ref={marked}
										className="-mx-2 my-1 block scroll-mt-5 rounded-r border-l-[3px] border-[var(--color-warn)] bg-[color-mix(in_oklab,var(--color-mark)_22%,transparent)] px-2 py-1 text-[var(--color-fg)]"
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

// the offsets point into exactly this text, because this is what got indexed
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
