#!/usr/bin/env python3
# momiq-hook — DeepFokus (Momiq) hook relay for Claude Code, Gemini CLI, Codex, Cursor and others.
# Reads the hook JSON from stdin, forwards it to Momiq over a Unix socket, translates the answer.
# Adapted from Coucou's nb-hook (MIT, © 2026 Louis Raillé). Never blocks the agent: if Momiq is
# not running, the event is dropped and the agent carries on.
import json
import os
import socket
import sys

SOCK = os.environ.get("MOMIQ_SOCKET") or os.path.expanduser("~/Library/Application Support/DeepFokus/momiq.sock")

EVENTS = {
    # Gemini CLI
    "BeforeTool": "PreToolUse", "BeforeToolSelection": "PreToolUse", "AfterTool": "PostToolUse",
    "AfterModel": "PostToolUse", "BeforeAgent": "UserPromptSubmit", "AfterAgent": "Stop",
    "startup": "SessionStart", "exit": "SessionEnd",
    # Codex
    "pre_tool_use": "PreToolUse", "post_tool_use": "PostToolUse", "user_prompt_submit": "UserPromptSubmit",
    "session_start": "SessionStart", "session_end": "SessionEnd", "stop": "Stop",
    "permission_request": "PermissionRequest", "notification": "Notification",
    # Cursor
    "beforeShellExecution": "PermissionRequest", "beforeMCPExecution": "PreToolUse", "afterFileEdit": "PostToolUse",
    "beforeSubmitPrompt": "UserPromptSubmit", "stop": "Stop",
    # camelCase (Copilot etc.)
    "sessionStart": "SessionStart", "userPromptSubmitted": "UserPromptSubmit", "agentStop": "Stop",
    "preToolUse": "PreToolUse", "postToolUse": "PostToolUse", "permissionRequest": "PermissionRequest",
    "sessionEnd": "SessionEnd",
}


def main():
    args = sys.argv[1:]
    agent = ""
    event_arg = ""
    i = 0
    while i < len(args):
        if args[i] == "--agent" and i + 1 < len(args):
            agent = args[i + 1]
            i += 2
            continue
        event_arg = args[i]
        i += 1
    try:
        raw = sys.stdin.read()
        payload = json.loads(raw) if raw.strip() else {}
        if not isinstance(payload, dict):
            payload = {}
    except Exception:
        payload = {}

    ev = payload.get("hook_event_name") or event_arg or ""
    payload["hook_event_name"] = EVENTS.get(ev, ev)
    # Cursor / Codex field names → Claude Code names
    if "tool_name" not in payload:
        for k in ("tool", "toolName", "name"):
            if isinstance(payload.get(k), str):
                payload["tool_name"] = payload[k]
                break
        if "command" in payload and "tool_name" not in payload:
            payload["tool_name"] = "Bash"
            payload["tool_input"] = {"command": payload.get("command")}
    if "session_id" not in payload:
        for k in ("conversation_id", "conversationId", "sessionId", "thread_id"):
            if payload.get(k):
                payload["session_id"] = str(payload[k])
                break
    if "cwd" not in payload and payload.get("workspace_roots"):
        payload["cwd"] = payload["workspace_roots"][0]
    if agent:
        payload["momiq_agent"] = agent
    elif os.environ.get("CLAUDE_CODE_ENTRYPOINT") == "claude-desktop":
        payload["momiq_agent"] = "claude-desktop"
    payload["term_program"] = os.environ.get("TERM_PROGRAM", "")
    payload["pid"] = os.getpid()

    # the session's title and root folder from the transcript (Claude Code)
    path = payload.get("transcript_path") or ""
    if path and os.path.exists(path):
        try:
            with open(path, "rb") as f:
                head = f.read(16384).splitlines()
                for line in head:
                    try:
                        root = json.loads(line).get("cwd")
                    except Exception:
                        continue
                    if root:
                        payload["session_root"] = root
                        break
                f.seek(0, os.SEEK_END)
                start = max(0, f.tell() - 262144)
                f.seek(start)
                lines = f.read().splitlines()
                title = ""
                for line in reversed(lines[1:] if start else lines):
                    if b'"custom-title"' not in line and b'"ai-title"' not in line:
                        continue
                    try:
                        e = json.loads(line)
                    except Exception:
                        continue
                    t = e.get("customTitle") or e.get("aiTitle") or ""
                    if t:
                        title = t
                        break
                if title:
                    payload["session_title"] = title
                # Claude's last answer for the Stop event
                if payload["hook_event_name"] == "Stop" and "last_assistant_message" not in payload:
                    for line in reversed(lines):
                        if b'"type":"assistant"' not in line:
                            continue
                        try:
                            e = json.loads(line)
                            parts = e.get("message", {}).get("content", [])
                            text = " ".join(p.get("text", "") for p in parts if isinstance(p, dict) and p.get("type") == "text").strip()
                        except Exception:
                            continue
                        if text:
                            payload["last_assistant_message"] = text[:4000]
                            break
        except Exception:
            pass

    ask = payload["hook_event_name"] == "PreToolUse" and payload.get("tool_name") == "AskUserQuestion"
    blocking = payload["hook_event_name"] == "PermissionRequest" or ask
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(118 if blocking else 1.5)
        s.connect(SOCK)
        s.sendall((json.dumps(payload) + "\n").encode())
        if not blocking:
            s.close()
            sys.exit(0)
        chunks = []
        while True:
            c = s.recv(4096)
            if not c:
                break
            chunks.append(c)
            if b"\n" in c:
                break
        s.close()
        resp = json.loads(b"".join(chunks).decode().strip() or "{}")
    except Exception:
        sys.exit(0)

    decision = resp.get("decision", "")
    if ask:
        answers = resp.get("answers")
        if isinstance(answers, dict) and answers:
            out = {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "allow",
                   "updatedInput": {"questions": payload.get("tool_input", {}).get("questions", []), "answers": answers}}}
            sys.stdout.write(json.dumps(out) + "\n")
            sys.stdout.flush()
        sys.exit(0)
    if decision not in ("allow", "always", "deny"):
        sys.exit(0)  # no answer → the agent asks in its own terminal
    if agent == "cursor":
        out = {"permission": "allow" if decision != "deny" else "deny"}
    elif agent in ("copilot", "muse"):
        out = {"permissionDecision": "allow" if decision != "deny" else "deny"}
    elif decision == "deny":
        out = {"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": {"behavior": "deny", "message": "Momiq orqali rad etildi"}}}
    else:
        d = {"behavior": "allow"}
        if decision == "always" and agent != "codex":
            d["updatedPermissions"] = payload.get("permission_suggestions", [])
        if payload.get("tool_name") == "ExitPlanMode":
            d["updatedInput"] = payload.get("tool_input", {})
        out = {"hookSpecificOutput": {"hookEventName": "PermissionRequest", "decision": d}}
    sys.stdout.write(json.dumps(out) + "\n")
    sys.stdout.flush()


if __name__ == "__main__":
    main()
