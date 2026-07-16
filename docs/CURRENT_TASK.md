# Current task

- ID: `WS-002`
- Title: Accept WinSight v0.1 from a new Codex task
- State: `NEEDS_USER_ACCEPTANCE`
- Owner: User with Codex support
- Last updated: 2026-07-17

## Goal

Verify that the GitHub-installed WinSight skill is automatically discovered and usable from a new Codex task without relying on this conversation.

## In scope

- Start a new Codex task
- Ask it to use WinSight to capture the WeChat developer tool or another chosen app
- Confirm that it discovers the installed skill and returns a valid image/evidence
- Record the user's explicit acceptance or failure details in M04

## Not in scope

- Further publication or installation work already archived for `WS-002`
- WGC native frame implementation (`WS-003`)
- DXGI Desktop Duplication (`WS-004`)
- MCP image server (`WS-005`)
- Input automation or security-policy changes

## Done when

- A new task automatically discovers WinSight
- The task captures the requested window with valid non-black evidence
- The user explicitly marks M04 accepted or provides reproducible failure details

## Next concrete action

User starts a new task and asks: “使用 WinSight 捕获微信开发者工具窗口，并告诉我采用了哪个后端。”
