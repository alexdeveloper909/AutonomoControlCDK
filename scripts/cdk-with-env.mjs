#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function loadEnvFile(filePath, loadedKeys) {
  const absPath = resolve(process.cwd(), filePath);
  if (!existsSync(absPath)) return;

  const content = readFileSync(absPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice('export '.length) : line;
    const equalsIdx = normalized.indexOf('=');
    if (equalsIdx <= 0) continue;

    const key = normalized.slice(0, equalsIdx).trim();
    if (key.length === 0) continue;
    loadedKeys.add(key);
    if (process.env[key] !== undefined) continue; // do not override real env

    let value = normalized.slice(equalsIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function upperStage(stage) {
  const normalized = String(stage || '').trim().toLowerCase();
  if (normalized === 'dev') return 'DEV';
  if (normalized === 'prod') return 'PROD';
  return undefined;
}

function getEnvValue(stageUpper, loadedKeys, baseKey) {
  const stageKey = stageUpper ? `${baseKey}_${stageUpper}` : undefined;
  if (stageKey && (process.env[stageKey] !== undefined || loadedKeys.has(stageKey))) {
    return { value: process.env[stageKey] ?? '', present: true };
  }
  if (process.env[baseKey] !== undefined || loadedKeys.has(baseKey)) {
    return { value: process.env[baseKey] ?? '', present: true };
  }
  return { value: undefined, present: false };
}

function buildParameters(stageUpper, loadedKeys) {
  const out = [];

  const googleClientId = getEnvValue(stageUpper, loadedKeys, 'GOOGLE_CLIENT_ID');
  if (googleClientId.present) out.push(['GoogleClientId', googleClientId.value]);

  const googleClientSecretName = getEnvValue(
    stageUpper,
    loadedKeys,
    'GOOGLE_CLIENT_SECRET_NAME',
  );
  if (googleClientSecretName.present)
    out.push(['GoogleClientSecretName', googleClientSecretName.value]);

  const oauthCallbackUrls = getEnvValue(stageUpper, loadedKeys, 'OAUTH_CALLBACK_URLS');
  if (oauthCallbackUrls.present) out.push(['OAuthCallbackUrls', oauthCallbackUrls.value]);

  const oauthLogoutUrls = getEnvValue(stageUpper, loadedKeys, 'OAUTH_LOGOUT_URLS');
  if (oauthLogoutUrls.present) out.push(['OAuthLogoutUrls', oauthLogoutUrls.value]);

  const corsAllowOrigins = getEnvValue(stageUpper, loadedKeys, 'CORS_ALLOW_ORIGINS');
  if (corsAllowOrigins.present) out.push(['CorsAllowOrigins', corsAllowOrigins.value]);

  return out;
}

function usage() {
  console.error(
    [
      'Usage:',
      '  node scripts/cdk-with-env.mjs <dev|prod> <cdk args...>',
      '',
      'Examples:',
      '  npm run cdk:dev -- deploy "Dev/*" --profile tokarevalex',
      '  npm run cdk:prod -- diff "Prod/*" --profile tokarevalex',
    ].join('\n'),
  );
}

const [stage, ...cdkArgs] = process.argv.slice(2);
const stageUpper = upperStage(stage);
if (!stageUpper || cdkArgs.length === 0) {
  usage();
  process.exit(2);
}

const loadedKeys = new Set();
loadEnvFile('.env.local', loadedKeys);
// Preferred names (not committed):
// - .env.dev.local
// - .env.prod.local
loadEnvFile(`.env.${stage.toLowerCase()}.local`, loadedKeys);
// Alternate convention some tools use:
// - .env.dev
// - .env.prod
loadEnvFile(`.env.${stage.toLowerCase()}`, loadedKeys);

const existingParameterNames = new Set();
for (let i = 0; i < cdkArgs.length; i += 1) {
  if (cdkArgs[i] !== '--parameters') continue;
  const spec = cdkArgs[i + 1];
  if (typeof spec !== 'string') continue;
  const eqIdx = spec.indexOf('=');
  if (eqIdx <= 0) continue;
  existingParameterNames.add(spec.slice(0, eqIdx));
  i += 1;
}

const extraArgs = [];
if (cdkArgs[0] === 'deploy') {
  for (const [name, value] of buildParameters(stageUpper, loadedKeys)) {
    if (existingParameterNames.has(name)) continue;
    extraArgs.push('--parameters', `${name}=${value}`);
  }
}

const result = spawnSync('npx', ['cdk', ...cdkArgs, ...extraArgs], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
