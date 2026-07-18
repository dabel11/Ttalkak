# TTALKAK Chrome Extension

Chrome Side Panel extension for improving prompts and sending the final prompt to AI tools such as ChatGPT, Gemini, and Claude.

## Current Integration Direction

- The extension should not call the FastAPI RAG server directly.
- Prompt improvement goes through Spring Boot:

```text
Chrome extension
-> Spring Boot POST /api/prompts/improve
-> FastAPI POST /query
-> RAG / Vector DB / LLM
-> Spring Boot
-> Chrome extension
```

- The extension keeps saved prompts and recent chats in local storage for now.
- Server-side login, thread storage, folder storage, and share integration are future integration points.
- Claude currently uses clipboard fallback. ChatGPT and Gemini use page insertion where possible, then clipboard fallback if insertion fails.

## Development

```bash
npm install
npm run build
```

Load the built extension in Chrome:

```text
extension/dist
```

Chrome loading steps:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click "Load unpacked"
4. Select the `extension/dist` folder

## Structure

- `src/main.jsx`: Side Panel React UI
- `src/styles.css`: Side Panel styles
- `public/manifest.json`: Chrome Extension Manifest V3 settings
- `public/background.js`: Side Panel opening and AI-site prompt insertion logic

## Backend Setting

The default Backend API URL is:

```text
http://localhost:8080
```

The extension calls:

```text
POST /api/prompts/improve
```

The previous direct RAG URL `http://localhost:8000/query` is no longer the intended frontend path.
