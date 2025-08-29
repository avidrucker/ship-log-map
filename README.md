# Web Map App (Outer Wilds‑inspired)

This project is a web app inspired by *Outer Wilds*' Rumor Map. It lets you model a knowledge graph of **nodes** (facts/locations/rumors), **edges** (discovery relationships), **notes**, and **pictures**. The graph is rendered interactively (via Cytoscape.js), and future work will add **dynamic drawing animations** that reveal connections over time.

## Quick Start

### Prerequisites
- Node.js 18+ recommended
- npm (or pnpm/yarn if you prefer, adjust commands accordingly)

### Install
```bash
npm install
```

### Run the dev server
```bash
npm run dev
```
This starts the local development server and hot reloads as you edit files.

### Run tests
```bash
npm test
```

## Project Structure (high level)

- `src/` — application source (React components, hooks, utils)
- `src/components/` — UI components such as the Cytoscape graph wrapper, controls, and modals
- `public/` — static assets
- `docs/` — project documentation, including the generated **Component & Module Guide**

See **docs/COMPONENT_GUIDE.md** for per‑file notes.

## Inspiration: The Rumor Map

In *Outer Wilds*, the ship’s computer visualizes the state of your knowledge as a **Rumor Map**: nodes represent discoveries and edges represent how one clue leads to another. This project adapts that idea into a general‑purpose, editable graph for your own projects or research:

- **Nodes**: title, description/notes, optional **pictures** (thumbnails and larger previews).
- **Edges**: directional or undirected relationships indicating how one idea leads to or unlocks another.
- **Layout & Styling**: uses Cytoscape for performant, expressive graph rendering.
- **Animations** *(planned)*: orchestrated reveal/draw effects showing how connections emerge as you learn or import data.

## Data & Validation

Graph data can be loaded from JSON (and URL query params in some flows). Validation helpers ensure the shape of nodes/edges/pictures is coherent before rendering. Background/underlay images can be cached locally and loaded from a CDN or local sources depending on settings.

## Contributing

1. Fork and clone the repo
2. Create a feature branch: `git switch -c feature/awesome-thing`
3. Commit with clear messages
4. Open a PR with a concise summary and screenshots/gifs when relevant

## Roadmap

- [ ] Animated edge draw/reveal sequences
- [ ] Better background/underlay image tooling and fallbacks
- [ ] Import/export UX polish (JSON & URL param sync)
- [ ] Accessibility and keyboard navigation
- [ ] Unit tests for graph adapters and validators
