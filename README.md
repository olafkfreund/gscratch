# Gnome Scratchpad Extension

If you've used i3 or Sway, you may be familiar with [their concept of a
"scratchpad"](https://i3wm.org/docs/userguide.html#_scratchpad), which allows
showing/hiding an application as a floating, centered window with a global
shortcut.

This interaction model is ideal for applications you engage with _often but
briefly_. Scratchpads let you summon group messaging, an email client, a
calendar, or a terminal instantly from any workspace, then quickly dismiss it to
get back to what you were doing. This extension brings that to GNOME.

## Features

- **Toggle apps with a shortcut** — press a global keybind to show a window
  centered and focused, or hide it if it's already in front.
- **Hide-all shortcut** — dismiss every visible scratchpad window at once.
- **Graphical preferences** — set everything up from a GTK/Adwaita dialog. No
  config files to hand-edit.
- **Pick from open windows** — when adding a binding, choose the target from a
  live dropdown of the windows you currently have open, with a **Custom…**
  option for regexes or apps that aren't running.
- **Match by class or title** — target windows by their `wmclass` or window
  title, using regular expressions.
- **Live reload** — changes apply immediately; no need to toggle the extension.
- **GNOME 45–49** support.

## How it works

Each binding pairs a **window matcher** with a **keyboard shortcut**:

- When you press the shortcut and the matched window is *not* focused, it is
  moved to your current workspace, centered, resized, and focused.
- Press it again while that window is focused and it is hidden (minimized).
- A separate **hide-all** shortcut minimizes every matched window at once.

Windows are matched by `wmclass` (the application's window class) or `title`,
each interpreted as a regular expression. If both are given they form a logical
OR, with `wmclass` taking precedence. If several windows match, the first one is
used.

Configuration is stored in GNOME's settings system (GSettings, under the
`org.gnome.shell.extensions.scratchpad` schema), so it is backed up and synced
along with the rest of your GNOME settings.

## Installation

Clone or copy this repo to:

```
$HOME/.local/share/gnome-shell/extensions/scratchpad@wastedintelligence.com
```

Then compile the settings schema once (and again whenever you pull schema
changes):

```bash
./bin/build   # runs: glib-compile-schemas schemas/
```

Finally, enable the extension — on Wayland you may need to log out and back in
first so GNOME Shell picks up the newly added extension:

```bash
gnome-extensions enable scratchpad@wastedintelligence.com
```

(or toggle it on in the **Extensions** app.)

## Getting started

Open the preferences dialog from the **Extensions** app (the gear/settings icon
next to "Scratchpad"), or from a terminal:

```bash
gnome-extensions prefs scratchpad@wastedintelligence.com
```

**General** lets you set the size scratchpad windows are resized to, and the
hide-all shortcut.

**Bindings** is where you add scratchpads. Click **+** to add one, then for each
binding:

1. **Window class** — pick the target from the dropdown of currently-open
   windows, or choose **Custom…** to type a `wmclass` regex (useful for apps
   that aren't running yet, or to match a family of windows).
2. **Title** *(optional)* — a regex matched against the window title instead of
   (or in addition to) the class.
3. **Shortcut** — the keybind that toggles this window, in
   `[<Modifiers>+]<key>` notation, e.g. `<super>i` or `<super>Return`.

Changes take effect immediately — try the shortcut right away.

> [!TIP]
> Configuration reloads live, so edits in the preferences dialog apply at once.

### Finding a window class

The dropdown covers most cases, but if you need to identify a window manually
(for a `Custom…` regex), use GNOME's "Looking Glass":

1. Make sure the target app/window is open.
2. Open the "run command" prompt (`Alt+F2` by default).
3. Type `lg` and hit enter.
4. Click the "Windows" button (top right) and find your app's `wmclass`.

> [!NOTE]
> Prefer `wmclass` over `title` where possible — titles often change based on
> the window's content, while the class is stable.

### Picking shortcuts

GNOME reserves some shortcuts. If a keybind doesn't work, check it isn't already
assigned under *Settings → Keyboard → Keyboard Shortcuts → View and Customize
Shortcuts*, and disable or reassign the conflicting one.

## Website "applications"

Scratchpads pair especially well with _site-specific browser windows_. You can
configure Chrome/Chromium to open a website in its own window and bind a shortcut
to it — great for sites like Todoist, DevDocs, or Google Calendar that you'd
rather not install natively.

> [!NOTE]
> This currently works with Chrome/Chromium. It was previously possible in
> Firefox but [was removed in v86](https://bugzilla.mozilla.org/show_bug.cgi?id=1682593).

Create a small launcher script:

```bash
#!/bin/sh

APP_NAME="todoist"

chromium --user-data-dir="$HOME/.config/$APP_NAME" --app=https://$APP_NAME.com
```

The resulting window can be targeted with a `Custom…` window class such as
`^chrome\-todoist\.com`.

### Creating a desktop entry

So you can launch it without a terminal, add a
`$HOME/.local/share/applications/todoist.desktop` file:

```desktop
[Desktop Entry]
Type=Application
Encoding=UTF-8
Name=Todoist
Comment=Todoist Chromium Web Application
Exec=/path/to/the/script/above
Icon=application.png
Terminal=false
```

Once GNOME indexes it, you can launch Todoist from the overview and toggle it
from any workspace with your chosen shortcut.

## Migrating from the old config file

Earlier versions read a `~/.config/gnome-scratchpad/config.json` file. If you
have one, it is **imported into GSettings automatically the first time** the
extension runs after upgrading, after which the file is no longer used. Manage
everything from the preferences dialog going forward.

## Advanced: editing settings directly

Every setting is also reachable via `gsettings` / dconf under
`org.gnome.shell.extensions.scratchpad`. Bindings are stored in the `bindings`
key as a JSON-encoded array:

```bash
gsettings set org.gnome.shell.extensions.scratchpad bindings \
  '[{"wmclass":"^Slack$","keybind":"<super>i"},
    {"wmclass":"^kitty$","keybind":"<super>Return"}]'
```

Keys: `window-width`, `window-height`, `hide-keybind`, and `bindings` (each
entry is `{ wmclass?, title?, keybind }`).

## Troubleshooting

The extension logs to the system journal with a `gnome-scratchpad` prefix. View
it in the **Logs** app (select "All" and search `gnome-scratchpad`) or:

```bash
journalctl --user -f | grep gnome-scratchpad
```

- **A shortcut does nothing** — the keybind may be reserved by GNOME (see
  *Picking shortcuts*), or the `wmclass`/`title` doesn't match any open window.
  The log lists the windows it found, which helps refine your matcher.
- **Nothing works at all** — make sure the schema was compiled (`./bin/build`)
  and the extension is enabled in the Extensions app.

## Development

```bash
./bin/build   # compile the GSettings schema (required before first load)
./bin/test    # headless tests (config parsing/migration + D-Bus interface)
./bin/run     # launch a nested GNOME Shell to try changes in isolation
```
