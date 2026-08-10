import { z } from 'zod';

export const createNotebookSchema = z.object({
	title: z.string().trim().min(1).max(120),
	emoji: z.string().trim().max(8).optional()
});

export const updateNotebookSchema = createNotebookSchema.partial();

export type CreateNotebookInput = z.infer<typeof createNotebookSchema>;
export type UpdateNotebookInput = z.infer<typeof updateNotebookSchema>;

export type Notebook = {
	id: string;
	title: string;
	emoji: string;
	sourceCount: number;
	createdAt: string;
	updatedAt: string;
};
