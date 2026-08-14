# Contributing to CodeForest

Thanks for helping improve CodeForest. Originally a VibeDecode feature, this extension is now a standalone open-source project.

## Prerequisites

- Node.js 18+
- Python 3.9+ on your `PATH` as `python3` or `python`
- VS Code or Cursor

## Setup

```bash
git clone https://github.com/codesbya8h1/codeforest-ext.git
cd codeforest-ext
npm install
npm run build
```

`npm run build` compiles the TypeScript extension host and the React webview (Vite output goes to `media/webview/`).

Open the repo folder in VS Code or Cursor and press `F5` to launch an Extension Development Host. In that window, open a folder that contains Python, TypeScript, or JavaScript, then run **CodeForest: Visualize Workspace** (`Cmd+Shift+G` / `Ctrl+Shift+G`).

Backend Python packages are installed automatically into a private venv in VS Code global storage on first run. Nothing is uploaded; analysis is local-only.

## Project layout

| Path | Role |
|---|---|
| `src/extension.ts` | Extension host: starts the backend, hosts the webview |
| `backend/main.py` | Local FastAPI analyzer (Python / JS / TS) |
| `webview-ui/` | React + Vite graph UI |
| `media/webview/` | Built webview assets (generated — do not edit by hand) |

## Making changes

- Edit `webview-ui/` for UI, then `npm run build` (or `npm run build-webview`) so `media/webview/` updates.
- Edit `src/extension.ts` for host/backend process management, then `npm run compile-ext`.
- Edit `backend/main.py` for analysis. Restart the Extension Development Host so a new backend process is spawned.

Please keep user-facing copy referring to this product as **CodeForest**. VibeDecode is the origin, not the extension name.

## Pull requests

1. Open an issue first for larger changes.
2. Keep PRs focused.
3. Describe what you changed and how you tested it (VS Code and/or Cursor).

## Reporting bugs

Use [GitHub Issues](https://github.com/codesbya8h1/codeforest-ext/issues). For security reports, see [SECURITY.md](SECURITY.md).
