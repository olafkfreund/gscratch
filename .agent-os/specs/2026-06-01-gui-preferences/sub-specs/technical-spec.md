# Technical Specification

> Spec: Graphical Preferences UI with Live Window-Class Picker
> Created: 2026-06-01

## The defining constraint

`prefs.js` runs in a **separate process** from GNOME Shell (the Extensions app / a standalone
prefs process). It has GTK/Adwaita and GSettings, but **no access** to `global.display`,
`Shell.AppSystem`, or the running window list. Therefore:

- Shared state between prefs and the shell must go through **GSettings** (config) or **D-Bus**
  (live queries like "what windows are open right now").
- The window-class dropdown cannot be built in `prefs.js` alone; the shell side must publish
  the list over D-Bus and prefs must query it.

## Architecture

```
  ┌─────────────────────────┐         GSettings          ┌──────────────────────────┐
  │  GNOME Shell process     │  org.gnome.shell           │  prefs process            │
  │                          │  .extensions.scratchpad    │  (Extensions app)         │
  │  extension.js            │◄──────────────────────────►│  prefs.js (GTK4/Adwaita)  │
  │   - getSettings()        │   window-width/height,     │   - SpinRows, EntryRows   │
  │   - 'changed' → reapply  │   hide-keybind, bindings   │   - bindings list editor  │
  │   - KeyBinder / Window   │                            │                           │
  │                          │        D-Bus (session)     │                           │
  │  dbusService.js          │  ListWindowClasses() → a(ss)│  Gio.DBusProxy           │
  │   - exports interface    │◄──────────────────────────►│   - populates ComboRow    │
  └─────────────────────────┘                            └──────────────────────────┘
```

## 1. GSettings schema

New file `schemas/org.gnome.shell.extensions.scratchpad.gschema.xml`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<schemalist>
  <schema id="org.gnome.shell.extensions.scratchpad"
          path="/org/gnome/shell/extensions/scratchpad/">
    <key name="window-width" type="i">
      <default>1800</default>
      <summary>Width to resize a scratchpad window to when shown</summary>
    </key>
    <key name="window-height" type="i">
      <default>1200</default>
      <summary>Height to resize a scratchpad window to when shown</summary>
    </key>
    <key name="hide-keybind" type="s">
      <default>'&lt;super&gt;n'</default>
      <summary>Shortcut that hides all scratchpad windows</summary>
    </key>
    <key name="bindings" type="s">
      <default>'[]'</default>
      <summary>JSON-encoded array of {wmclass?, title?, keybind} objects</summary>
    </key>
  </schema>
</schemalist>
```

Notes:
- `bindings` is stored as a **JSON string in a single key** rather than a relocatable schema
  list — pragmatic given each binding is a small heterogeneous object, and it keeps `Config`'s
  parsing logic essentially unchanged.
- `metadata.json` must gain `"settings-schema": "org.gnome.shell.extensions.scratchpad"`.
- Schema must be compiled: `glib-compile-schemas schemas/` (produces `schemas/gschemas.compiled`,
  which should be gitignored and built on install).

## 2. Config refactor (`config.js`)

- Constructor takes the settings object (from `this.getSettings()` in the extension).
- `parse()` reads `window-width`, `window-height`, `hide-keybind`, and `JSON.parse(bindings)`,
  returning the same shape the rest of the code already expects
  (`{ window_width, window_height, hide_keybind, bindings }`).
- **One-time migration:** if `bindings` is still the default `'[]'` AND
  `~/.config/gnome-scratchpad/config.json` exists, import it into GSettings (map old keys →
  new keys, serialize `bindings`), then proceed. Guarded so it only runs once.
- Bad JSON in the `bindings` key is caught and treated as empty (with `logError`), so the prefs
  UI can never brick the extension.

## 3. Live window-class D-Bus service (`dbusService.js`, shell side)

- Define an interface, e.g.:

```xml
<node>
  <interface name="com.wastedintelligence.Scratchpad">
    <method name="ListWindowClasses">
      <arg type="a(ss)" direction="out" name="windows"/>  <!-- (wmclass, title) pairs -->
    </method>
  </interface>
</node>
```

- Implementation reuses the existing enumeration in `window.js`
  (`Shell.AppSystem.get_default().get_running()` → each app's windows) to collect unique
  `(get_wm_class_instance(), get_title())` pairs, filtering nulls.
- Export with `Gio.DBusExportedObject.wrapJSObject(iface, this)` on the session bus at a fixed
  object path (e.g. `/com/wastedintelligence/Scratchpad`), owning a well-known name.
- Registered in `enable()`, `unexport()` + name-unowned in `disable()`.
- Refactor: add a static `Window.listClasses()` helper so both `Window.find` logging and the
  D-Bus service share one enumeration code path (DRY).

## 4. Live reload (`extension.js`)

- `enable()`: `this.settings = this.getSettings()`, build config, apply bindings, export D-Bus.
- Connect `this.settings.connect('changed', () => this.reload())`.
- `reload()`: `keyBinder.clearBindings()` (now also disconnects cleanly per the earlier fix) →
  re-parse config → `applyBindings()`. Debounce not required; `changed` fires per key but a
  full reapply is cheap and idempotent.
- `disable()`: disconnect the `changed` handler, clear bindings, unexport D-Bus, null refs.

## 5. Preferences UI (`prefs.js`, prefs side)

- `export default class extends ExtensionPreferences { fillPreferencesWindow(window) {...} }`.
- **General group:** `Adw.SpinRow` for width/height (bound to GSettings via
  `settings.bind(...)`), `Adw.EntryRow` for `hide-keybind`.
- **Bindings group:** an `Adw.PreferencesGroup` with a header "Add" button. Each binding renders
  as an `Adw.ExpanderRow` (or row) containing:
  - `Adw.ComboRow` for **wmclass**, populated from the D-Bus `ListWindowClasses` result, plus a
    "custom…" option that reveals a free-text `Adw.EntryRow` (for regex / not-currently-open apps).
  - `Adw.EntryRow` for optional **title** regex.
  - `Adw.EntryRow` for **keybind** (`<super>i` text notation).
  - A remove button.
- The bindings array is held in memory; any add/edit/remove serializes to JSON and writes the
  `bindings` GSettings key (which triggers shell live-reload).
- **D-Bus query from prefs:** `Gio.DBusProxy.new_for_bus_sync(Gio.BusType.SESSION, ...)` against
  the interface above; call `ListWindowClasses` to fill the combo. If the proxy/name is
  unavailable (extension disabled, shell not exposing it), fall back gracefully to free-text
  entry and show no dropdown options.

## 6. Build / install changes

- README: document the prefs dialog and that schema compilation
  (`glib-compile-schemas schemas/`) is required after install/edit.
- Add `schemas/gschemas.compiled` to `.gitignore`.
- Optional `bin/build` helper that runs `glib-compile-schemas schemas/`.

## Files touched

| File | Change |
|------|--------|
| `metadata.json` | add `settings-schema` |
| `schemas/...gschema.xml` | **new** — GSettings schema |
| `config.js` | read from GSettings; one-time JSON migration; safe parse |
| `extension.js` | `getSettings`, live-reload, D-Bus export lifecycle |
| `window.js` | extract `Window.listClasses()` helper |
| `dbusService.js` | **new** — window-class D-Bus service |
| `prefs.js` | **new** — GTK4/Adwaita preferences dialog |
| `.gitignore` | add `schemas/gschemas.compiled` |
| `README.md` | document GUI + schema compile step |

## Risks & mitigations

- **Process boundary** (main risk) — addressed by the D-Bus bridge; prefs degrades to free-text
  if the service is absent.
- **GSettings list of objects** — sidestepped by storing JSON in one string key.
- **Schema not compiled on a user's machine** — document clearly; provide `bin/build`; the
  extension should `logError` a clear message if `getSettings()` throws (schema missing).
- **Backward compatibility** — one-time auto-import of `config.json` preserves existing setups.
