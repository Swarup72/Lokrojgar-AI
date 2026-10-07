import { z } from "zod";

/**
 * Chat input validation.
 *
 * Nothing here establishes WHO may read or write a conversation - that is
 * decided entirely in the controller, from the JWT and the hiring relationship.
 * These schemas only reject malformed payloads before they reach it.
 */

export const MAX_MESSAGE_LENGTH = 2000;

export const createConversationValidator = z.object({
  body: z.object({
    jobId: z.string().min(1, "Job ID is required"),
    // The employer says which hired worker they mean; a worker omits it, since
    // they can only be their own side of the conversation.
    workerId: z.string().min(1).optional(),
  }),
});

export const conversationIdValidator = z.object({
  params: z.object({
    conversationId: z.string().min(1, "Conversation ID is required"),
  }),
});

export const sendMessageValidator = z.object({
  params: z.object({
    conversationId: z.string().min(1, "Conversation ID is required"),
  }),
  body: z.object({
    // Trimmed first, so a whitespace-only message is rejected as empty rather
    // than stored as blank. The controller re-checks this against the same
    // bound - the validator is a guard, not the only line of defence.
    text: z
      .string({ error: "Message text is required" })
      .trim()
      .min(1, "Message cannot be empty")
      .max(MAX_MESSAGE_LENGTH, `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`),
  }),
});

export const listMessagesValidator = z.object({
  params: z.object({
    conversationId: z.string().min(1, "Conversation ID is required"),
  }),
  query: z
    .object({
      // Used for polling: only messages newer than this are returned.
      after: z.string().optional(),
    })
    .optional(),
});
