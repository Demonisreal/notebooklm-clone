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
			setError(translate(error.message));
			return;
		}
		router.push('/notebooks');
	}

	return (
		<main className="flex min-h-screen items-center justify-center px-4">
			<form onSubmit={submit} className="w-full max-w-sm">
				<h1 className="text-2xl font-semibold">Notizbuch</h1>
				<p className="mt-1 text-sm text-[var(--color-muted)]">
					Quellen hochladen, mit ihnen chatten, Antworten zurückverfolgen.
				</p>

				<label className="mt-8 block text-sm font-medium">
					E-Mail
					<input
						type="email"
						required
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-transparent px-3 py-2 outline-none focus:border-[var(--color-accent)]"
					/>
				</label>

				<label className="mt-4 block text-sm font-medium">
					Passwort
					<input
						type="password"
						required
						minLength={6}
						value={password}
						onChange={(e) => setPassword(e.target.value)}
						className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-transparent px-3 py-2 outline-none focus:border-[var(--color-accent)]"
					/>
				</label>

				{error && <p className="mt-4 text-sm text-red-500">{error}</p>}

				<button
					type="submit"
					disabled={busy}
					className="mt-6 w-full rounded-md bg-[var(--color-accent)] px-4 py-2 font-medium text-white disabled:opacity-50"
				>
					{busy ? 'Einen Moment…' : mode === 'login' ? 'Anmelden' : 'Konto anlegen'}
				</button>

				<button
					type="button"
					onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
					className="mt-4 w-full text-sm text-[var(--color-muted)] hover:underline"
				>
					{mode === 'login' ? 'Noch kein Konto? Registrieren' : 'Schon registriert? Anmelden'}
				</button>
			</form>
		</main>
	);
}

function translate(message: string): string {
	if (message.includes('Invalid login credentials')) return 'E-Mail oder Passwort stimmt nicht';
	if (message.includes('already registered')) return 'Diese E-Mail ist bereits vergeben';
	if (message.includes('Password should be')) return 'Passwort braucht mindestens 6 Zeichen';
	return message;
}
