#!/usr/bin/env node
import { readFile, rename } from 'node:fs/promises';
import path from 'node:path';

const projectsRoot = process.env.LMWARES_DEMO_PROJECTS_ROOT ?? 'C:\\dev\\lmwares-demos';
const activeRunPath = process.env.LMWARES_DEMO_ACTIVE_RUN_PATH ?? path.join(projectsRoot, 'control', 'active-run.json');
const active = JSON.parse(await readFile(activeRunPath, 'utf8'));
if (!String(active?.runId || '').startsWith('test_') || (!active?.fixture && active?.mode !== 'initialization_only')) throw new Error('El archivo activo no es un fixture de prueba; no se retira.');
const archived = `${activeRunPath}.fixture-${Date.now()}.json`;
await rename(activeRunPath, archived);
console.log(JSON.stringify({ status: 'fixture_archived', archived }, null, 2));
