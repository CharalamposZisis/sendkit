import { Hono, type Context } from "hono";
import { randomUUID, createHash } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { sendTelegramMessage, telegramMessageInputSchema } from "sendkit-core";
import { generateProtectedResourceMetadata } from "@clerk/mcp-tools/server";

// create MCP server
function createServer(botToken: string) {
  const server = new McpServer({
    name: "sendkit-remote",
    version: "0.0.0",
  });

  server.registerTool(
    "telegram",
    {
      title: "telegram",
      description: "Send a Telegram message.",
      inputSchema: telegramMessageInputSchema.shape,
    },
    async (input) => {
      const result = await sendTelegramMessage({
        ...input,
        botToken,
      });

      return {
        content: [
          {
            type: "text",
            text: `Send telegram message ${result.messageId} to chat ${result.chatId}`,
          },
        ],
        structuredContent: result,
      };
    },
  );

  return server;
}

const app = new Hono();

function originOf(c: { req: { url: string; header: (name: string) => string | undefined } }) {
  const forwardedProto = c.req.header("x-forwarded-proto");
  const forwardedHost = c.req.header("x-forwarded-host");

  if (forwardedProto && forwardedHost) {
    return `${forwardedProto.split(",")[0].trim()}://${forwardedHost.split(",")[0].trim()}`;
  }

  return new URL(c.req.url).origin;
}

function protectedResourceMetadataUrl(c: Context, botToken: string) {
  return new URL(`/.well-known/oauth-protected-resource/${botToken}/mcp`, c.req.url).toString();
}
app.get("/.well-known/oauth-protected-resource/:botToken/mcp", (c) => {
  return c.json(
    generateProtectedResourceMetadata({
      authServerUrl: originOf(c),
      resourceUrl: new URL(`/${c.req.param("botToken")}/mcp`, c.req.url).toString(),
    }),
  );
});

function unauthorizedMcpResponse(c: Context, botToken: string) {
  c.header(
    "WWW-Authenticate",
    `Bearer resource_metadata="${protectedResourceMetadataUrl(c, botToken)}"`,
  );
  return c.json({ error: "Unauthorized" }, 401);
}

// --- Minimal single-user OAuth 2.1 authorization server (RFC 8414 metadata + RFC 7591 ---
// --- dynamic client registration + PKCE), so remote MCP connectors can register.      ---
// --- Auto-approves every authorization request since this server has exactly one user. ---

type Client = { clientId: string; redirectUris: string[] };
type AuthCode = { clientId: string; redirectUri: string; codeChallenge: string; expiresAt: number };
type AccessToken = { clientId: string; expiresAt: number };

const clients = new Map<string, Client>();
const authCodes = new Map<string, AuthCode>();
const accessTokens = new Map<string, AccessToken>();

app.get("/.well-known/oauth-authorization-server", (c) => {
  const origin = originOf(c);

  return c.json({
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

app.post("/register", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const redirectUris: string[] = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];

  if (redirectUris.length === 0) {
    return c.json({ error: "invalid_client_metadata", error_description: "redirect_uris is required" }, 400);
  }

  const clientId = randomUUID();
  clients.set(clientId, { clientId, redirectUris });

  return c.json({
    client_id: clientId,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code"],
    response_types: ["code"],
  });
});

app.get("/authorize", (c) => {
  const clientId = c.req.query("client_id") ?? "";
  const redirectUri = c.req.query("redirect_uri") ?? "";
  const state = c.req.query("state") ?? "";
  const codeChallenge = c.req.query("code_challenge") ?? "";
  const codeChallengeMethod = c.req.query("code_challenge_method") ?? "";

  const client = clients.get(clientId);

  if (!client || !client.redirectUris.includes(redirectUri)) {
    return c.json({ error: "invalid_request", error_description: "Unknown client_id or redirect_uri" }, 400);
  }
  if (codeChallengeMethod !== "S256" || !codeChallenge) {
    return c.json({ error: "invalid_request", error_description: "PKCE (S256) is required" }, 400);
  }

  const code = randomUUID();
  authCodes.set(code, { clientId, redirectUri, codeChallenge, expiresAt: Date.now() + 60_000 });

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) redirect.searchParams.set("state", state);

  return c.redirect(redirect.toString());
});

app.post("/token", async (c) => {
  const body = await c.req.parseBody();
  const grantType = String(body.grant_type ?? "");
  const code = String(body.code ?? "");
  const clientId = String(body.client_id ?? "");
  const codeVerifier = String(body.code_verifier ?? "");

  if (grantType !== "authorization_code") {
    return c.json({ error: "unsupported_grant_type" }, 400);
  }

  const entry = authCodes.get(code);
  if (!entry || entry.clientId !== clientId || entry.expiresAt < Date.now()) {
    return c.json({ error: "invalid_grant" }, 400);
  }

  const computedChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  if (computedChallenge !== entry.codeChallenge) {
    return c.json({ error: "invalid_grant", error_description: "PKCE verification failed" }, 400);
  }

  authCodes.delete(code);

  const accessToken = randomUUID();
  accessTokens.set(accessToken, { clientId, expiresAt: Date.now() + 60 * 60 * 1000 });

  return c.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
  });
});

// --- MCP endpoint, protected by the access token issued above ---

app.post("/:botToken/mcp", async (c) => {
  const botToken = c.req.param("botToken");
  const authHeader = c.req.header("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  const grant = token ? accessTokens.get(token) : undefined;

  if (!grant || grant.expiresAt < Date.now()) {
    return unauthorizedMcpResponse(c, botToken);
  }

  const server = createServer(botToken);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  try {
    return await transport.handleRequest(c.req.raw);
  } finally {
    await server.close();
  }
});

app.notFound((c) => c.json({ error: "Not Found" }, 404));

const port = Number(process.env.PORT ?? 3000);

export default {
  port,
  fetch: (req: Request) => {
    const url = new URL(req.url);
    url.protocol = req.headers.get("x-forwarded-proto") ?? url.protocol;
    url.host = req.headers.get("x-forwarded-host") ?? url.host;

    return app.fetch(new Request(url, req));
  },
};