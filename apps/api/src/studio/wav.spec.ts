import { describe, expect, it } from 'vitest';
import { durationSeconds, toWav } from './wav';

describe('toWav', () => {
	const pcm = Buffer.alloc(48000 * 2);

	it('setzt einen riff-wave-header davor', () => {
		const wav = toWav(pcm, 24000);
		expect(wav.subarray(0, 4).toString()).toBe('RIFF');
		expect(wav.subarray(8, 12).toString()).toBe('WAVE');
		expect(wav.length).toBe(pcm.length + 44);
	});

	it('traegt die abtastrate ein, sonst spielt es zu schnell oder zu langsam', () => {
		const wav = toWav(pcm, 24000);
		expect(wav.readUInt32LE(24)).toBe(24000);
		expect(wav.readUInt16LE(34)).toBe(16);
		expect(wav.readUInt16LE(22)).toBe(1);
	});

	it('meldet die groesse der nutzdaten', () => {
		const wav = toWav(pcm, 24000);
		expect(wav.readUInt32LE(40)).toBe(pcm.length);
		expect(wav.readUInt32LE(4)).toBe(pcm.length + 36);
	});

	it('rechnet die dauer aus', () => {
		expect(durationSeconds(pcm, 24000)).toBe(2);
		expect(durationSeconds(Buffer.alloc(0), 24000)).toBe(0);
	});
});
