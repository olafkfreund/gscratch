import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import Config from './config.js';
import KeyBinder from './keybinder.js';
import Window from './window.js';
import WindowListService from './dbusService.js';

export default class ScratchpadExtension extends Extension {
  enable() {
    log("[gnome-scratchpad] enabling extension");

    this.settings = this.getSettings();
    this.keyBinder = new KeyBinder();

    // Re-apply everything whenever any setting changes, so edits from the
    // preferences dialog take effect live (no toggle required).
    this.settingsChangedId = this.settings.connect('changed', () => this.reload());

    // Expose the running window classes over D-Bus so the (separate-process)
    // preferences dialog can offer a dropdown of open windows.
    this.windowListService = new WindowListService();
    this.windowListService.export();

    this.reload();
  }

  reload() {
    try {
      this.config = new Config(this.settings).parse();
    } catch (e) {
      logError(e, "[gnome-scratchpad] failed to load config; bindings inactive");
      this.config = { bindings: [] };
      this.keyBinder.clearBindings();
      return;
    }

    this.applyBindings();
  }

  applyBindings() {
    // clearBindings() also disconnects the accelerator handler, so re-create the
    // KeyBinder on each reload to start from a clean slate.
    this.keyBinder.clearBindings();
    this.keyBinder = new KeyBinder();

    for (const binding of this.config.bindings) {
      this.keyBinder.listenFor(binding.keybind, () => {
        this.toggleWindow(binding);
      });
    }
    this.keyBinder.listenFor(this.config.hide_keybind, () => {
      this.hideWindows();
    });
  }

  disable() {
    log("[gnome-scratchpad] disabling extension");

    if (this.settingsChangedId) {
      this.settings.disconnect(this.settingsChangedId);
      this.settingsChangedId = null;
    }
    this.windowListService?.unexport();
    this.windowListService = null;
    this.keyBinder?.clearBindings();
    this.keyBinder = null;
    this.config = null;
    this.settings = null;
  }

  toggleWindow(binding) {
    let win = Window.find(binding);

    if (win === null) { return; }

    if (win.focused()) {
      win.hide();
    } else {
      win.arrange(this.config.window_width, this.config.window_height);
      win.show();
    }
  }

  hideWindows() {
    for (const binding of this.config.bindings) {
      Window.find(binding)?.hide();
    }
  }
}
