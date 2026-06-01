import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export default class Config {
  // `settings` is the Gio.Settings object from Extension.getSettings().
  constructor(settings) {
    this.settings = settings;
  }

  // Returns the shape the rest of the extension expects:
  // { window_width, window_height, hide_keybind, bindings }
  parse() {
    this.migrateLegacyConfigIfNeeded();

    return {
      window_width: this.settings.get_int('window-width'),
      window_height: this.settings.get_int('window-height'),
      hide_keybind: this.settings.get_string('hide-keybind'),
      bindings: this.parseBindings()
    };
  }

  // The bindings key stores a JSON-encoded array. Bad JSON must never brick the
  // extension, so fall back to an empty list.
  parseBindings() {
    const raw = this.settings.get_string('bindings');
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      logError(e, '[gnome-scratchpad] invalid bindings JSON; treating as empty');
      return [];
    }
  }

  // One-time import of the pre-GUI ~/.config/gnome-scratchpad/config.json file
  // into GSettings, so existing users keep their configuration after upgrading.
  // Runs only while bindings are still at the default empty value.
  migrateLegacyConfigIfNeeded() {
    if (this.settings.get_string('bindings') !== '[]') {
      return;
    }

    const filepath = GLib.build_filenamev([
      GLib.get_home_dir(), '.config', 'gnome-scratchpad', 'config.json'
    ]);
    const file = Gio.File.new_for_path(filepath);
    if (!file.query_exists(null)) {
      return;
    }

    try {
      const [ok, data] = file.load_contents(null);
      if (!ok) { return; }
      const legacy = JSON.parse(new TextDecoder('utf-8').decode(data));

      if (typeof legacy.window_width === 'number') {
        this.settings.set_int('window-width', legacy.window_width);
      }
      if (typeof legacy.window_height === 'number') {
        this.settings.set_int('window-height', legacy.window_height);
      }
      if (typeof legacy.hide_keybind === 'string') {
        this.settings.set_string('hide-keybind', legacy.hide_keybind);
      }
      if (Array.isArray(legacy.bindings)) {
        this.settings.set_string('bindings', JSON.stringify(legacy.bindings));
      }

      log('[gnome-scratchpad] migrated legacy config.json into GSettings');
    } catch (e) {
      logError(e, '[gnome-scratchpad] failed to migrate legacy config.json');
    }
  }
}
