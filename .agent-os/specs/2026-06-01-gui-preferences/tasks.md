# Spec Tasks

These are the tasks to be completed for the spec detailed in @.agent-os/specs/2026-06-01-gui-preferences/spec.md

> Created: 2026-06-01
> Status: Implemented — pending manual in-session verification

## Tasks

- [x] 1. GSettings backend + config migration
  - [x] 1.1 Create `schemas/org.gnome.shell.extensions.scratchpad.gschema.xml`
  - [x] 1.2 Add `settings-schema` to `metadata.json`; `.gitignore` already covers `schemas/*.compiled`
  - [x] 1.3 Compile schema (`./bin/build`) — compiles cleanly
  - [x] 1.4 Refactor `config.js` to read from GSettings and return the existing config shape
  - [x] 1.5 Add one-time `config.json` → GSettings migration (guarded), with safe JSON parsing
  - [x] 1.6 Verified headlessly via `./bin/test` (defaults, migration, bad-JSON, no-re-migration)

- [x] 2. Live reload in the shell
  - [x] 2.1 `extension.js` uses `this.getSettings()`; build config from it
  - [x] 2.2 Connect `settings 'changed'` → `reload()` (clear + reparse + reapply bindings)
  - [x] 2.3 Disconnect handler and null refs in `disable()`
  - [ ] 2.4 ⚠️ Verify: editing the `bindings` key re-binds without toggle (needs GNOME session)

- [x] 3. Live window-class D-Bus service
  - [x] 3.1 Extract `Window.listClasses()` helper from existing enumeration in `window.js`
  - [x] 3.2 Create `dbusService.js` exporting `ListWindowClasses() → a(ss)` on the session bus
  - [x] 3.3 Export in `enable()`, unexport + unown name in `disable()`
  - [x] 3.4 Interface XML validated headlessly via `./bin/test` (parses; `ListWindowClasses → a(ss)`,
        service/prefs declarations agree). Live `gdbus call` against the running shell → manual runbook.

- [x] 4. Preferences dialog (`prefs.js`)
  - [x] 4.1 General group (SpinRows + EntryRow bound to GSettings)
  - [x] 4.2 Bindings group: add/remove rows, each with wmclass/title/keybind
  - [x] 4.3 Serialize bindings array → `bindings` GSettings key on change
  - [x] 4.4 Populate wmclass `Adw.ComboRow` from the D-Bus service; "Custom…" free-text fallback
  - [x] 4.5 Graceful degradation when the D-Bus service is unavailable
  - [ ] 4.6 ⚠️ Verify end-to-end in `./bin/run` (needs GNOME session)

- [x] 5. Docs & build
  - [x] 5.1 Add `bin/build` running `glib-compile-schemas schemas/`
  - [x] 5.2 Update `README.md`: GUI configuration, schema-compile step, D-Bus dropdown notes
  - [x] 5.3 Update `CLAUDE.md` architecture section (GSettings, prefs.js, D-Bus, live reload)
  - [ ] 5.4 ⚠️ Final pass: enable/disable cycles leave no leaked signals/names/handlers (needs GNOME session)

## Verification status

**Automated (headless) — all passing:**
- `node --check` on all 6 JS files.
- `glib-compile-schemas schemas/` compiles cleanly.
- `./bin/test` (gjs): config.js defaults, legacy-config migration, bad-JSON tolerance,
  no-re-migration guard, schema loads; D-Bus interface XML parses and matches across
  `dbusService.js`/`prefs.js`.

**Still requires a live/nested GNOME Shell GUI (manual runbook below):**
tasks 2.4, 4.6, 5.4, and the live half of 3.4. These were deliberately NOT run against the
user's live desktop session, because enabling the extension grabs global shortcuts
(`<super>n`, etc.) and can rearrange open windows — disruptive without explicit consent.

## Manual verification runbook (`./bin/run`)

1. `./bin/build` then `./bin/run` to get a nested shell (`--nested --wayland`).
2. Inside the nested session, install + enable:
   `ln -s "$PWD" ~/.local/share/gnome-shell/extensions/scratchpad@wastedintelligence.com`
   then enable via the Extensions app or `gnome-extensions enable scratchpad@wastedintelligence.com`.
3. **Prefs (4.6):** `gnome-extensions prefs scratchpad@wastedintelligence.com` → confirm the
   General page shows size/hide-shortcut; on Bindings, click **+**, confirm the Window-class
   dropdown lists currently-open windows; add one with a shortcut.
4. **Live D-Bus (3.4):**
   `gdbus call --session --dest com.wastedintelligence.Scratchpad
   --object-path /com/wastedintelligence/Scratchpad
   --method com.wastedintelligence.Scratchpad.ListWindowClasses` → returns open windows.
5. **Live reload (2.4):** with the extension running, change a binding in prefs (or
   `gsettings set org.gnome.shell.extensions.scratchpad bindings '[...]'`) and confirm the new
   shortcut works without toggling the extension.
6. **No leaks (5.4):** disable/enable a few times; check Logs for errors and confirm the D-Bus
   name is released when disabled (`gdbus call ...` should fail while disabled).

## Compatibility note

`prefs.js` deliberately avoids `Adw.ButtonRow` (libadwaita 1.6 / GNOME 47) to keep the declared
GNOME 45+ support; "Add" is a header-suffix `Gtk.Button`.
