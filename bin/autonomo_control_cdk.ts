#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { AutonomoControlStage } from '../lib/autonomo_control_cdk-stage';
import { AutonomoControlSharedStack } from '../lib/autonomo_control_shared-stack';

function loadEnvFile(filePath: string): void {
  const absPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(absPath)) return;

  const content = fs.readFileSync(absPath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0) continue;
    if (line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice('export '.length) : line;
    const equalsIdx = normalized.indexOf('=');
    if (equalsIdx <= 0) continue;

    const key = normalized.slice(0, equalsIdx).trim();
    if (key.length === 0) continue;
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

// Optional local config (not committed). Order matters; earlier values win.
loadEnvFile('.env.local');
loadEnvFile('.env.dev.local');
loadEnvFile('.env.prod.local');

const app = new cdk.App();
const tableNamePrefix =
  app.node.tryGetContext('tableNamePrefix') ??
  process.env.TABLE_NAME_PREFIX ??
  'autonomo-control';

const defaultEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const artifactBucketName = `autonomo-control-api-artifacts-${cdk.Aws.ACCOUNT_ID}-${cdk.Aws.REGION}`;

function getContextValue(stageOrKey: string, key?: string): unknown {
  if (!key) return app.node.tryGetContext(stageOrKey);

  const maybeObj = app.node.tryGetContext(stageOrKey) as unknown;
  if (maybeObj && typeof maybeObj === 'object' && !Array.isArray(maybeObj)) {
    return (maybeObj as Record<string, unknown>)[key];
  }
  return app.node.tryGetContext(`${stageOrKey}.${key}`);
}

function getContextString(stageOrKey: string, key?: string): string | undefined {
  const value = getContextValue(stageOrKey, key);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function parseCsv(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const items = value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  return items.length > 0 ? items : undefined;
}

const devContext = getContextValue('dev') as { account?: string; region?: string } | undefined;
const prodContext = getContextValue('prod') as { account?: string; region?: string } | undefined;
const sharedContext = getContextValue('shared') as { account?: string; region?: string } | undefined;

const devEnv = {
  account: getContextString('dev', 'account') ?? devContext?.account ?? defaultEnv.account,
  region: getContextString('dev', 'region') ?? devContext?.region ?? defaultEnv.region,
};
const prodEnv = {
  account: getContextString('prod', 'account') ?? prodContext?.account ?? defaultEnv.account,
  region: getContextString('prod', 'region') ?? prodContext?.region ?? defaultEnv.region,
};

const sharedEnv = sharedContext
  ? {
      account:
        getContextString('shared', 'account') ??
        sharedContext.account ??
        defaultEnv.account,
      region:
        getContextString('shared', 'region') ??
        sharedContext.region ??
        defaultEnv.region,
    }
  : devEnv.account === prodEnv.account && devEnv.region === prodEnv.region
    ? devEnv
    : defaultEnv;

const defaultApiArtifactVersion =
  getContextString('apiArtifactVersion') ??
  process.env.API_ARTIFACT_VERSION ??
  '0.0.1';
const devApiArtifactVersion =
  getContextString('dev', 'apiArtifactVersion') ??
  getContextString('devApiArtifactVersion') ??
  process.env.API_ARTIFACT_VERSION_DEV ??
  defaultApiArtifactVersion;
const prodApiArtifactVersion =
  getContextString('prod', 'apiArtifactVersion') ??
  getContextString('prodApiArtifactVersion') ??
  process.env.API_ARTIFACT_VERSION_PROD ??
  defaultApiArtifactVersion;

const defaultGoogleClientId =
  getContextString('googleClientId') ?? process.env.GOOGLE_CLIENT_ID;
const defaultGoogleClientSecretName =
  getContextString('googleClientSecretName') ?? process.env.GOOGLE_CLIENT_SECRET_NAME;
const defaultOauthCallbackUrls = parseCsv(
  getContextString('oauthCallbackUrls') ?? process.env.OAUTH_CALLBACK_URLS,
);
const defaultOauthLogoutUrls = parseCsv(
  getContextString('oauthLogoutUrls') ?? process.env.OAUTH_LOGOUT_URLS,
);
const defaultCorsAllowOrigins = parseCsv(
  getContextString('corsAllowOrigins') ?? process.env.CORS_ALLOW_ORIGINS,
);

const devGoogleClientId =
  getContextString('dev', 'googleClientId') ??
  getContextString('devGoogleClientId') ??
  process.env.GOOGLE_CLIENT_ID_DEV ??
  defaultGoogleClientId;
const devGoogleClientSecretName =
  getContextString('dev', 'googleClientSecretName') ??
  getContextString('devGoogleClientSecretName') ??
  process.env.GOOGLE_CLIENT_SECRET_NAME_DEV ??
  defaultGoogleClientSecretName;
const devOauthCallbackUrls =
  parseCsv(getContextString('dev', 'oauthCallbackUrls')) ??
  parseCsv(getContextString('devOauthCallbackUrls')) ??
  parseCsv(process.env.OAUTH_CALLBACK_URLS_DEV) ??
  defaultOauthCallbackUrls;
const devOauthLogoutUrls =
  parseCsv(getContextString('dev', 'oauthLogoutUrls')) ??
  parseCsv(getContextString('devOauthLogoutUrls')) ??
  parseCsv(process.env.OAUTH_LOGOUT_URLS_DEV) ??
  defaultOauthLogoutUrls;
const devCorsAllowOrigins =
  parseCsv(getContextString('dev', 'corsAllowOrigins')) ??
  parseCsv(getContextString('devCorsAllowOrigins')) ??
  parseCsv(process.env.CORS_ALLOW_ORIGINS_DEV) ??
  defaultCorsAllowOrigins;
const devUserPoolDomainPrefix =
  getContextString('dev', 'userPoolDomainPrefix') ??
  getContextString('devUserPoolDomainPrefix') ??
  process.env.USER_POOL_DOMAIN_PREFIX_DEV ??
  getContextString('userPoolDomainPrefix');

const prodGoogleClientId =
  getContextString('prod', 'googleClientId') ??
  getContextString('prodGoogleClientId') ??
  process.env.GOOGLE_CLIENT_ID_PROD ??
  defaultGoogleClientId;
const prodGoogleClientSecretName =
  getContextString('prod', 'googleClientSecretName') ??
  getContextString('prodGoogleClientSecretName') ??
  process.env.GOOGLE_CLIENT_SECRET_NAME_PROD ??
  defaultGoogleClientSecretName;
const prodOauthCallbackUrls =
  parseCsv(getContextString('prod', 'oauthCallbackUrls')) ??
  parseCsv(getContextString('prodOauthCallbackUrls')) ??
  parseCsv(process.env.OAUTH_CALLBACK_URLS_PROD) ??
  defaultOauthCallbackUrls;
const prodOauthLogoutUrls =
  parseCsv(getContextString('prod', 'oauthLogoutUrls')) ??
  parseCsv(getContextString('prodOauthLogoutUrls')) ??
  parseCsv(process.env.OAUTH_LOGOUT_URLS_PROD) ??
  defaultOauthLogoutUrls;
const prodCorsAllowOrigins =
  parseCsv(getContextString('prod', 'corsAllowOrigins')) ??
  parseCsv(getContextString('prodCorsAllowOrigins')) ??
  parseCsv(process.env.CORS_ALLOW_ORIGINS_PROD) ??
  defaultCorsAllowOrigins;
const prodUserPoolDomainPrefix =
  getContextString('prod', 'userPoolDomainPrefix') ??
  getContextString('prodUserPoolDomainPrefix') ??
  process.env.USER_POOL_DOMAIN_PREFIX_PROD ??
  getContextString('userPoolDomainPrefix');

new AutonomoControlSharedStack(app, 'AutonomoControlSharedStack', {
  env: sharedEnv,
  artifactBucketName,
});

new AutonomoControlStage(app, 'Dev', {
  stageName: 'dev',
  env: devEnv,
  tableNamePrefix,
  artifactBucketName,
  apiArtifactVersion: devApiArtifactVersion,
  googleClientId: devGoogleClientId,
  googleClientSecretName: devGoogleClientSecretName,
  oauthCallbackUrls: devOauthCallbackUrls,
  oauthLogoutUrls: devOauthLogoutUrls,
  corsAllowOrigins: devCorsAllowOrigins,
  userPoolDomainPrefix: devUserPoolDomainPrefix,
});
new AutonomoControlStage(app, 'Prod', {
  stageName: 'prod',
  env: prodEnv,
  tableNamePrefix,
  artifactBucketName,
  apiArtifactVersion: prodApiArtifactVersion,
  googleClientId: prodGoogleClientId,
  googleClientSecretName: prodGoogleClientSecretName,
  oauthCallbackUrls: prodOauthCallbackUrls,
  oauthLogoutUrls: prodOauthLogoutUrls,
  corsAllowOrigins: prodCorsAllowOrigins,
  userPoolDomainPrefix: prodUserPoolDomainPrefix,
});
