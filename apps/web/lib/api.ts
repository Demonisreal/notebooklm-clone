import { supabase } from './supabase';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export class ApiError extends Error {
	constructor(
		message: string,
		readonly status: number
	) {
		super(message);
	}
}

async function authHeader(): Promise<Record<string, string>> {
	const { data } = await supabase().auth.getSession();
	const token = data.session?.access_token;
	if (!token) throw new ApiError('Nicht angemeldet', 401);
	return { Authorization: `Bearer ${token}` };
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
	const response = await fetch(`${BASE}${path}`, {
		...init,
		headers: {
			'Content-Type': 'application/json',
			...(await authHeader()),
			...init.headers
		}
	});

	if (!response.ok) throw new ApiError(await readError(response), response.status);
	if (response.status === 204) return undefined as T;
	return response.json() as Promise<T>;
}

// der stream braucht den token genauso, laeuft aber nicht ueber json
export async function apiStream(path: string, body: unknown, signal?: AbortSignal) {
	return fetch(`${BASE}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
		body: JSON.stringify(body),
		signal
	});
}

async function readError(response: Response): Promise<string> {
	try {
		const body = await response.json();
		return body.message ?? `Fehler ${response.status}`;
	} catch {
		return `Fehler ${response.status}`;
	}
}
