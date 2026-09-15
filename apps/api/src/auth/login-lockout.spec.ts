import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SECRET_KEY ?? '';

const PASSWORD = 'correct horse battery';
const WRONG = 'wrong horse battery';

// the lock is a gotrue hook in the database, so it is checked through gotrue itself
describe.skipIf(!KEY)('login lockout hook', () => {
	let admin: SupabaseClient;
	const created: string[] = [];

	async function user(appMetadata: Record<string, unknown> = {}) {
		const email = `lockout-${crypto.randomUUID()}@test.local`;
		const { data, error } = await admin.auth.admin.createUser({
			email,
			password: PASSWORD,
			email_confirm: true,
			app_metadata: appMetadata
		});
		if (error) throw new Error(error.message);
		created.push(data.user.id);
		return { email, id: data.user.id };
	}

	async function signIn(email: string, password: string) {
		const client = createClient(URL, KEY, { auth: { persistSession: false } });
		const { error } = await client.auth.signInWithPassword({ email, password });
		return error?.message ?? 'ok';
	}

	async function miss(email: string, times: number) {
		for (let i = 0; i < times; i++)
			expect(await signIn(email, WRONG)).toBe('Invalid login credentials');
	}

	async function expireLock(id: string) {
		const { error } = await admin
			.from('auth_login_attempts')
			.update({ locked_until: new Date(Date.now() - 1000).toISOString() })
			.eq('user_id', id);
		if (error) throw new Error(error.message);
	}

	beforeAll(() => {
		admin = createClient(URL, KEY, { auth: { persistSession: false } });
	});

	afterAll(async () => {
		for (const id of created) await admin.auth.admin.deleteUser(id);
	});

	it('lets the right password through after four misses and forgets them', async () => {
		const { email } = await user();
		await miss(email, 4);
		expect(await signIn(email, PASSWORD)).toBe('ok');

		await miss(email, 4);
		expect(await signIn(email, PASSWORD)).toBe('ok');
	});

	it('refuses the right password after five misses with the usual wording', async () => {
		const { email } = await user();
		await miss(email, 5);
		expect(await signIn(email, PASSWORD)).toBe('Invalid login credentials');
	});

	it('opens again after the lock ran out, but the next miss locks right away', async () => {
		const { email, id } = await user();
		await miss(email, 5);

		await expireLock(id);
		await miss(email, 1);
		expect(await signIn(email, PASSWORD)).toBe('Invalid login credentials');

		await expireLock(id);
		expect(await signIn(email, PASSWORD)).toBe('ok');
		const { data } = await admin.from('auth_login_attempts').select('user_id').eq('user_id', id);
		expect(data).toEqual([]);
	});

	it('counts parallel guesses one by one', async () => {
		const { email } = await user();
		await Promise.all(Array.from({ length: 8 }, () => signIn(email, WRONG)));
		expect(await signIn(email, PASSWORD)).toBe('Invalid login credentials');
	});

	it('never locks the demo account', async () => {
		const { email } = await user({ demo: true });
		await miss(email, 6);
		expect(await signIn(email, PASSWORD)).toBe('ok');
	});
});
