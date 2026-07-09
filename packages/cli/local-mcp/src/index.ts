import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { telegramMessageInputSchema, telegramVideoInputSchema } from '../../core/src';
import { sendTelegramMessage, sendTelegramVideo } from '../../core/src/operation';


// create MCP server 
const server = new McpServer({
    name: "sendkit-local",
    version: "0.0.0",
});

function getTelegramBotToken() {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
        throw new Error("TELEGRAM_BOT_TOKEN is required. Configure it in your MCP client environment.");
    }

    return token;
}

server.registerTool(
    "telegram",
    {
        title: "telegram",
        description: "Send a Telegram message.",
        inputSchema: telegramMessageInputSchema.shape,
    },
    async (input) => {
        const result =await sendTelegramMessage({
        ...input,
        botToken: getTelegramBotToken()    
        });

        return {
            content: [
                {
                    type: "text",
                    text: `Send telegram message ${result.messageId} to chat ${result.chatId}`,
                },
            ],
            structuredContent: result,
        }
    },
);

server.registerTool(
    "telegram_video",
    {
        title: "telegram_video",
        description: "Send a video to a Telegram chat, from either a URL or a local file path.",
        inputSchema: telegramVideoInputSchema.shape,
    },
    async (input) => {
        const result = await sendTelegramVideo({
            ...input,
            botToken: getTelegramBotToken(),
        });

        return {
            content: [
                {
                    type: "text",
                    text: `Sent Telegram video ${result.messageId} to chat ${result.chatId}`,
                },
            ],
            structuredContent: result,
        };
    },
);

const transport = new StdioServerTransport();
await server.connect(transport);