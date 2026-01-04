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
    };

    new AutonomoControlCdkStack(
      this,
      `AutonomoControlCdkStack-${props.stageName}`,
      stackProps,
    );
  }
}
