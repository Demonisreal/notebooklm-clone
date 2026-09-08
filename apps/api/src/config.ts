import { z } from 'zod';

const schema = z.object({
	PORT: z.coerce.number().default(3001),
	WEB_ORIGIN: z.string().default('http://localhost:3000'),

	// reachable internally; behind a reverse proxy the container cannot get back
	// to itself through the public address
	SUPABASE_URL: z.string().url(),
	// ends up in links that the browser opens (upload, audio)
	SUPABASE_PUBLIC_URL: z.string().url().optional(),
	SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
	SUPABASE_SECRET_KEY: z.string().min(1),
	SUPABASE_JWT_ISSUER: z.string().url(),
	// the public demo account, read only
	DEMO_USER_EMAIL: z.string().optional(),

	LLM_PROVIDER: z.enum(['fake', 'gemini']).default('fake'),
	GEMINI_API_KEY: z.string().optional(),
	GEMINI_CHAT_MODEL: z.string().default('gemini-3.5-flash'),
	GEMINI_EMBEDDING_MODEL: z.string().default('gemini-embedding-2')
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: Record<string, unknown>): Config {
	const parsed = schema.safeParse(env);
	if (!parsed.success) {
		const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
		throw new Error(`Incomplete configuration: ${missing}`);
	}

	const config = parsed.data;
	if (config.LLM_PROVIDER === 'gemini' && !config.GEMINI_API_KEY) {
		throw new Error('LLM_PROVIDER=gemini, but GEMINI_API_KEY is missing');
	}

	return config;
}
