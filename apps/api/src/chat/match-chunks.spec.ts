import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { FakeProvider } from '../llm/fake.provider';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SECRET_KEY ?? '';

// the search lives in the database, so that is where it gets checked.
// without a configured supabase, skip instead of going red
describe.skipIf(!KEY)('match_chunks', () => {
	// skipIf only skips the tests, the body still runs - without a key
	// createClient would take down the whole file during collection
	let db: SupabaseClient;
	const llm = new FakeProvider();

	const userId = '9ce97ae9-307f-4989-a4e6-8df3e8022e4d';
	const notebookId = '44444444-4444-4444-4444-444444444444';
	const bigSource = '55555555-5555-5555-5555-555555555555';
	const smallSource = '66666666-6666-6666-6666-666666666666';

	async function search(text: string, sourceIds: string[] | null, limit = 10) {
		const [embedding] = await llm.embed([text]);
		const { data, error } = await db.rpc('match_chunks', {
			p_notebook_id: notebookId,
			p_source_ids: sourceIds,
			p_query_embedding: JSON.stringify(embedding),
			p_query_text: text,
			p_limit: limit
		});
		if (error) throw new Error(error.message);
		return data as { id: string; content: string; score: number }[];
	}

	beforeAll(async () => {
		db = createClient(URL, KEY, { auth: { persistSession: false } });
		await db.from('notebooks').delete().eq('id', notebookId);
		await db.from('notebooks').insert({ id: notebookId, user_id: userId, title: 'RRF test' });
		await db.from('sources').insert([
			{
				id: bigSource,
				notebook_id: notebookId,
				user_id: userId,
				title: 'Big',
				kind: 'text',
				status: 'ready'
			},
			{
				id: smallSource,
				notebook_id: notebookId,
				user_id: userId,
				title: 'Small',
				kind: 'text',
				status: 'ready'
			}
		]);

		const filler = Array.from({ length: 120 }, (_, i) => ({
			source_id: bigSource,
			notebook_id: notebookId,
			idx: i,
			content: `General filler text about processes and administration, part ${i}`,
			char_start: i * 80,
			char_end: i * 80 + 60,
			lang: 'english'
		}));

		const needles = [
			'The notice period is four weeks to the end of the month under section 15a',
			'The Zephyr-7 product shipped in March'
		].map((content, i) => ({
			source_id: smallSource,
			notebook_id: notebookId,
			idx: i,
			content,
			char_start: i * 100,
			char_end: i * 100 + 80,
			lang: 'english'
		}));

		const rows = [...filler, ...needles];
		const embeddings = await llm.embed(rows.map((r) => r.content));
		await db
			.from('chunks')
			.insert(rows.map((row, i) => ({ ...row, embedding: JSON.stringify(embeddings[i]) })));
	}, 60000);

	it('finds a clause that pure vector search would miss', async () => {
		const hits = await search('section 15a', null, 5);
		expect(hits.some((h) => h.content.includes('15a'))).toBe(true);
	});

	it('copes with several terms in one natural question', async () => {
		const hits = await search('What is the notice period and when did Zephyr-7 ship?', null, 8);
		expect(hits.some((h) => h.content.includes('notice period'))).toBe(true);
		expect(hits.some((h) => h.content.includes('Zephyr-7'))).toBe(true);
	});

	// without hnsw.iterative_scan nothing would come back here: the index hands over
	// ef_search candidates and the filter throws all of them away afterwards
	it('returns hits when only the small source is selected', async () => {
		const hits = await search('warranty', [smallSource], 10);
		expect(hits.length).toBe(2);
	});

	it('treats an empty source array like no restriction', async () => {
		const hits = await search('administration', [], 5);
		expect(hits.length).toBeGreaterThan(0);
	});

	it('sorts by fusion score, descending', async () => {
		const hits = await search('notice period', null, 6);
		const scores = hits.map((h) => h.score);
		expect([...scores].sort((a, b) => b - a)).toEqual(scores);
	});

	it('does not choke on special characters in the question', async () => {
		await expect(
			search("what does 'this' & <-> !not? cost section 15a", null, 5)
		).resolves.toBeDefined();
	});
});
