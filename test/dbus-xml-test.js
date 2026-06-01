// Validates the D-Bus interface XML literally embedded in dbusService.js and
// prefs.js: both must parse, expose ListWindowClasses() -> a(ss), and agree.
//   gjs -m test/dbus-xml-test.js

import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

let failures = 0;
function check(name, cond) {
  print(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
  if (!cond) { failures++; }
}

function readText(path) {
  const [, bytes] = GLib.file_get_contents(path);
  return new TextDecoder('utf-8').decode(bytes);
}

function extractNode(src) {
  const m = src.match(/<node>[\s\S]*?<\/node>/);
  return m ? m[0] : null;
}

function ifaceFrom(path) {
  const xml = extractNode(readText(path));
  check(`${path}: contains a <node> block`, xml !== null);
  const info = Gio.DBusNodeInfo.new_for_xml(xml); // throws on invalid XML
  return info.interfaces[0];
}

const svc = ifaceFrom('dbusService.js');
const pref = ifaceFrom('prefs.js');

check('service iface name', svc.name === 'com.wastedintelligence.Scratchpad');
check('prefs iface name matches service', pref.name === svc.name);

const svcMethod = svc.methods.find(m => m.name === 'ListWindowClasses');
check('service exposes ListWindowClasses', !!svcMethod);
check('ListWindowClasses returns a(ss)',
  svcMethod && svcMethod.out_args.length === 1 && svcMethod.out_args[0].signature === 'a(ss)');

const prefMethod = pref.methods.find(m => m.name === 'ListWindowClasses');
check('prefs declares matching ListWindowClasses',
  prefMethod && prefMethod.out_args[0].signature === 'a(ss)');

print(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TEST(S) FAILED`);
imports.system.exit(failures === 0 ? 0 : 1);
