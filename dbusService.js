import Gio from 'gi://Gio';
import Window from './window.js';

const IFACE = `
<node>
  <interface name="com.wastedintelligence.Scratchpad">
    <method name="ListWindowClasses">
      <arg type="a(ss)" direction="out" name="windows"/>
    </method>
  </interface>
</node>`;

const OBJECT_PATH = '/com/wastedintelligence/Scratchpad';
const WELL_KNOWN_NAME = 'com.wastedintelligence.Scratchpad';

// Runs in the GNOME Shell process (where the window list is available) and
// exposes the running window classes on the session bus, so the preferences
// dialog — a separate process with no access to Shell.AppSystem — can offer a
// dropdown of currently-open windows.
export default class WindowListService {
  constructor() {
    this.impl = null;
    this.nameOwnerId = 0;
  }

  export() {
    this.impl = Gio.DBusExportedObject.wrapJSObject(IFACE, this);
    this.impl.export(Gio.DBus.session, OBJECT_PATH);
    this.nameOwnerId = Gio.bus_own_name(
      Gio.BusType.SESSION,
      WELL_KNOWN_NAME,
      Gio.BusNameOwnerFlags.NONE,
      null, null, null
    );
  }

  unexport() {
    if (this.nameOwnerId) {
      Gio.bus_unown_name(this.nameOwnerId);
      this.nameOwnerId = 0;
    }
    if (this.impl) {
      this.impl.unexport();
      this.impl = null;
    }
  }

  // D-Bus method ListWindowClasses() → a(ss): [wmclass, representative title]
  // pairs, deduplicated by class so the dropdown lists each app once.
  ListWindowClasses() {
    const seen = new Set();
    const result = [];
    for (const { wmclass, title } of Window.listClasses()) {
      if (seen.has(wmclass)) { continue; }
      seen.add(wmclass);
      result.push([wmclass, title]);
    }
    return result;
  }
}
