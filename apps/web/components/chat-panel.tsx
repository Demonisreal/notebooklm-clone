'use client';

import { ArrowUp, BookmarkPlus, Square } from 'lucide-react';
import {
	cloneElement,
	type ReactElement,
	type ReactNode,
	useEffect,
	useRef,
	useState
} from 'react';
import type { ChatMessage, Citation } from 'shared';
import { streamChat } from '@/lib/chat-stream';
import { cn } from '@/lib/cn';

type Props = {
	notebookId: string;
	sourceIds: string[];
	hasSources: boolean;
	onCite: (citation: Citation) => void;
	onSaveNote: (content: string) => void;
};

const SUGGESTIONS = [
	'What are my sources about?',
	'What are the key points?',
	'Which deadlines are mentioned?'
];

export function ChatPanel({ notebookId, sourceIds, hasSources, onCite, onSaveNote }: Props) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [draft, setDraft] = useState('');
	const [streaming, setStreaming] = useState(false);
	const [partial, setPartial] = useState('');
	const [conversationId, setConversationId] = useState<string>();
	const [saved, setSaved] = useState<string | null>(null);
	const abort = useRef<AbortController>(null);
	const bottom = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottom.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages, partial]);

	async function ask(question: string) {
		if (!question.trim() || streaming) return;

		setDraft('');
		setStreaming(true);
		setPartial('');
		setMessages((prev) => [
			...prev,
			{ id: crypto.randomUUID(), role: 'user', content: question, citations: [], createdAt: '' }
		]);

		const controller = new AbortController();
		abort.current = controller;

		let text = '';
		let citations: Citation[] = [];

		try {
			for await (const event of streamChat(
				notebookId,
				{ message: question, conversationId, sourceIds },
				controller.signal
			)) {
				if (event.type === 'meta') setConversationId(event.conversationId);
				if (event.type === 'delta') {
					text += event.text;
					setPartial(text);
				}
				// the stream carries raw text, the cleaned up version arrives here
				if (event.type === 'citations') {
					text = event.text;
					citations = event.items;
				}
				if (event.type === 'error') text = event.message;
			}
		} catch {
			if (!controller.signal.aborted) text ||= 'The connection dropped.';
		}

		if (text) {
			setMessages((prev) => [
				...prev,
				{ id: crypto.randomUUID(), role: 'assistant', content: text, citations, createdAt: '' }
			]);
		}
		setPartial('');
		setStreaming(false);
		abort.current = null;
	}

	async function save(id: string, content: string) {
		await onSaveNote(content);
		setSaved(id);
		setTimeout(() => setSaved(null), 2000);
	}

	const empty = messages.length === 0 && !partial;

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 overflow-y-auto">
				<div
					className={cn(
						'mx-auto flex min-h-full max-w-2xl flex-col px-6 py-8',
						empty && 'justify-center'
					)}
				>
					{empty && (
						<div className="animate-rise pb-16 text-center">
							<h2 className="text-balance text-xl font-semibold">
								{hasSources ? 'Ask a question about your sources' : 'Upload a source first'}
							</h2>
							<p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--color-muted)]">
								{hasSources
									? 'Answers draw on your sources alone. Every claim gets a citation that leads back to the passage it came from.'
									: 'On the left you can upload a PDF, add a web page or paste in text.'}
							</p>

							{hasSources && (
								<div className="mt-8 flex flex-wrap justify-center gap-2">
									{SUGGESTIONS.map((s) => (
										<button
											key={s}
											onClick={() => ask(s)}
											className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 py-1.5 text-xs text-[var(--color-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-fg)]"
										>
											{s}
										</button>
									))}
								</div>
							)}
						</div>
					)}

					{messages.map((message) => (
						<Bubble
							key={message.id}
							message={message}
							onCite={onCite}
							onSave={() => save(message.id, message.content)}
							saved={saved === message.id}
						/>
					))}

					{partial && (
						<Bubble
							message={{
								id: 'partial',
								role: 'assistant',
								content: partial,
								citations: [],
								createdAt: ''
							}}
							onCite={onCite}
							onSave={() => {}}
							pending
						/>
					)}

					{streaming && !partial && (
						<div className="flex gap-1.5 py-2">
							{[0, 1, 2].map((i) => (
								<span
									key={i}
									className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--color-faint)]"
									style={{ animationDelay: `${i * 160}ms` }}
								/>
							))}
						</div>
					)}

					<div ref={bottom} />
				</div>
			</div>

			<div className="border-t border-[var(--color-line)] bg-[var(--color-bg)] px-6 py-4">
				<form
					onSubmit={(e) => {
						e.preventDefault();
						ask(draft);
					}}
					className="mx-auto max-w-2xl"
				>
					<div className="flex items-end gap-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface)] p-2 shadow-[var(--shadow-card)] transition focus-within:border-[var(--color-accent)]">
						<textarea
							value={draft}
							rows={1}
							placeholder={hasSources ? 'Ask a question…' : 'Add a source first'}
							disabled={!hasSources}
							onChange={(e) => setDraft(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && !e.shiftKey) {
									e.preventDefault();
									ask(draft);
								}
							}}
							className="max-h-32 flex-1 resize-none bg-transparent px-2.5 py-1.5 outline-none placeholder:text-[var(--color-faint)] disabled:cursor-not-allowed"
						/>

						{streaming ? (
							<button
								type="button"
								onClick={() => abort.current?.abort()}
								title="Stop generating"
								className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--color-line)] transition hover:bg-[var(--color-panel)]"
							>
								<Square className="h-3.5 w-3.5" />
							</button>
						) : (
							<button
								type="submit"
								disabled={!draft.trim()}
								title="Send"
								className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--color-accent)] text-[var(--color-accent-fg)] transition hover:bg-[var(--color-accent-hover)] disabled:opacity-30"
							>
								<ArrowUp className="h-4 w-4" />
							</button>
						)}
					</div>

					<p className="mt-2 text-center text-[11px] text-[var(--color-faint)]">
						{sourceIds.length > 0
							? `Searching ${sourceIds.length} selected ${sourceIds.length === 1 ? 'source' : 'sources'}`
							: 'Searching all sources · Enter sends, Shift+Enter for a new line'}
					</p>
				</form>
			</div>
		</div>
	);
}

function Bubble({
	message,
	onCite,
	onSave,
	saved,
	pending
}: {
	message: ChatMessage;
	onCite: (c: Citation) => void;
	onSave: () => void;
	saved?: boolean;
	pending?: boolean;
}) {
	if (message.role === 'user') {
		return (
			<div className="animate-rise mb-6 flex justify-end">
				<p className="max-w-[85%] rounded-2xl rounded-br-md bg-[var(--color-accent)] px-4 py-2.5 text-[var(--color-accent-fg)]">
					{message.content}
				</p>
			</div>
		);
	}

	const blocks = renderAnswer(message.content, message.citations, onCite);
	const last = blocks[blocks.length - 1];
	const cursor = (
		<span
			key="cursor"
			className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-[var(--color-accent)]"
		/>
	);
	// before the first delta there is no block for the cursor to hang on
	const body =
		pending && last
			? [...blocks.slice(0, -1), cloneElement(last, undefined, last.props.children, cursor)]
			: pending
				? [cursor]
				: blocks;

	// a <ul> must not sit inside a <p>, hence div instead of p
	return (
		<div className="animate-rise group mb-8">
			<div className="space-y-1.5 leading-[1.75]">{body}</div>

			{!pending && (
				<div className="mt-3 flex items-center gap-3">
					{message.citations.length > 0 && (
						<span className="text-xs text-[var(--color-faint)]">
							{message.citations.length} {message.citations.length === 1 ? 'citation' : 'citations'}{' '}
							· click to open the passage
						</span>
					)}

					<button
						onClick={onSave}
						className={cn(
							'ml-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs transition',
							saved
								? 'text-[var(--color-ok)]'
								: 'text-[var(--color-faint)] opacity-0 hover:bg-[var(--color-panel)] hover:text-[var(--color-fg)] focus-visible:opacity-100 group-hover:opacity-100'
						)}
					>
						<BookmarkPlus className="h-3.5 w-3.5" />
						{saved ? 'Saved as note' : 'Save as note'}
					</button>
				</div>
			)}
		</div>
	);
}

function renderInline(text: string, citations: Citation[], onCite: (c: Citation) => void) {
	return text.split(/(\*\*[^*]+\*\*|\[\d+\])/g).map((part, i) => {
		const bold = /^\*\*([^*]+)\*\*$/.exec(part);
		if (bold)
			return (
				<strong key={i} className="font-semibold">
					{bold[1]}
				</strong>
			);

		const match = /^\[(\d+)\]$/.exec(part);
		if (!match) return <span key={i}>{part}</span>;

		const citation = citations.find((c) => c.n === Number(match[1]));
		if (!citation) return <span key={i}>{part}</span>;

		return (
			<button
				key={i}
				onClick={() => onCite(citation)}
				title={`${citation.sourceTitle}${citation.page ? `, page ${citation.page}` : ''}`}
				className="mx-0.5 inline-flex h-[18px] min-w-[18px] translate-y-[-1px] items-center justify-center rounded-md bg-[var(--color-accent-soft)] px-1 align-middle text-[11px] font-semibold text-[var(--color-accent)] transition hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-fg)]"
			>
				{citation.n}
			</button>
		);
	});
}

function renderAnswer(content: string, citations: Citation[], onCite: (c: Citation) => void) {
	const blocks: ReactElement<{ children?: ReactNode }>[] = [];
	let items: string[] = [];

	function flushList() {
		if (!items.length) return;
		blocks.push(
			<ul key={blocks.length} className="list-disc space-y-1 pl-5">
				{items.map((item, i) => (
					<li key={i}>{renderInline(item, citations, onCite)}</li>
				))}
			</ul>
		);
		items = [];
	}

	for (const line of content.split('\n')) {
		const bullet = /^[*-]\s+(.*)$/.exec(line);
		if (bullet) {
			items.push(bullet[1]);
			continue;
		}

		flushList();

		if (!line.trim()) continue;

		const heading = /^#+\s*(.*)$/.exec(line);
		if (heading) {
			blocks.push(
				<p key={blocks.length} className="font-semibold">
					{renderInline(heading[1], citations, onCite)}
				</p>
			);
			continue;
		}

		blocks.push(<p key={blocks.length}>{renderInline(line, citations, onCite)}</p>);
	}

	flushList();

	return blocks;
}
