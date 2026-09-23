export type AnswerList = { ordered: boolean; start: number; entries: ListEntry[] };
export type ListEntry = { text: string; lists: AnswerList[] };

export type AnswerBlock =
	{ kind: 'heading' | 'paragraph'; text: string } | { kind: 'list'; list: AnswerList };

const BULLET = /^(\s*)(?:[*-]|(\d+)[.)])\s+(.*)$/;

// the model writes a small slice of markdown: headings, bold and lists nested by indent
export function parseAnswer(content: string): AnswerBlock[] {
	const blocks: AnswerBlock[] = [];
	// innermost list last
	let open: { indent: number; list: AnswerList }[] = [];

	for (const line of content.split('\n')) {
		const bullet = BULLET.exec(line);

		if (bullet) {
			const [, lead, number, text] = bullet;
			const indent = lead.length;
			const ordered = number !== undefined;

			while (open.length > 0 && open[open.length - 1].indent > indent) open.pop();
			let top = open.at(-1);

			if (top && top.indent === indent && top.list.ordered !== ordered) {
				open.pop();
				top = open.at(-1);
			}

			if (!top || top.indent < indent) {
				const list: AnswerList = { ordered, start: Number(number ?? 1), entries: [] };
				if (top) top.list.entries.at(-1)!.lists.push(list);
				else blocks.push({ kind: 'list', list });

				top = { indent, list };
				open.push(top);
			}

			top.list.entries.push({ text, lists: [] });
			continue;
		}

		// gemini puts blank lines between items now and then, that is still one list
		if (!line.trim()) continue;

		open = [];

		const heading = /^#+\s*(.*)$/.exec(line);
		blocks.push(
			heading ? { kind: 'heading', text: heading[1] } : { kind: 'paragraph', text: line }
		);
	}

	return blocks;
}
