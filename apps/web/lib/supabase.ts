import { createBrowserClient } from '@supabase/ssr';

// @supabase/ssr always writes 400 days and ignores cookieOptions.maxAge, so the cookies are
// written here. Every token refresh rewrites the cookie, a week without a visit ends the session.
const MAX_AGE = 7 * 24 * 60 * 60;

let client: ReturnType<typeof createBrowserClient> | null = null;

export function supabase() {
	if (client) return client;

	client = createBrowserClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
		{
			cookies: {
				getAll() {
					// only our own cookies, a foreign one with a stray % would make decodeURIComponent throw
					return document.cookie
						.split('; ')
						.filter((pair) => pair.startsWith('sb-'))
						.map((pair) => {
							const at = pair.indexOf('=');
							return { name: pair.slice(0, at), value: decodeURIComponent(pair.slice(at + 1)) };
						});
				},
				setAll(cookies) {
					const secure = location.protocol === 'https:' ? '; Secure' : '';
					for (const { name, value, options } of cookies) {
						const maxAge = options.maxAge === 0 ? 0 : MAX_AGE;
						document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;
					}
				}
			}
		}
	);
	return client;
}
