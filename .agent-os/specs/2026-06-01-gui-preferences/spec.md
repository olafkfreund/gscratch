# Spec Requirements Document

> Spec: Graphical Preferences UI with Live Window-Class Picker
> Created: 2026-06-01
> Status: Planning

## Overview

Add a graphical preferences dialog (`prefs.js`) to the Scratchpad extension so users can
configure window/scratchpad bindings without hand-editing JSON. Migrate configuration storage
from the standalone `~/.config/gnome-scratchpad/config.json` file to GSettings, enable
live-reload on change, and provide a dropdown of currently-open window classes (sourced from
the shell process over D-Bus) when adding a binding.

## User Stories

### Configure without editing JSON
As a Scratchpad user, I want to add, edit, and remove scratchpad bindings from the GNOME
Extensions preferences dialog, so that I never have to hand-edit a JSON file or know the
`<Modifiers>+keycode` syntax from memory.

### Pick from open windows
As a user setting up a binding, I want to choose the target from a dropdown of the windows I
currently have open (by class), so that I don't have to hunt for the `wmclass` via Looking Glass.

### Changes apply immediately
As a user tweaking my config, I want changes to take effect without disabling/re-enabling the
extension, so that iterating on shortcuts is fast.

## Spec Scope

1. **GSettings migration** - Replace file-based config with a GSettings schema; auto-import the
   existing `config.json` once if present.
2. **Preferences dialog (`prefs.js`)** - GTK4/Adwaita UI for window size, hide-keybind, and a
   dynamic list of bindings (wmclass/title/keybind, add/remove).
3. **Live window-class D-Bus service** - Shell-side D-Bus object exposing the classes/titles of
   running windows, consumed by `prefs.js` to populate a dropdown.
4. **Live reload** - Extension re-applies bindings when settings change, removing the
   "toggle to reload" requirement.

## Out of Scope

- A graphical keybind *capture* widget (press-the-keys-to-record). Keybind stays a text entry
  in `<super>i` notation for this spec; capture widget is a follow-up.
- Per-binding window size overrides (size remains global).
- Firefox/non-Chromium website-app helpers (documentation only, unchanged).
- Validation of keybind availability against GNOME's reserved shortcuts.

## Expected Deliverable

1. Opening the extension's preferences (Extensions app or `gnome-extensions prefs
   scratchpad@wastedintelligence.com`) shows an editable UI; saved changes drive scratchpad
   behavior live.
2. Adding a binding offers a dropdown listing the classes of windows currently open.
3. An existing `config.json` is imported automatically on first run after upgrade; users with
   no prior config get sane defaults.
