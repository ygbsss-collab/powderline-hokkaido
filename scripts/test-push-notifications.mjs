// FCM preparation checks without printing google-services.json or a registration token.
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(ROOT, 'dist/push-notifications.js'), 'utf8');
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const google = JSON.parse(readFileSync(path.join(ROOT, 'android/app/google-services.json'), 'utf8'));
const appGradle = readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8');
const rootGradle = readFileSync(path.join(ROOT, 'android/build.gradle'), 'utf8');
const capacitorGradle = readFileSync(path.join(ROOT, 'android/app/capacitor.build.gradle'), 'utf8');
const capacitorSettings = readFileSync(path.join(ROOT, 'android/capacitor.settings.gradle'), 'utf8');
const gitignore = readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
const results = [];
const check = (name, pass, detail = {}) => results.push({name, pass: Boolean(pass), ...detail});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function sandbox(initialPermission) {
  const listeners = {};
  const events = [];
  const calls = {check: 0, request: 0, register: 0};
  let permission = initialPermission;
  class CustomEvent { constructor(type, init) { this.type = type; this.detail = init?.detail; } }
  const PushNotifications = {
    async addListener(name, handler) { listeners[name] = handler; return {remove() { delete listeners[name]; }}; },
    async checkPermissions() { calls.check++; return {receive: permission}; },
    async requestPermissions() { calls.request++; permission = 'granted'; return {receive: permission}; },
    async register() { calls.register++; }
  };
  const ctx = {CustomEvent, Promise, setTimeout, clearTimeout, console: {log() {}, info() {}, warn() {}, error() {}},
    dispatchEvent(event) { events.push(event); },
    Capacitor: {Plugins: {PushNotifications}, getPlatform: () => 'android', isNativePlatform: () => true}};
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return {ctx, listeners, events, calls};
}

const firebasePackages = google.client.map(client => client?.client_info?.android_client_info?.package_name).filter(Boolean);
const applicationId = /applicationId\s+["']([^"']+)/.exec(appGradle)?.[1];
check('google_services_package_matches_application_id', firebasePackages.includes(applicationId));
check('capacitor_push_version_pinned', pkg.dependencies?.['@capacitor/push-notifications'] === '8.1.3');
check('google_services_gradle_groovy_once', (rootGradle.match(/com\.google\.gms:google-services/g) || []).length === 1
  && (appGradle.match(/apply plugin: ['"]com\.google\.gms\.google-services['"]/g) || []).length === 1);
// The native SOS messaging service compiles against FirebaseMessaging, so the app may declare it once, but only with
// the exact version expression @capacitor/push-notifications uses (one resolved version: verified 25.0.1).
const appFirebase = appGradle.match(/com\.google\.firebase:firebase-messaging[^\n]*/g) || [];
check('firebase_messaging_not_duplicated_in_app', !/com\.google\.firebase:firebase-messaging/.test(rootGradle) && appFirebase.length <= 1
  && appFirebase.every(line => line.includes("rootProject.ext.has('firebaseMessagingVersion') ? rootProject.ext.firebaseMessagingVersion : '25.0.1'")));
check('capacitor_plugin_synced', capacitorGradle.includes("project(':capacitor-push-notifications')")
  && capacitorSettings.includes("include ':capacitor-push-notifications'"));
check('google_services_ignored', /^android\/app\/google-services\.json$/m.test(gitignore));

const prompt = sandbox('prompt');
await tick(); await tick();
check('startup_does_not_force_permission_prompt', prompt.calls.check === 1 && prompt.calls.request === 0 && prompt.calls.register === 0);
check('permission_required_state_emitted', prompt.ctx.PowderlinePushNotifications.getState().status === 'permission_required'
  && prompt.events.some(event => event.type === 'powderline:push-permission-required'));
await prompt.ctx.PowderlinePushNotifications.requestPermissionAndRegister();
check('explicit_android_13_permission_and_register', prompt.calls.request === 1 && prompt.calls.register === 1
  && prompt.ctx.PowderlinePushNotifications.getState().permission === 'granted');
prompt.listeners.registration({value: 'test-token-not-written-to-output'});
check('registration_token_listener', prompt.ctx.PowderlinePushNotifications.getState().status === 'registered'
  && prompt.events.some(event => event.type === 'powderline:fcm-token'));
prompt.listeners.pushNotificationReceived({id: 'message-1'});
prompt.listeners.pushNotificationActionPerformed({actionId: 'tap', notification: {id: 'message-1'}});
check('receive_and_action_listeners', prompt.events.some(event => event.type === 'powderline:push-received')
  && prompt.events.some(event => event.type === 'powderline:push-action'));

const granted = sandbox('granted');
await tick(); await tick();
check('already_granted_registers_automatically', granted.calls.request === 0 && granted.calls.register === 1);
check('no_supabase_upload_in_client', !/supabase|fetch\s*\(/i.test(source));

const summary = {passed: results.filter(result => result.pass).length, failed: results.filter(result => !result.pass).length};
const output = {ranAt: new Date().toISOString(), scope: 'static Gradle/config checks and mocked Capacitor PushNotifications lifecycle', summary, results};
mkdirSync(path.join(ROOT, 'work/android'), {recursive: true});
writeFileSync(path.join(ROOT, 'work/android/fcm-preparation-tests.json'), JSON.stringify(output, null, 2) + '\n');
for (const result of results) if (!result.pass) console.log('FAIL', JSON.stringify(result));
console.log(summary);
process.exitCode = summary.failed ? 1 : 0;
