# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

SvelteKit (adapter-node) on Node 24, TypeScript, SQLite, git CLI, remark, Milkdown. Decided with the owner; see `docs/project/decisions.md`.

## Users

See `docs/project/prd.md`, section "Users": the owner running the instance, invited collaborators (most of them non-technical, desktop and phone), and AI agents acting with a human's rights under their own name.

## Product Purpose

See `docs/project/prd.md`, sections "Problem" and "Expected outcome".

## Positioning

The file is the product. Every page is a real Markdown file in a git repository on disk; humans through the browser and AI agents through MCP are equal users of the same folder. Notion treats Markdown as an import format and has no place for an agent as a user; Obsidian is a personal vault, not a shared, hosted space with a simple editor for non-technical people.

## Operating Context

- Workspaces are folders of `.md` files with frontmatter, images beside them, a `.inkmesh/comments/` folder for discussion threads. Any text editor plus `git commit` is a valid client.
- Agents connect from Claude Desktop, Claude Code, Cursor, ChatGPT or scripts through a remote MCP server or an HTTP API; the "Connect your agent" page gives non-technical people the exact thing to paste.
- Every save is a git commit attributed to the human, with "via <agent>" when an agent acted. The browser shows history and restores versions.
- One self-hosted instance per owner, on a VPS, open source.

## Capabilities and Constraints

Scope and non-goals: `docs/project/prd.md`, sections "Scope" and "Out of scope". Boundaries and invariants: `docs/project/architecture.md`.

Terminology: workspace (a folder and git repository), document (a `.md` file), member (a human with a role: owner, editor, reader), agent (a token issued by a member, acting in that member's name), raw mode (the editor showing the Markdown source).

Undecided: whether an existing git repository can be mounted as a workspace (v1: created by inkmesh).

## Brand Commitments

- Name: inkmesh. No logo yet.
- Interface in French and English; code and docs in English.
- Binding visual constraints from the owner (2026-10-18): light mode by default; one interface for everyone, with a raw Markdown toggle rather than a separate "technical" interface; readability of long text comes first; Fragment Mono is the owner's typeface wish, used where a monospace is legitimate. References and brief: `design/references/refs.md`.

## Evidence on Hand

No screenshots, testimonials, customers or benchmarks exist yet. Demonstration content must be authored and labelled synthetic. Reference captures of Linear, GitHub and Notion are in `design/references/`.

## Product Principles

1. The file on disk is the truth; the interface never hides or rewrites what the agent would see with `cat`.
2. Anything a human can do, an agent can do through the same core, and vice versa.
3. A non-technical member never has to see YAML or Markdown syntax unless they ask for it.
4. History is a feature: who changed what, when, through which agent, and one click to go back.
5. Simplicity over options: no feature, role or setting nobody asked for.

## Accessibility & Inclusion

WCAG 2.2 AA contrast, every action reachable by keyboard, documents readable and lightly editable on a phone.
