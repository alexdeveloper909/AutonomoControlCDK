import * as cdk from 'aws-cdk-lib';
import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';

export interface AutonomoControlSharedStackProps extends cdk.StackProps {
  artifactBucketName: string;
}

export class AutonomoControlSharedStack extends cdk.Stack {
  public readonly artifactBucket: s3.Bucket;

  constructor(
    scope: Construct,
    id: string,
    props: AutonomoControlSharedStackProps,
  ) {
    super(scope, id, props);

    this.artifactBucket = new s3.Bucket(this, 'AutonomoControlApiArtifactBucket', {
      bucketName: props.artifactBucketName,
      versioned: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    new ssm.StringParameter(this, 'AutonomoControlApiArtifactBucketNameParam', {
      parameterName: '/autonomo-control/autonomo-control-api/artifact-bucket-name',
      stringValue: this.artifactBucket.bucketName,
    });

    new CfnOutput(this, 'AutonomoControlApiArtifactBucketName', {
      value: this.artifactBucket.bucketName,
    });
    new CfnOutput(this, 'AutonomoControlApiArtifactBucketArn', {
      value: this.artifactBucket.bucketArn,
    });
  }
}
