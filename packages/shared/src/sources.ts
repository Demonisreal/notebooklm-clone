import { z } from 'zod';

export const sourceKinds = ['pdf', 'docx', 'text', 'markdown', 'url'] as const;
export const sourceStatuses = ['pending', 'processing', 'ready', 'error'] as const;

export type SourceKind = (typeof sourceKinds)[number];
export type SourceStatus = (typeof sourceStatuses)[number];

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const uploadUrlSchema = z.object({
	filename: z.string().trim().min(1).max(255),
	size: z.number().int().positive().max(MAX_UPLOAD_BYTES)
});

// a source arrives either as a file, as a url or as pasted text
export const createSourceSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('file'),
		storagePath: z.string().trim().min(1),
		title: z.string().trim().min(1).max(255)
	}),
	z.object({
		kind: z.literal('url'),
		url: z.string().url()
	}),
	z.object({
		kind: z.literal('text'),
		title: z.string().trim().min(1).max(255),
		content: z.string().trim().min(1)
	})
]);

export type UploadUrlInput = z.infer<typeof uploadUrlSchema>;
export type CreateSourceInput = z.infer<typeof createSourceSchema>;

export type Source = {
	id: string;
	notebookId: string;
	title: string;
	kind: SourceKind;
	status: SourceStatus;
	errorMessage: string | null;
	charCount: number | null;
	createdAt: string;
};

export const extensionToKind: Record<string, SourceKind> = {
	pdf: 'pdf',
	docx: 'docx',
	md: 'markdown',
	markdown: 'markdown',
	txt: 'text'
};
