import {z} from  "zod";
import { describe } from "zod/v4/core";

export const telegramMessageInputSchema = z.object({
    chatId: z.string().min(1, "Chat ID is required"),
    message: z.string().min(1, "Message is required"),
});

export const telegramMessageOptionSchema = telegramMessageInputSchema.extend({
    botToken: z.string().min(1, "Telegram bot token is required"),
});

export const telegramSendMessageRequestSchema = z.object({
    chat_id: z.string().min(1),
    text: z.string().min(1),
});

export const telegramSendMessageResponseSchema = z.object({
    ok: z.boolean(),
    result: z
    .object({
        message_id: z.number(),
        })
        .optional(),
    description: z.string().optional(),
});


export const telegramMessageOutputSchema = z.object({
    ok: z.literal(true),
    chatId: z.string(),
    messageId: z.number(),
});

export type TelegramMessageInput = z.infer<typeof telegramMessageInputSchema>;
export type TelegramMessageOptions = z.infer<typeof telegramMessageOptionSchema>;
export type TelegramMessageOutput = z.infer<typeof telegramMessageOutputSchema>;

export const telegramVideoInputSchema = z.object({
    chatId: z.string().min(1, "Chat ID is required"),
    videoUrl: z.string().url("Must be a valid URL").optional(),
    videoPath: z.string().min(1, "Video path cannot be empty").optional(),
    caption: z.string().optional(),
});

export const telegramVideoOptionSchema = telegramVideoInputSchema.extend({
    botToken: z.string().min(1, "Telegram bot token is required"),
});

export const telegramSendVideoResponseSchema = z.object({
    ok: z.boolean(),
    result: z
        .object({
            message_id: z.number(),
        })
        .optional(),
    description: z.string().optional(),
});

export const telegramVideoOutputSchema = z.object({
    ok: z.literal(true),
    chatId: z.string(),
    messageId: z.number(),
});

export type TelegramVideoInput = z.infer<typeof telegramVideoInputSchema>;
export type TelegramVideoOptions = z.infer<typeof telegramVideoOptionSchema>;
export type TelegramVideoOutput = z.infer<typeof telegramVideoOutputSchema>;