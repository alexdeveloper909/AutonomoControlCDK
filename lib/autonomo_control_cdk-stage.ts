import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  AutonomoControlCdkStack,
  AutonomoControlCdkStackProps,
} from './autonomo_control_cdk-stack';

export interface AutonomoControlStageProps extends cdk.StageProps {
  stageName: string;
  tableNamePrefix: string;
  artifactBucketName: string;
  apiArtifactVersion: string;
  googleClientId?: string;
  googleClientSecretName?: string;
  oauthCallbackUrls?: string[];
  oauthLogoutUrls?: string[];
  corsAllowOrigins?: string[];
  userPoolDomainPrefix?: string;
}

export class AutonomoControlStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: AutonomoControlStageProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('Stage', props.stageName);

    const stackProps: AutonomoControlCdkStackProps = {
      env: props.env,
      stageName: props.stageName,
      tableNamePrefix: props.tableNamePrefix,
      artifactBucketName: props.artifactBucketName,
      apiArtifactVersion: props.apiArtifactVersion,
      googleClientId: props.googleClientId,
      googleClientSecretName: props.googleClientSecretName,
      oauthCallbackUrls: props.oauthCallbackUrls,
      oauthLogoutUrls: props.oauthLogoutUrls,
      corsAllowOrigins: props.corsAllowOrigins,
      userPoolDomainPrefix: props.userPoolDomainPrefix,
    };

    new AutonomoControlCdkStack(
      this,
      `AutonomoControlCdkStack-${props.stageName}`,
      stackProps,
    );
  }
}
