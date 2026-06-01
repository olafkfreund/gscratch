// Headless unit test for config.js — exercised with:
//   GSETTINGS_BACKEND=memory GSETTINGS_SCHEMA_DIR=<repo>/schemas HOME=<tmp> \
//     gjs -m test/config-test.js
//
// config.js only imports gi://GLib and gi://Gio and uses the GJS globals
// log()/logError(), so it runs under plain gjs without GNOME Shell.

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';
import Config from '../config.js';

let failures = 0;
function check(name, cond) {
  print(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
  if (!cond) { failures++; }
}

// Build a Gio.Settings for our schema from the compiled schema dir, without
// installing it system-wide.
const schemaDir = GLib.getenv('GSETTINGS_SCHEMA_DIR');
const source = Gio.SettingsSchemaSource.new_from_directory(
  schemaDir, Gio.SettingsSchemaSource.get_default(), false);
const schema = source.lookup('org.gnome.shell.extensions.scratchpad', true);
if (!schema) {
  print('FAIL: schema could not be looked up from ' + schemaDir);
  imports.system.exit(1);
}

function freshSettings() {
  const s = new Gio.Settings({ settings_schema: schema });
  for (const key of ['window-width', 'window-height', 'hide-keybind', 'bindings']) {
    s.reset(key);
  }
  return s;
}

const home = GLib.get_home_dir();
const legacyPath = GLib.build_filenamev([home, '.config', 'gnome-scratchpad', 'config.json']);

function writeLegacy(contents) {
  const f = Gio.File.new_for_path(legacyPath);
  try {
    f.get_parent().make_directory_with_parents(null);
  } catch (e) {
    if (!e.matches(Gio.IOErrorEnum, Gio.IOErrorEnum.EXISTS)) { throw e; }
  }
  f.replace_contents(
    new TextEncoder().encode(contents), null, false,
    Gio.FileCreateFlags.NONE, null);
}
function removeLegacy() {
  const f = Gio.File.new_for_path(legacyPath);
  if (f.query_exists(null)) { f.delete(null); }
}

// --- Test 1: defaults, no legacy file -> schema defaults, empty bindings ---
removeLegacy();
{
  const cfg = new Config(freshSettings()).parse();
  check('default window_width is 1800', cfg.window_width === 1800);
  check('default window_height is 1200', cfg.window_height === 1200);
  check('default hide_keybind is <super>n', cfg.hide_keybind === '<super>n');
  check('default bindings empty', Array.isArray(cfg.bindings) && cfg.bindings.length === 0);
}

// --- Test 2: legacy config.json is migrated into GSettings ---
writeLegacy(JSON.stringify({
  window_width: 1000,
  window_height: 700,
  hide_keybind: '<super>z',
  bindings: [
    { wmclass: '^Slack$', keybind: '<super>i' },
    { title: '^Calendar', keybind: '<super>c' },
  ],
}));
{
  const settings = freshSettings();          // bindings still '[]' -> migration runs
  const cfg = new Config(settings).parse();
  check('migrated window_width', cfg.window_width === 1000);
  check('migrated window_height', cfg.window_height === 700);
  check('migrated hide_keybind', cfg.hide_keybind === '<super>z');
  check('migrated 2 bindings', cfg.bindings.length === 2);
  check('migrated binding wmclass', cfg.bindings[0].wmclass === '^Slack$');
  check('migration wrote GSettings bindings key',
    settings.get_string('bindings') !== '[]');
}
removeLegacy();

// --- Test 3: malformed bindings JSON is tolerated as empty ---
{
  const settings = freshSettings();
  settings.set_string('bindings', 'this is not json');
  const cfg = new Config(settings).parse();
  check('bad bindings JSON -> empty array',
    Array.isArray(cfg.bindings) && cfg.bindings.length === 0);
}

// --- Test 4: migration does NOT run when bindings already customised ---
writeLegacy(JSON.stringify({ bindings: [{ wmclass: '^X$', keybind: '<super>x' }] }));
{
  const settings = freshSettings();
  settings.set_string('bindings', JSON.stringify([{ wmclass: '^kept$', keybind: '<super>k' }]));
  const cfg = new Config(settings).parse();
  check('no re-migration when bindings non-default', cfg.bindings[0].wmclass === '^kept$');
}
removeLegacy();

print(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
imports.system.exit(failures === 0 ? 0 : 1);
