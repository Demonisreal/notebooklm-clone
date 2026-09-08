'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
	const router = useRouter();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [mode, setMode] = useState<'login' | 'signup'>('login');
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	async function submit(event: React.FormEvent) {
		event.preventDefault();
		setBusy(true);
		setError(null);

		const auth = supabase().auth;
		const { error } =
			mode === 'login'
				? await auth.signInWithPassword({ email, password })
				: await auth.signUp({ email, password });

		setBusy(false);
		if (error) {
			setError(friendly(error.message));
			return;
		}
		router.push('/notebooks');
	}

	return (
		<main className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,520px)]">
			<section className="relative hidden overflow-hidden border-r border-[var(--color-line)] bg-[var(--color-panel)] lg:block">
				{/* soft glow so the panel does not feel dead */}
				<div
					aria-hidden
					className="pointer-events-none absolute -left-32 -top-40 h-[560px] w-[560px] rounded-full opacity-60 blur-3xl"
					style={{
						background:
							'radial-gradient(circle, color-mix(in oklab, var(--color-accent) 22%, transparent), transparent 70%)'
					}}
				/>

				<div className="relative flex h-full flex-col justify-between p-14">
					<span className="text-sm font-medium tracking-wide text-[var(--color-muted)]">
						Notebook
					</span>

					<div className="max-w-md">
						<h2 className="text-balance text-4xl font-semibold">
							Answers that lead back to the source.
						</h2>
						<p className="mt-5 leading-relaxed text-[var(--color-muted)]">
							Upload documents and ask questions about them. Every claim carries a citation — one
							click opens the passage it came from.
						</p>

						<ul className="mt-10 space-y-3">
							{[
								'PDF, Word, text and web pages',
								'Answers drawn only from your sources',
								'Citations that jump to the exact passage'
							].map((line) => (
								<li key={line} className="flex items-center gap-3 text-sm">
									<span className="grid h-5 w-5 place-items-center rounded-full bg-[var(--color-accent-soft)] text-[11px] text-[var(--color-accent)]">
										✓
									</span>
									{line}
								</li>
							))}
						</ul>
					</div>

					<p className="text-xs text-[var(--color-faint)]">
						Next.js · Nest.js · Supabase with pgvector
					</p>
				</div>
			</section>

			<section className="flex items-center justify-center px-6 py-16">
				<form onSubmit={submit} className="animate-rise w-full max-w-sm">
					<h1 className="text-2xl font-semibold">
						{mode === 'login' ? 'Welcome back' : 'Create account'}
					</h1>
					<p className="mt-2 text-sm text-[var(--color-muted)]">
						{mode === 'login'
							? 'Sign in to get back to your notebooks.'
							: "Takes a few seconds and you're all set."}
					</p>

					<div className="mt-8 space-y-4">
						<Field
							label="Email"
							type="email"
							value={email}
							onChange={setEmail}
							placeholder="name@example.com"
						/>
						<Field
							label="Password"
							type="password"
							value={password}
							onChange={setPassword}
							placeholder="at least 6 characters"
							minLength={6}
						/>
					</div>

					{error && (
						<p className="animate-fade mt-4 rounded-lg bg-[var(--color-bad-soft)] px-3 py-2 text-sm text-[var(--color-bad)]">
							{error}
						</p>
					)}

					<button
						type="submit"
						disabled={busy}
						className="mt-7 w-full rounded-xl bg-[var(--color-accent)] px-4 py-3 font-medium text-[var(--color-accent-fg)] shadow-[var(--shadow-card)] transition hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
					>
						{busy ? 'One moment…' : mode === 'login' ? 'Sign in' : 'Create account'}
					</button>

					<button
						type="button"
						onClick={() => {
							setMode(mode === 'login' ? 'signup' : 'login');
							setError(null);
						}}
						className="mt-5 w-full text-sm text-[var(--color-muted)] transition hover:text-[var(--color-fg)]"
					>
						{mode === 'login' ? (
							<>
								No account yet? <span className="underline">Sign up</span>
							</>
						) : (
							<>
								Already have an account? <span className="underline">Sign in</span>
							</>
						)}
					</button>
				</form>
			</section>
		</main>
	);
}

function Field({
	label,
	type,
	value,
	onChange,
	placeholder,
	minLength
}: {
	label: string;
	type: string;
	value: string;
	onChange: (v: string) => void;
	placeholder?: string;
	minLength?: number;
}) {
	return (
		<label className="block">
			<span className="text-sm font-medium">{label}</span>
			<input
				type={type}
				required
				minLength={minLength}
				value={value}
				placeholder={placeholder}
				onChange={(e) => onChange(e.target.value)}
				className="mt-1.5 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 py-2.5 outline-none transition placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)]"
			/>
		</label>
	);
}

function friendly(message: string): string {
	if (message.includes('Invalid login credentials')) return 'That email or password is wrong.';
	if (message.includes('already been registered')) return 'That email is already taken.';
	if (message.includes('Password should be')) return 'The password needs at least 6 characters.';
	return message;
}
