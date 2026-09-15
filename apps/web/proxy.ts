import { NextResponse, type NextRequest } from 'next/server';

const api = new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').origin;
const db = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!);
// realtime talks websocket to the supabase gateway, not every browser derives wss from https
const realtime = `${db.protocol === 'https:' ? 'wss' : 'ws'}://${db.host}`;

export function proxy(request: NextRequest) {
	const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
	const dev = process.env.NODE_ENV === 'development';

	const csp = [
		"default-src 'self'",
		`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
		`style-src 'self'${dev ? " 'unsafe-inline'" : ''}`,
		// react renders style props as attributes into the server html, a nonce cannot cover those
		"style-src-attr 'unsafe-inline'",
		"img-src 'self' data: blob:",
		"font-src 'self'",
		`connect-src 'self' ${api} ${db.origin} ${realtime}`,
		// the audio overview is a signed storage url on the supabase gateway
		`media-src 'self' ${db.origin}`,
		"object-src 'none'",
		"base-uri 'none'",
		"form-action 'self'",
		"frame-ancestors 'none'"
	].join('; ');

	const headers = new Headers(request.headers);
	headers.set('Content-Security-Policy', csp);

	const response = NextResponse.next({ request: { headers } });
	response.headers.set('Content-Security-Policy', csp);
	return response;
}

export const config = {
	matcher: [
		{
			source: '/((?!_next/static|_next/image|favicon.ico).*)',
			missing: [
				{ type: 'header', key: 'next-router-prefetch' },
				{ type: 'header', key: 'purpose', value: 'prefetch' }
			]
		}
	]
};
