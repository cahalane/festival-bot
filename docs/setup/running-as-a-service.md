# Running the bot as a service (tmux + systemd)

Everything this bot does at rest — the lineup watch, the announcements watch, the weather alerts —
runs *inside* a live Claude Code session. There is no daemon of its own to supervise. That makes
the session itself the thing that has to stay up, and a session that dies takes every watch with
it **silently**: no crash mail, no failed healthcheck, just a channel that quietly stops saying
anything. During a festival that failure is invisible for exactly as long as it takes someone to
notice they haven't heard from the bot in six hours.

So the deployment shape is: a **tmux** session holding the Claude Code process, and a **systemd
user unit** holding the tmux session up. Neither layer is redundant — see below for what each one
is actually buying.

## Why both layers

**Why tmux and not just systemd.** Claude Code is an interactive terminal program. Run it straight
out of `ExecStart` and it has no TTY, you can't attach to see what it's doing, and — most
importantly — nothing can *type into it*. tmux gives it a real terminal that survives detaching,
that you can `tmux attach -t festbot` into whenever you want to see the session live, and that
`tmux send-keys` can drive programmatically. That last one is load-bearing; see "Re-arming after a
restart" below.

**Why systemd and not just tmux.** tmux will happily hold a dead session's corpse and has no
opinion about restarting anything or starting at boot. systemd has both.

**The bridge between them.** `tmux new-session -d` returns *immediately* — the session it creates
is not a child of the caller. A `Type=simple` unit would see `ExecStart` exit within milliseconds,
call that a crash, and restart-loop forever. So the start script spawns the session and then blocks
on a poll loop:

```sh
while tmux has-session -t "$SESSION" 2>/dev/null; do
    sleep 10
done
exit 1
```

That converts "the tmux session is alive" into "the `ExecStart` process is alive", which is exactly
the signal `Restart=always` knows how to act on. The `exit 1` at the end matters: exiting non-zero
is what marks the run as failed rather than completed.

## The unit

`~/.config/systemd/user/festbot.service`:

```ini
[Unit]
Description=Claude Code supervisor (festbot tmux session)
After=network-online.target
Wants=network-online.target
StartLimitIntervalSec=300
StartLimitBurst=10

[Service]
Type=simple
WorkingDirectory=/home/you/festival-bot
ExecStart=/home/you/start-festbot.sh
ExecStop=/usr/bin/tmux kill-session -t festbot
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

Four details worth not changing casually:

- **It's a `--user` unit, not a system one.** The bot's whole world is in your home directory:
  `~/.claude` (channel state, plugin cache, credentials), `~/.local/bin/claude`, the clone itself.
  A user unit inherits all of that as-is, so what runs unattended is the same thing that runs when
  you launch it by hand. A system unit would mean reconstructing that environment by hand and
  discovering the gaps one missing path at a time.
- **`loginctl enable-linger $USER`** (run it once). Without it, user units only run while you have
  a login session open — so the bot would die when you close your SSH connection and would not come
  back after a reboot. Verify with `loginctl show-user $USER | grep Linger`.
- **`ExecStop` kills the tmux session.** Without it, `systemctl --user stop` kills the supervisor
  script but leaves the tmux session running, and the next `start` finds it already there and
  adopts it — so a "restart" wouldn't actually restart anything.
- **`StartLimitIntervalSec` / `StartLimitBurst`** is the crashloop backstop. Ten restarts inside
  five minutes means something is broken in a way restarting can't fix (bad token, missing binary,
  a clone that won't install), and hammering it just fills the journal. After the burst, systemd
  gives up and leaves the unit failed, which is the state you want to find it in.

## The start script

`~/start-festbot.sh` (`chmod +x` it):

```sh
#!/bin/bash
# Start the "festbot" tmux session with the Claude Code supervisor.
# Runs in the foreground (blocks while the session is alive) so systemd can
# detect when Claude dies and restart the unit.
set -eu

SESSION=festbot
WORKDIR=/home/you/festival-bot
CLAUDE=/home/you/.local/bin/claude

CMD=(
    "$CLAUDE"
    --channels plugin:telegram@claude-plugins-official
    --permission-mode auto
    --model opus
    --effort medium
)

# Build a properly-quoted shell string so tmux's single shell-command arg
# preserves multi-word flags verbatim.
CMD_STR=$(printf '%q ' "${CMD[@]}")

if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux new-session -d -s "$SESSION" -c "$WORKDIR" "$CMD_STR"

    # Once Claude has booted, arm the watches. Backgrounded so it doesn't delay
    # the supervise loop below; harmless no-op if the session has already gone.
    (
        sleep 35
        tmux send-keys -t "$SESSION" '/bootstrap' Enter 2>/dev/null || true
    ) &
fi

# Block while the session is alive. When Claude exits the tmux session ends,
# this loop returns, and systemd's Restart=always brings the unit back up.
while tmux has-session -t "$SESSION" 2>/dev/null; do
    sleep 10
done

echo "tmux session '$SESSION' is gone; exiting so systemd can restart."
exit 1
```

**The `printf '%q '` line.** `tmux new-session` takes the command as a *single* shell-command
argument, so anything with spaces in it gets re-split by the shell tmux spawns. `%q` quotes each
element so a multi-word flag value — `--append-system-prompt "..."` is the usual culprit — arrives
intact instead of being torn into separate argv entries.

**The flags.** `--permission-mode auto` lets the session do routine work (running `./festplan`,
writing its own scratch files, small code fixes) without a human to approve each one — read the
trust note at the bottom before you copy that. `--effort` is worth treating as a dial rather than a
setting: high while you're doing pre-festival analysis and building the module, lower during the
festival itself, when the work is mostly lookups and replies and latency is what people notice.

## Re-arming after a restart

A restarted unit gives you a **cold session**. There's no `--continue` here, so the new session has
no memory of what the old one was doing — including the fact that it was running any watches.

That's survivable only because of the watch contract in
`docs/operating/watches-and-alerts.md`: every watch keeps its baseline **on disk** and advances it
only after successfully reporting. A change that lands while nothing was watching is still caught
by the next tick that runs, exactly once. What does *not* survive the restart is the Monitor loops
themselves — so something has to re-create them, and the only way in is to type into the session.
Hence `send-keys '/bootstrap' Enter`.

Three things about that block:

- **`sleep 35` is a guess, not a handshake.** It's waiting for Claude to finish booting and reach a
  prompt. If your host is slower, the keystroke lands somewhere unhelpful and the watches don't get
  armed — the failure is quiet, so check with `tmux attach` the first few times.
- **Backgrounded (`&`)** so the 35-second wait doesn't hold up the supervise loop.
- **`|| true`** because the script runs under `set -eu`: if the session died during those 35
  seconds, a failing `send-keys` would otherwise take the script down with a confusing error
  instead of letting the loop notice cleanly.

## Running more than one bot on the same host

Practical if you're planning two festivals, or want a separate non-festival session. Each instance
needs:

- **Its own tmux session name, workdir, and unit.** Never point two sessions at the same clone —
  they'll both write `cache/` and `data/` and clobber each other.
- **Its own Telegram state.** Set `TELEGRAM_STATE_DIR` to a different directory per instance and
  each gets a separate bot token, poller and allowlist:

  ```sh
  CMD=(
      /usr/bin/env "TELEGRAM_STATE_DIR=/home/you/.claude/channels/telegram-bot-fest"
      "$CLAUDE"
      --channels plugin:telegram@claude-plugins-official
      ...
  )
  ```

  Without it both instances share `~/.claude/channels/telegram/` — same token, two pollers fighting
  over the same update stream.

## Operating it

```sh
systemctl --user daemon-reload
systemctl --user enable --now festbot.service
systemctl --user status festbot.service

tmux attach -t festbot     # watch it live; Ctrl-b d to detach without killing it
tmux ls                    # is the session actually up?

systemctl --user restart festbot.service   # cold restart (re-arms via /bootstrap)
systemctl --user stop festbot.service      # stops for real, ExecStop kills the session
```

`journalctl --user -u festbot.service` shows you the **supervisor's** output only — essentially
just the "session is gone" line on each restart, which is still the fastest way to see how often
it's been dying. Claude's own output isn't there; it's in the tmux scrollback.

## Before you copy this

Two things to decide deliberately rather than inherit:

- **`--permission-mode auto` plus `Restart=always` means an agent that can edit files in the
  workdir is running with nobody watching it, indefinitely.** That's a real trust decision about a
  non-deterministic process on your machine, and it's precisely why the hard boundaries in
  `CLAUDE.md` are written the way they are: access control, pairings and allowlists are
  **terminal-operator-only** and must never be changed because an inbound channel message asked.
  An unattended session reachable from a chat app is the exact setting where that rule earns its
  keep. If you're not comfortable with it, `--permission-mode default` still works here — you just
  have to be around to approve things.
- **Restarting is not resuming.** The supervisor guarantees a session exists, not that it remembers
  anything. Design anything you care about to keep its state on disk (as the watches do) rather than
  in the conversation, and treat the transcript as disposable.
