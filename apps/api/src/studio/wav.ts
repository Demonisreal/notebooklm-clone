const HEADER_BYTES = 44;

// gemini returns raw pcm without a container, no browser can do anything with that
export function toWav(pcm: Buffer, sampleRate: number, channels = 1, bitsPerSample = 16): Buffer {
	const blockAlign = (channels * bitsPerSample) / 8;
	const header = Buffer.alloc(HEADER_BYTES);

	header.write('RIFF', 0);
	header.writeUInt32LE(36 + pcm.length, 4);
	header.write('WAVE', 8);
	header.write('fmt ', 12);
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20);
	header.writeUInt16LE(channels, 22);
	header.writeUInt32LE(sampleRate, 24);
	header.writeUInt32LE(sampleRate * blockAlign, 28);
	header.writeUInt16LE(blockAlign, 32);
	header.writeUInt16LE(bitsPerSample, 34);
	header.write('data', 36);
	header.writeUInt32LE(pcm.length, 40);

	return Buffer.concat([header, pcm]);
}

export function durationSeconds(pcm: Buffer, sampleRate: number, channels = 1, bitsPerSample = 16) {
	return Math.round(pcm.length / (sampleRate * channels * (bitsPerSample / 8)));
}
