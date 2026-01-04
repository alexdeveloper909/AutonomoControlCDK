#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AutonomoControlStage } from '../lib/autonomo_control_cdk-stage';

const app = new cdk.App();
const tableNamePrefix =
  app.node.tryGetContext('tableNamePrefix') ??
  process.env.TABLE_NAME_PREFIX ??
  'autonomo-control';

const defaultEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION,
};

const devContext = app.node.tryGetContext('dev') as
  | { account?: string; region?: string }
  | undefined;
const prodContext = app.node.tryGetContext('prod') as
  | { account?: string; region?: string }
  | undefined;

const devEnv = {
  account: devContext?.account ?? defaultEnv.account,
  region: devContext?.region ?? defaultEnv.region,
};
const prodEnv = {
  account: prodContext?.account ?? defaultEnv.account,
  region: prodContext?.region ?? defaultEnv.region,
};

new AutonomoControlStage(app, 'Dev', {
  stageName: 'dev',
  env: devEnv,
  tableNamePrefix,
});
new AutonomoControlStage(app, 'Prod', {
  stageName: 'prod',
  env: prodEnv,
  tableNamePrefix,
});
