'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage, Citation } from 'shared';
import { api } from '@/lib/api';
import { streamChat } from '@/lib/chat-stream';

type Props = {
	notebookId: string;
	sourceIds: string[];
	onCite: (citation: Citation) => void;
	onSaveNote: (content: string) => void;
};

export function ChatPanel({ notebookId, sourceIds, onCite, onSaveNote }: Props) {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [draft, setDraft] = useState('');
	const [streaming, setStreaming] = useState(false);
	const [partial, setPartial] = useState('');
	const [conversationId, setConversationId] = useState<string>();
	const abort = useRef<AbortController>(null);
	const bottom = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottom.current?.scrollIntoView({ behavior: 'smooth' });
	}, [messages, partial]);

	async function send(event: React.FormEvent) {
		event.preventDefault();
		const question = draft.trim();
		if (!question || streaming) return;

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
				// der stream liefert rohtext, hier kommt die bereinigte fassung
				if (event.type === 'citations') {
					text = event.text;
					citations = event.items;
				}
				if (event.type === 'error') text = event.message;
			}
		} catch {
			if (!controller.signal.aborted) text ||= 'Die Verbindung wurde unterbrochen.';
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

	return (
		<div className="flex h-full flex-col">
			<div className="border-b border-[var(--color-line)] px-4 py-3">
				<h2 className="text-sm font-semibold">Chat</h2>
			</div>

			<div className="flex-1 overflow-y-auto px-4 py-4">
				{messages.length === 0 && !partial && (
					<div className="mt-16 text-center">
						<p className="text-sm font-medium">Stell eine Frage zu deinen Quellen</p>
						<p className="mt-1 text-xs text-[var(--color-muted)]">
							Antworten stützen sich nur auf die ausgewählten Quellen und verweisen mit Belegen
							zurück auf die Fundstelle.
						</p>
					</div>
				)}

				{messages.map((message) => (
					<Bubble key={message.id} message={message} onCite={onCite} onSaveNote={onSaveNote} />
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
						onSaveNote={onSaveNote}
						pending
					/>
				)}
				<div ref={bottom} />
			</div>

			<form onSubmit={send} className="border-t border-[var(--color-line)] p-3">
				<div className="flex gap-2">
					<input
						value={draft}
						onChange={(e) => setDraft(e.target.value)}
						placeholder="Frage stellen…"
						className="flex-1 rounded-md border border-[var(--color-line)] bg-transparent px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
					/>
					{streaming ? (
						<button
							type="button"
							onClick={() => abort.current?.abort()}
							className="rounded-md border border-[var(--color-line)] px-3 py-2 text-sm"
						>
							Stopp
						</button>
					) : (
						<button
							type="submit"
							disabled={!draft.trim()}
							className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
						>
							Senden
						</button>
					)}
				</div>
				{sourceIds.length > 0 && (
					<p className="mt-2 text-xs text-[var(--color-muted)]">
						{sourceIds.length} Quelle{sourceIds.length === 1 ? '' : 'n'} ausgewählt
					</p>
				)}
			</form>
		</div>
	);
}

function Bubble({
	message,
	onCite,
	onSaveNote,
	pending
}: {
	message: ChatMessage;
	onCite: (c: Citation) => void;
	onSaveNote: (content: string) => void;
	pending?: boolean;
}) {
	if (message.role === 'user') {
		return (
			<div className="mb-4 flex justify-end">
				<p className="max-w-[80%] rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm text-white">
					{message.content}
				</p>
			</div>
		);
	}

	return (
		<div className="group mb-6">
			<p className="whitespace-pre-wrap text-sm leading-relaxed">
				{renderWithChips(message.content, message.citations, onCite)}
				{pending && <span className="ml-0.5 animate-pulse">▌</span>}
			</p>

			{!pending && (
				<button
					onClick={() => onSaveNote(message.content)}
					className="mt-2 text-xs text-[var(--color-muted)] opacity-0 hover:underline group-hover:opacity-100"
				>
					Als Notiz speichern
				</button>
			)}
		</div>
	);
}

// belege als klickbare chips rendern, alles andere bleibt text
function renderWithChips(content: string, citations: Citation[], onCite: (c: Citation) => void) {
	const parts = content.split(/(\[\d+\])/g);

	return parts.map((part, i) => {
		const match = /^\[(\d+)\]$/.exec(part);
		if (!match) return <span key={i}>{part}</span>;

		const citation = citations.find((c) => c.n === Number(match[1]));
		if (!citation) return <span key={i}>{part}</span>;

		return (
			<button
				key={i}
				onClick={() => onCite(citation)}
				title={`${citation.sourceTitle}${citation.page ? `, Seite ${citation.page}` : ''}`}
				className="bg-[var(--color-accent)]/15 hover:bg-[var(--color-accent)]/30 mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded px-1 align-baseline text-xs font-medium text-[var(--color-accent)]"
			>
				{citation.n}
			</button>
		);
	});
}
