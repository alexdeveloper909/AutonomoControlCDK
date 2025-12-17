import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import { AutonomoControlCdkStack } from './autonomo_control_cdk-stack';

export interface AutonomoControlStageProps extends cdk.StageProps {
  stageName: string;
}

export class AutonomoControlStage extends cdk.Stage {
  constructor(scope: Construct, id: string, props: AutonomoControlStageProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add('Stage', props.stageName);

    new AutonomoControlCdkStack(this, `AutonomoControlCdkStack-${props.stageName}`, {
      env: props.env,
    });
  }
}
