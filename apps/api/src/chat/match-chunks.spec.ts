import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { FakeProvider } from '../llm/fake.provider';

const URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const KEY = process.env.SUPABASE_SECRET_KEY ?? '';

// die suche lebt in der datenbank, also wird sie auch dort geprueft.
// ohne laufendes supabase ueberspringen statt rot zu werden
const reachable = await fetch(`${URL}/rest/v1/`, { headers: { apikey: KEY } })
	.then((r) => r.ok || r.status === 404)
	.catch(() => false);

describe.skipIf(!reachable || !KEY)('match_chunks', () => {
	const db: SupabaseClient = createClient(URL, KEY, { auth: { persistSession: false } });
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
		await db.from('notebooks').delete().eq('id', notebookId);
		await db.from('notebooks').insert({ id: notebookId, user_id: userId, title: 'RRF-Test' });
		await db.from('sources').insert([
			{
				id: bigSource,
				notebook_id: notebookId,
				user_id: userId,
				title: 'Gross',
				kind: 'text',
				status: 'ready'
			},
			{
				id: smallSource,
				notebook_id: notebookId,
				user_id: userId,
				title: 'Klein',
				kind: 'text',
				status: 'ready'
			}
		]);

		const filler = Array.from({ length: 120 }, (_, i) => ({
			source_id: bigSource,
			notebook_id: notebookId,
			idx: i,
			content: `Allgemeiner Fuelltext ueber Ablaeufe und Verwaltung, Abschnitt ${i}`,
			char_start: i * 80,
			char_end: i * 80 + 60,
			lang: 'german'
		}));

		const needles = [
			'Die Kuendigungsfrist betraegt vier Wochen zum Monatsende nach Paragraph 15a',
			'Das Produkt Zephyr-7 erschien im Maerz'
		].map((content, i) => ({
			source_id: smallSource,
			notebook_id: notebookId,
			idx: i,
			content,
			char_start: i * 100,
			char_end: i * 100 + 80,
			lang: 'german'
		}));

		const rows = [...filler, ...needles];
		const embeddings = await llm.embed(rows.map((r) => r.content));
		await db
			.from('chunks')
			.insert(rows.map((row, i) => ({ ...row, embedding: JSON.stringify(embeddings[i]) })));
	}, 60000);

	it('findet einen paragraphen, den reine vektorsuche verfehlen wuerde', async () => {
		const hits = await search('Paragraph 15a', null, 5);
		expect(hits.some((h) => h.content.includes('15a'))).toBe(true);
	});

	it('findet trotz mehrerer begriffe in einer natuerlichen frage', async () => {
		const hits = await search('Was ist die Kuendigungsfrist und wann kam Zephyr-7?', null, 8);
		expect(hits.some((h) => h.content.includes('Kuendigungsfrist'))).toBe(true);
		expect(hits.some((h) => h.content.includes('Zephyr-7'))).toBe(true);
	});

	// ohne hnsw.iterative_scan kaeme hier nichts zurueck: der index liefert
	// ef_search kandidaten und der filter wirft sie danach alle weg
	it('liefert treffer, wenn nur die kleine quelle ausgewaehlt ist', async () => {
		const hits = await search('Garantie', [smallSource], 10);
		expect(hits.length).toBe(2);
	});

	it('behandelt ein leeres quellen-array wie keine einschraenkung', async () => {
		const hits = await search('Verwaltung', [], 5);
		expect(hits.length).toBeGreaterThan(0);
	});

	it('sortiert absteigend nach fusionsscore', async () => {
		const hits = await search('Kuendigungsfrist', null, 6);
		const scores = hits.map((h) => h.score);
		expect([...scores].sort((a, b) => b - a)).toEqual(scores);
	});

	it('crasht nicht an sonderzeichen in der frage', async () => {
		await expect(
			search("was kostet 'das' & <-> !nicht? Paragraph 15a", null, 5)
		).resolves.toBeDefined();
	});
});
