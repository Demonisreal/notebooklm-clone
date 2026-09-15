import { supabase } from './supabase';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

// only the public demo account gets a 429, the api's own wording is meant for api clients
export const DEMO_LIMIT_MESSAGE = 'The demo limit has been reached. Please try again later.';

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
	if (!token) throw new ApiError('Not signed in', 401);
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

	// nest sends an empty body with 200 for null, json() would choke on that
	const body = await response.text();
	return (body ? JSON.parse(body) : null) as T;
}

// the stream needs the token just the same, but it does not go through json
export async function apiStream(path: string, body: unknown, signal?: AbortSignal) {
	return fetch(`${BASE}${path}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
		body: JSON.stringify(body),
		signal
	});
}

async function readError(response: Response): Promise<string> {
	if (response.status === 429) return DEMO_LIMIT_MESSAGE;
	try {
		const body = await response.json();
		return body.message ?? `Error ${response.status}`;
	} catch {
		return `Error ${response.status}`;
	}
}
