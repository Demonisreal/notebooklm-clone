// how close to the widest line a line has to run to count as full
const FULL = 0.8;

// only ever turns a line break into a space, so the citation offsets stay valid
export function reflow(text: string): string {
	const lines = text.split('\n');
	const widest = lines.reduce((max, line) => Math.max(max, line.trimEnd().length), 0);

	return lines
		.map((line, i) => {
			if (i === lines.length - 1) return line;

			const end = line.trimEnd();
			// a full line that goes on in lower case was wrapped by the layout, not the author
			const wrapped =
				end.length >= widest * FULL &&
				/[\p{L},]$/u.test(end) &&
				/^\s*\p{Ll}\p{L}/u.test(lines[i + 1]);

			return line + (wrapped ? ' ' : '\n');
		})
		.join('');
}
