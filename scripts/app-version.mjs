// POWDERLINE Android version check: android/app/build.gradle (source of truth) == dist/app-version.json.
//   node scripts/app-version.mjs            -> consistency check (exit 1 on mismatch)
//   node scripts/app-version.mjs --release  -> also checks that the latest GitHub Release serves POWDERLINE.apk
//
// Release order (the installed app compares its versionCode with app-version.json on GitHub Pages):
//   1. Raise versionCode (+1) and versionName in android/app/build.gradle and dist/app-version.json together.
//   2. Build the APK with the SAME signing key as the installed app (currently `npm run android:apk` = assembleDebug,
//      debug keystore of the build PC) and keep applicationId com.powderline.hokkaido.
//   3. Create a GitHub Release (tag v<versionName>) with the asset named exactly POWDERLINE.apk.
//   4. Only then push dist/app-version.json to main (Pages): apps are offered the update after the APK is downloadable.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APK_URL = 'https://github.com/ygbsss-collab/powderline-hokkaido/releases/latest/download/POWDERLINE.apk';

const gradle = readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8');
const code = Number(/^\s*versionCode\s+(\d+)\s*$/m.exec(gradle)?.[1]);
const name = /^\s*versionName\s+"([^"]+)"\s*$/m.exec(gradle)?.[1];
const appId = /^\s*applicationId\s+"([^"]+)"\s*$/m.exec(gradle)?.[1];
const json = JSON.parse(readFileSync(path.join(ROOT, 'dist/app-version.json'), 'utf8')).android || {};

const errors = [];
if (appId !== 'com.powderline.hokkaido') errors.push(`applicationId changed: ${appId}`);
if (!Number.isInteger(code) || code < 1) errors.push('build.gradle versionCode missing');
if (!name) errors.push('build.gradle versionName missing');
if (json.versionCode !== code) errors.push(`versionCode: build.gradle ${code} != app-version.json ${json.versionCode}`);
if (json.versionName !== name) errors.push(`versionName: build.gradle ${name} != app-version.json ${json.versionName}`);
if (json.apkUrl !== APK_URL) errors.push(`apkUrl must be ${APK_URL}`);

if (process.argv.includes('--release')) {
  const res = await fetch(APK_URL, {method: 'HEAD', redirect: 'manual'}).catch(e => ({status: 0, error: e.message}));
  if (res.status < 300 || res.status >= 400) errors.push(`latest release asset POWDERLINE.apk not available (HTTP ${res.status || res.error})`);
}

console.log(JSON.stringify({applicationId: appId, versionCode: code, versionName: name, ok: !errors.length, errors}, null, 2));
process.exitCode = errors.length ? 1 : 0;
