import { z } from 'zod';

export const noteOrigins = ['manual', 'chat', 'studio'] as const;
export type NoteOrigin = (typeof noteOrigins)[number];

export const createNoteSchema = z.object({
	title: z.string().trim().max(200).optional(),
	content: z.string().trim().min(1),
	origin: z.enum(noteOrigins).default('manual')
});

export const updateNoteSchema = z.object({
	title: z.string().trim().max(200).optional(),
	content: z.string().trim().min(1).optional()
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;

export type Note = {
	id: string;
	notebookId: string;
	title: string | null;
	content: string;
	origin: NoteOrigin;
	createdAt: string;
};
