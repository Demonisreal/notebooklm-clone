'use client';

import { Headphones, Loader2, Pause, Play, RotateCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AudioOverview as Overview } from 'shared';
import { api } from '@/lib/api';

type Props = { notebookId: string; hasSources: boolean };

export function AudioOverview({ notebookId, hasSources }: Props) {
	const [overview, setOverview] = useState<Overview | null>(null);
	const [loaded, setLoaded] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showScript, setShowScript] = useState(false);

	const load = useCallback(async () => {
		const data = await api<Overview | null>(`/notebooks/${notebookId}/studio/audio`);
		setOverview(data);
		setLoaded(true);
		return data;
	}, [notebookId]);

	useEffect(() => {
		void load();
	}, [load]);

	// tts runs in the background, so keep asking until it is there
	useEffect(() => {
		if (overview?.status !== 'processing' && overview?.status !== 'pending') return;

		const timer = setInterval(() => void load(), 5000);
		return () => clearInterval(timer);
	}, [overview?.status, load]);

	async function start() {
		setError(null);
		setOverview({ ...(overview ?? emptyOverview()), status: 'processing' });
		try {
			setOverview(await api<Overview>(`/notebooks/${notebookId}/studio/audio`, { method: 'POST' }));
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Could not start the overview');
			setOverview(null);
		}
	}

	if (!loaded) return null;

	const busy = overview?.status === 'processing' || overview?.status === 'pending';

	return (
		<section className="mb-5">
			<h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
				Audio overview
			</h3>

			<div className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
				{!overview && (
					<>
						<div className="flex items-center gap-2.5">
							<span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[var(--color-accent-soft)]">
								<Headphones className="h-4 w-4 text-[var(--color-accent)]" />
							</span>
							<p className="text-xs leading-snug text-[var(--color-muted)]">
								A short conversation between two voices that sums up your sources.
							</p>
						</div>
						<button
							onClick={start}
							disabled={!hasSources}
							className="mt-3 w-full rounded-lg bg-[var(--color-accent)] py-2 text-xs font-medium text-[var(--color-accent-fg)] transition hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
						>
							{hasSources ? 'Generate conversation' : 'Add a source first'}
						</button>
					</>
				)}

				{busy && (
					<div className="flex items-center gap-2.5 py-1">
						<Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--color-accent)]" />
						<div>
							<p className="text-xs font-medium">Generating…</p>
							<p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
								Script and speech take a minute or two.
							</p>
						</div>
					</div>
				)}

				{overview?.status === 'error' && (
					<div>
						<p className="text-xs text-[var(--color-bad)]">
							{overview.errorMessage ?? 'Generating the overview failed.'}
						</p>
						<button
							onClick={start}
							className="mt-2 flex items-center gap-1.5 text-xs text-[var(--color-accent)] hover:underline"
						>
							<RotateCw className="h-3 w-3" />
							Try again
						</button>
					</div>
				)}

				{overview?.status === 'ready' && overview.url && (
					<>
						<Player url={overview.url} seconds={overview.durationSeconds ?? 0} />

						<div className="mt-2.5 flex items-center justify-between border-t border-[var(--color-line)] pt-2.5">
							<button
								onClick={() => setShowScript(!showScript)}
								className="text-[11px] text-[var(--color-muted)] hover:text-[var(--color-fg)]"
							>
								{showScript ? 'Hide transcript' : 'Read along'}
							</button>
							<button
								onClick={start}
								className="text-[11px] text-[var(--color-muted)] hover:text-[var(--color-fg)]"
							>
								Regenerate
							</button>
						</div>

						{showScript && overview.script && (
							<div className="animate-fade mt-2 max-h-56 space-y-2 overflow-y-auto rounded-lg bg-[var(--color-panel)] p-2.5">
								{overview.script.split('\n').map((line, i) => {
									const [speaker, ...rest] = line.split(':');
									return (
										<p key={i} className="text-[11px] leading-relaxed">
											<span className="font-medium text-[var(--color-accent)]">{speaker}</span>
											<span className="text-[var(--color-muted)]">{rest.join(':')}</span>
										</p>
									);
								})}
							</div>
						)}
					</>
				)}

				{error && <p className="mt-2 text-xs text-[var(--color-bad)]">{error}</p>}
			</div>
		</section>
	);
}

function Player({ url, seconds }: { url: string; seconds: number }) {
	const audio = useRef<HTMLAudioElement>(null);
	const [playing, setPlaying] = useState(false);
	const [position, setPosition] = useState(0);

	const total = seconds || audio.current?.duration || 0;
	const progress = total > 0 ? (position / total) * 100 : 0;

	function toggle() {
		if (!audio.current) return;
		if (playing) audio.current.pause();
		else void audio.current.play();
	}

	function seek(event: React.MouseEvent<HTMLDivElement>) {
		if (!audio.current || !total) return;
		const rect = event.currentTarget.getBoundingClientRect();
		audio.current.currentTime = ((event.clientX - rect.left) / rect.width) * total;
	}

	return (
		<div className="flex items-center gap-3">
			<audio
				ref={audio}
				src={url}
				preload="metadata"
				onPlay={() => setPlaying(true)}
				onPause={() => setPlaying(false)}
				onEnded={() => setPlaying(false)}
				onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
			/>

			<button
				onClick={toggle}
				aria-label={playing ? 'Pause' : 'Play'}
				className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-accent)] text-[var(--color-accent-fg)] transition hover:bg-[var(--color-accent-hover)]"
			>
				{playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
			</button>

			<div className="min-w-0 flex-1">
				<div
					onClick={seek}
					className="group h-1.5 cursor-pointer rounded-full bg-[var(--color-panel)]"
				>
					<div
						className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-150"
						style={{ width: `${progress}%` }}
					/>
				</div>
				<div className="mt-1.5 flex justify-between text-[11px] text-[var(--color-muted)]">
					<span>{clock(position)}</span>
					<span>{clock(total)}</span>
				</div>
			</div>
		</div>
	);
}

function clock(seconds: number): string {
	const whole = Math.floor(seconds);
	return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function emptyOverview(): Overview {
	return {
		id: '',
		status: 'pending',
		script: null,
		url: null,
		durationSeconds: null,
		errorMessage: null,
		createdAt: new Date().toISOString()
	};
}
