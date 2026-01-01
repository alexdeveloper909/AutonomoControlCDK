import * as cdk from 'aws-cdk-lib';
import { CfnOutput } from 'aws-cdk-lib';
import * as codeartifact from 'aws-cdk-lib/aws-codeartifact';
import { Construct } from 'constructs';

export interface AutonomoControlCodeArtifactStackProps extends cdk.StackProps {
  domainName: string;
  repositoryName: string;
  repositoryDescription?: string;
}

export class AutonomoControlCodeArtifactStack extends cdk.Stack {
  public readonly domain: codeartifact.CfnDomain;
  public readonly repository: codeartifact.CfnRepository;

  constructor(
    scope: Construct,
    id: string,
    props: AutonomoControlCodeArtifactStackProps,
  ) {
    super(scope, id, props);

    this.domain = new codeartifact.CfnDomain(this, 'CodeArtifactDomain', {
      domainName: props.domainName,
    });
    this.domain.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    this.repository = new codeartifact.CfnRepository(
      this,
      'CodeArtifactRepository',
      {
        domainName: this.domain.ref,
        repositoryName: props.repositoryName,
        description: props.repositoryDescription,
      },
    );
    this.repository.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);

    new CfnOutput(this, 'CodeArtifactDomainName', {
      value: this.domain.attrName,
    });
    new CfnOutput(this, 'CodeArtifactRepositoryName', {
      value: this.repository.attrName,
    });
  }
}
