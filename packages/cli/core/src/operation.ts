import { readFile } from "node:fs/promises";
import {
  telegramMessageOutputSchema,
  telegramMessageOptionSchema,
  telegramSendMessageRequestSchema,
  telegramSendMessageResponseSchema,
  telegramVideoOutputSchema,
  telegramVideoOptionSchema,
  telegramSendVideoResponseSchema,
  type TelegramMessageOptions,
  type TelegramMessageOutput,
  type TelegramVideoOptions,
  type TelegramVideoOutput,
} from "./schemas";


export async function sendTelegramMessage(
  input: TelegramMessageOptions,
): Promise<TelegramMessageOutput> {
  const parsedInput = telegramMessageOptionSchema.parse(input);
  const requestBody = telegramSendMessageRequestSchema.parse({
    chat_id: parsedInput.chatId,
    text: parsedInput.message,
  });

  const response = await fetch(`https://api.telegram.org/bot${parsedInput.botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: await Response.json(requestBody).text(),
  });

  const data = telegramSendMessageResponseSchema.parse(await response.json());

  if (!response.ok || !data.ok || !data.result) {
    throw new Error(data.description ?? "Telegram message request failed");
  }

  return telegramMessageOutputSchema.parse({
    ok: true,
    chatId: parsedInput.chatId,
    messageId: data.result.message_id,
  });
}

export async function sendTelegramVideo(
  input: TelegramVideoOptions,
): Promise<TelegramVideoOutput> {
  const parsedInput = telegramVideoOptionSchema.parse(input);

  if (!parsedInput.videoUrl && !parsedInput.videoPath) {
    throw new Error("Provide either videoUrl or videoPath");
  }
  if (parsedInput.videoUrl && parsedInput.videoPath) {
    throw new Error("Provide only one of videoUrl or videoPath, not both");
  }

  const form = new FormData();
  form.append("chat_id", parsedInput.chatId);
  if (parsedInput.caption) {
    form.append("caption", parsedInput.caption);
  }

  if (parsedInput.videoUrl) {
    form.append("video", parsedInput.videoUrl);
  } else {
    const path = parsedInput.videoPath!;
    const buffer = await readFile(path);
    form.append("video", new Blob([buffer]), path.split("/").pop());
  }

  const response = await fetch(`https://api.telegram.org/bot${parsedInput.botToken}/sendVideo`, {
    method: "POST",
    body: form,
  });

  const data = telegramSendVideoResponseSchema.parse(await response.json());

  if (!response.ok || !data.ok || !data.result) {
    throw new Error(data.description ?? "Telegram video request failed");
  }

  return telegramVideoOutputSchema.parse({
    ok: true,
    chatId: parsedInput.chatId,
    messageId: data.result.message_id,
  });
}