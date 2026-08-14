# Changelog

## [0.1.6] — 2026-08-13

### Changed
- Open-source branding: CodeForest is the product name; VibeDecode is credited as the origin
- Homepage, repository, and issues links now point at GitHub instead of vibe-decode.com
- Renamed internal identifiers (`CodeForestPanel`, backend title, webview package) off the VibeDecode product name

### Added
- Develop-from-source instructions, CONTRIBUTING.md, SECURITY.md, and `.vscodeignore`

---

## [0.1.4] — 2026-06-29

### Added
- Hover-based path highlighting in the code graph: hovering a node brightens its directly connected nodes and edges while dimming everything else, giving a clear picture of each node's connections

---

## [0.1.3] — 2026-06-28

### Added
- README: dedicated Cursor installation instructions with terminal commands for manual VSIX install (Cursor does not yet list VS Code Marketplace extensions in its own search)

---

## [0.1.2] — 2026-06-28

### Changed
- Updated Homepage, Repository, and Issues links to `vibe-decode.com`

---

## [0.1.1] — 2026-06-28

### Changed
- Clarified language support in README: Python, TypeScript, and JavaScript are the only supported languages in this release; files in other languages are skipped

### Fixed
- macOS PEP 668 error: dependencies are now installed into a private virtual environment inside VS Code's global storage, leaving your system Python untouched

---

## [0.1.0] — 2026-06-27

### Added
- Initial release of CodeForest — a plugin from VibeDecode for code visualization
- Interactive animated code-dependency graph for any local workspace
- Top-level file graph: every source file as a node, import/require relationships as animated edges
- Drill-down view: click any file node to explore its functions, classes, and methods
- Code preview modal: click a method or function node to read its source code inline
- Python, TypeScript, and JavaScript analyzed separately with color-coded language clusters
- Top-Down (TD) and Left-to-Right (LR) layout toggle
- Minimap and custom scrollbars for large codebases
- Click a file node to open it in the VS Code editor simultaneously
- Local Python FastAPI backend — all analysis runs entirely on-device, no data leaves your machine
- Auto-installs Python dependencies on first run
- Keyboard shortcut: `Ctrl+Shift+G` / `Cmd+Shift+G`
- Works in both VS Code and Cursor IDE
