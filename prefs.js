import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const DBUS_NAME = 'com.wastedintelligence.Scratchpad';
const DBUS_PATH = '/com/wastedintelligence/Scratchpad';
const DBUS_IFACE = `
<node>
  <interface name="com.wastedintelligence.Scratchpad">
    <method name="ListWindowClasses">
      <arg type="a(ss)" direction="out" name="windows"/>
    </method>
  </interface>
</node>`;

// Sentinel shown in the wmclass dropdown for "type my own value".
const CUSTOM_LABEL = 'Custom…';

export default class ScratchpadPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    window.add(this._buildGeneralPage(settings));
    window.add(this._buildBindingsPage(settings));
  }

  _buildGeneralPage(settings) {
    const page = new Adw.PreferencesPage({
      title: 'General',
      icon_name: 'preferences-system-symbolic',
    });
    const group = new Adw.PreferencesGroup({ title: 'Window' });
    page.add(group);

    const width = new Adw.SpinRow({
      title: 'Window width',
      subtitle: 'Pixels a scratchpad window is resized to when shown',
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 100000, step_increment: 10 }),
    });
    settings.bind('window-width', width, 'value', Gio.SettingsBindFlags.DEFAULT);
    group.add(width);

    const height = new Adw.SpinRow({
      title: 'Window height',
      subtitle: 'Pixels a scratchpad window is resized to when shown',
      adjustment: new Gtk.Adjustment({ lower: 1, upper: 100000, step_increment: 10 }),
    });
    settings.bind('window-height', height, 'value', Gio.SettingsBindFlags.DEFAULT);
    group.add(height);

    const hide = new Adw.EntryRow({ title: 'Hide-all shortcut (e.g. <super>n)' });
    settings.bind('hide-keybind', hide, 'text', Gio.SettingsBindFlags.DEFAULT);
    group.add(hide);

    return page;
  }

  _buildBindingsPage(settings) {
    const page = new Adw.PreferencesPage({
      title: 'Bindings',
      icon_name: 'input-keyboard-symbolic',
    });

    const group = new Adw.PreferencesGroup({
      title: 'Scratchpad bindings',
      description: 'Each binding toggles a window matched by class (or title) with a shortcut',
    });
    page.add(group);

    // "Add" lives in the group header (Adw.ButtonRow needs libadwaita 1.6 /
    // GNOME 47, but this extension targets 45+).
    const addButton = new Gtk.Button({
      icon_name: 'list-add-symbolic',
      valign: Gtk.Align.CENTER,
      css_classes: ['flat'],
      tooltip_text: 'Add binding',
    });
    group.set_header_suffix(addButton);

    // In-memory model; serialized back to the `bindings` GSettings key on change,
    // which the shell side observes and live-reloads.
    let bindings = this._readBindings(settings);
    const openWindows = this._fetchOpenWindowClasses();

    const persist = () => {
      settings.set_string('bindings', JSON.stringify(bindings));
    };

    // Rebuild the row list from scratch whenever the model changes — simplest
    // correct approach for a small list.
    const rows = [];
    const rebuild = () => {
      for (const row of rows) { group.remove(row); }
      rows.length = 0;

      bindings.forEach((binding, index) => {
        const row = this._buildBindingRow(binding, index, openWindows, {
          onChange: persist,
          onRemove: () => {
            bindings.splice(index, 1);
            persist();
            rebuild();
          },
        });
        rows.push(row);
        group.add(row);
      });
    };

    addButton.connect('clicked', () => {
      bindings.push({ wmclass: '', keybind: '' });
      persist();
      rebuild();
    });

    rebuild();
    return page;
  }

  _buildBindingRow(binding, index, openWindows, { onChange, onRemove }) {
    const row = new Adw.ExpanderRow({
      title: binding.wmclass || binding.title || `Binding ${index + 1}`,
      subtitle: binding.keybind || '(no shortcut)',
    });

    // --- wmclass: dropdown of open windows + Custom… fallback ---
    const choices = openWindows.map(w => w.wmclass);
    const model = new Gtk.StringList();
    choices.forEach(c => model.append(c));
    model.append(CUSTOM_LABEL);

    const combo = new Adw.ComboRow({ title: 'Window class', model });

    const customEntry = new Adw.EntryRow({
      title: 'Custom window class (regex)',
      text: binding.wmclass ?? '',
    });

    const existingIndex = choices.indexOf(binding.wmclass);
    const useCustom = binding.wmclass && existingIndex === -1;
    combo.selected = useCustom ? choices.length : Math.max(existingIndex, 0);
    customEntry.visible = useCustom || choices.length === 0;

    combo.connect('notify::selected', () => {
      const isCustom = combo.selected === choices.length;
      customEntry.visible = isCustom;
      if (!isCustom) {
        binding.wmclass = choices[combo.selected] ?? '';
        row.title = binding.wmclass || `Binding ${index + 1}`;
        onChange();
      }
    });
    customEntry.connect('notify::text', () => {
      binding.wmclass = customEntry.text;
      row.title = binding.wmclass || `Binding ${index + 1}`;
      onChange();
    });

    row.add_row(combo);
    row.add_row(customEntry);

    // --- optional title regex ---
    const titleEntry = new Adw.EntryRow({ title: 'Title regex (optional)', text: binding.title ?? '' });
    titleEntry.connect('notify::text', () => {
      binding.title = titleEntry.text || undefined;
      onChange();
    });
    row.add_row(titleEntry);

    // --- keybind ---
    const keyEntry = new Adw.EntryRow({ title: 'Shortcut (e.g. <super>i)', text: binding.keybind ?? '' });
    keyEntry.connect('notify::text', () => {
      binding.keybind = keyEntry.text;
      row.subtitle = binding.keybind || '(no shortcut)';
      onChange();
    });
    row.add_row(keyEntry);

    // --- remove ---
    const removeBtn = new Gtk.Button({
      icon_name: 'user-trash-symbolic',
      valign: Gtk.Align.CENTER,
      css_classes: ['flat'],
    });
    removeBtn.connect('clicked', onRemove);
    row.add_suffix(removeBtn);

    return row;
  }

  _readBindings(settings) {
    try {
      const parsed = JSON.parse(settings.get_string('bindings'));
      return Array.isArray(parsed) ? parsed : [];
    } catch (_e) {
      return [];
    }
  }

  // Query the shell-side D-Bus service for currently-open window classes. The
  // dialog runs in its own process and cannot see windows directly; if the
  // service is unavailable (extension disabled), degrade to Custom… free text.
  _fetchOpenWindowClasses() {
    try {
      const proxy = Gio.DBusProxy.new_for_bus_sync(
        Gio.BusType.SESSION,
        Gio.DBusProxyFlags.NONE,
        Gio.DBusNodeInfo.new_for_xml(DBUS_IFACE).interfaces[0],
        DBUS_NAME, DBUS_PATH, DBUS_NAME,
        null
      );
      const reply = proxy.call_sync('ListWindowClasses', null, Gio.DBusCallFlags.NONE, 1000, null);
      const [pairs] = reply.deepUnpack();
      return pairs.map(([wmclass, title]) => ({ wmclass, title }));
    } catch (e) {
      logError(e, '[gnome-scratchpad] could not fetch open window classes over D-Bus');
      return [];
    }
  }
}
