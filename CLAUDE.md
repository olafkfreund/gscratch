# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A GNOME Shell extension (`scratchpad@wastedintelligence.com`) that brings i3/Sway-style
"scratchpads" to GNOME: show/hide running applications as centered, raised windows via
global keyboard shortcuts. Written in GJS using ES modules (the GNOME 45+ extension format).
No package manager, no test suite, and no linter — it is plain `.js` loaded directly by
GNOME Shell. The only build step is compiling the GSettings schema.

## Development workflow

```sh
./bin/build      # glib-compile-schemas schemas/  — REQUIRED before first load and after schema edits
./bin/test       # headless gjs tests: config.js (defaults/migration/bad-JSON) + D-Bus iface XML
./bin/run        # launches a nested GNOME Shell (dbus-run-session -- gnome-shell --nested --wayland)
```

`./bin/test` needs `gjs` + `glib-compile-schemas` on PATH; it runs with a memory GSettings
backend and a temp HOME, so it never touches real dconf. It covers everything that doesn't
require a live GNOME Shell — the prefs dialog, the live D-Bus window list, and actual
keybinding still need `./bin/run` (or a real session) to exercise.

The extension declares `settings-schema` in `metadata.json`, so `getSettings()` (and therefore
`enable()`) throws if `schemas/gschemas.compiled` is missing — always run `./bin/build` first.
The compiled output is gitignored (`schemas/*.compiled`).

Preferences UI: `gnome-extensions prefs scratchpad@wastedintelligence.com` (or the Extensions app).

To install for real, the extension directory must be symlinked/copied to the UUID-named path
GNOME loads from:

```sh
ln -s "$PWD" "$HOME/.local/share/gnome-shell/extensions/scratchpad@wastedintelligence.com"
```

Debugging is done through GNOME's **Logs** application — every log line is prefixed with
`[gnome-scratchpad]` (see `Window.logWindows()` which dumps every running window's title and
wmclass, useful when a binding fails to match).

Supported `shell-version` values live in `metadata.json`. Adding support for a new GNOME
release means appending its major version there (this is the entire content of the recent
"Add Gnome N support" commits).

## Architecture

Entry point is `extension.js` (`ScratchpadExtension extends Extension`). `enable()` gets the
GSettings object, wires up the keybinder, exports the D-Bus window-list service, connects a
settings `changed` handler for live reload, then applies bindings; `disable()` tears all of
that down (disconnect handler, unexport D-Bus, clear bindings, null refs). Flow:

- **`config.js`** — reads configuration from **GSettings** (`org.gnome.shell.extensions.scratchpad`),
  not a file. `parse()` returns `{ window_width, window_height, hide_keybind, bindings }`, where
  `bindings` is parsed from a JSON-string key (`bindings`) — bad JSON is tolerated as `[]`.
  On first run it performs a **one-time migration** of any legacy
  `$HOME/.config/gnome-scratchpad/config.json` into GSettings (guarded on `bindings` still being
  default `'[]'`).

- **Live reload** — `extension.js` connects `settings 'changed' → reload()`, which clears and
  rebuilds all keybindings. So prefs/`gsettings` edits apply immediately (no toggle needed).

- **`prefs.js`** — GTK4/Adwaita preferences dialog, runs in a **separate process** from the shell.
  Binds size/hide-shortcut to GSettings; edits the `bindings` JSON. Populates the per-binding
  window-class dropdown by calling the shell-side D-Bus service (see below); falls back to
  free-text if unavailable. Targets libadwaita 1.4+ (GNOME 45) — avoid newer widgets like
  `Adw.ButtonRow` (1.6/GNOME 47).

- **`dbusService.js`** — runs in the shell process; exports `ListWindowClasses() → a(ss)` on the
  session bus (`com.wastedintelligence.Scratchpad`). This is the bridge that lets the
  separate-process prefs dialog enumerate open windows (it can't touch `Shell.AppSystem` itself).

- **`keybinder.js`** — owns global accelerators via `global.display.grab_accelerator` +
  `Main.wm.allowKeybinding`. It connects once to `accelerator-activated` and dispatches by
  numeric `action` id through a `Map<action, {callback,...}>`. `clearBindings()` ungrabs and
  revokes them on disable. This is the low-level GNOME keybinding plumbing — it does not know
  anything about windows.

- **`window.js`** — `Window.find({wmclass, title})` scans `Shell.AppSystem` running apps,
  regex-matches the first window whose `wm_class_instance` OR `title` matches (wmclass takes
  precedence), and wraps it. Instance methods (`arrange`/`show`/`hide`/`focused`) drive Mutter
  window operations: `arrange()` centers on the primary monitor accounting for multi-monitor
  workspace geometry; `hide()` is `minimize()`, `show()` moves the window to the active
  workspace then unminimizes/raises/focuses.

`extension.js` is the only stateful coordinator: per-binding it toggles (focused → hide,
else arrange+show), plus a global `hide_keybind` that minimizes every configured window.

## Conventions when editing

- ES module imports only, using GNOME's resource/`gi://` scheme
  (e.g. `import Shell from 'gi://Shell'`, `resource:///org/gnome/shell/...`). No npm imports.
- GNOME APIs are GObject-introspection bindings (Meta, Shell, Gio, GLib) — consult GJS /
  GNOME Shell extension docs, not Node.js APIs.
- Keep the four-class separation (config / keybinder / window / coordinator); each is small
  and single-purpose by design.
