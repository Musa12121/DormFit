# Private Gemini configuration

The user fills `server/config.local.mjs` privately and does not want agents to see the key. Do not read, search, print, diff, copy or include that file in tool output. Use `server/config.example.mjs` to inspect the configuration shape. Exclude private config and `.env*` files from broad content searches.

Automated Gemini tests must use fake keys and mocked responses. Leave live-key verification to the user. Never log request headers or raw upstream errors. Keep this project local unless the user requests publishing.
