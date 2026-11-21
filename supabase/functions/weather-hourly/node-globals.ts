// Node globals used by the shared pipeline scripts (Buffer at call time, process at import time). Imported first by
// index.ts so they exist before the script modules evaluate, whatever Deno version the Edge runtime runs.
// @ts-nocheck
import {Buffer} from 'node:buffer';
import process from 'node:process';
globalThis.Buffer ??= Buffer;
globalThis.process ??= process;
