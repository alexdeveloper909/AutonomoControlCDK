import * as cdk from 'aws-cdk-lib';
import { CfnOutput, Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigwv2Authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as apigwv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface AutonomoControlCdkStackProps extends cdk.StackProps {
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

export class AutonomoControlCdkStack extends cdk.Stack {
  public readonly usersTable: dynamodb.Table;
  public readonly workspacesTable: dynamodb.Table;
  public readonly workspaceMembersTable: dynamodb.Table;
  public readonly workspaceRecordsTable: dynamodb.Table;
  public readonly workspaceSettingsTable: dynamodb.Table;
  public readonly artifactBucket: s3.IBucket;

  constructor(scope: Construct, id: string, props: AutonomoControlCdkStackProps) {
    super(scope, id, props);

    const isProd = props.stageName === 'prod';
    const removalPolicy = isProd ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY;
    const name = (suffix: string) =>
      `${props.tableNamePrefix}-${props.stageName}-${suffix}`;

    this.usersTable = new dynamodb.Table(this, 'UsersTable', {
      tableName: name('users'),
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });
    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'by_email',
      partitionKey: { name: 'email', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    this.usersTable.addGlobalSecondaryIndex({
      indexName: 'by_google_sub',
      partitionKey: { name: 'google_sub', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.workspacesTable = new dynamodb.Table(this, 'WorkspacesTable', {
      tableName: name('workspaces'),
      partitionKey: { name: 'workspace_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });
    this.workspacesTable.addGlobalSecondaryIndex({
      indexName: 'by_owner_user_id',
      partitionKey: { name: 'owner_user_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'workspace_id', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.workspaceMembersTable = new dynamodb.Table(this, 'WorkspaceMembersTable', {
      tableName: name('workspace_members'),
      partitionKey: { name: 'workspace_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'member_key', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });
    this.workspaceMembersTable.addGlobalSecondaryIndex({
      indexName: 'by_user_id',
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'workspace_id', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    this.workspaceMembersTable.addGlobalSecondaryIndex({
      indexName: 'by_email',
      partitionKey: { name: 'email_lower', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'workspace_id', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.workspaceRecordsTable = new dynamodb.Table(this, 'WorkspaceRecordsTable', {
      tableName: name('workspace_records'),
      partitionKey: { name: 'workspace_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'record_key', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });
    this.workspaceRecordsTable.addGlobalSecondaryIndex({
      indexName: 'by_month',
      partitionKey: { name: 'workspace_month', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'record_key', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });
    this.workspaceRecordsTable.addGlobalSecondaryIndex({
      indexName: 'by_quarter',
      partitionKey: { name: 'workspace_quarter', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'record_key', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    this.workspaceSettingsTable = new dynamodb.Table(this, 'WorkspaceSettingsTable', {
      tableName: name('workspace_settings'),
      partitionKey: { name: 'workspace_id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: isProd },
      removalPolicy,
    });

    this.artifactBucket = s3.Bucket.fromBucketName(
      this,
      'AutonomoControlApiArtifactBucket',
      props.artifactBucketName,
    );

    const googleClientIdParam = new cdk.CfnParameter(this, 'GoogleClientId', {
      type: 'String',
      description: 'Google OAuth client id (for Cognito Google IdP).',
      default: props.googleClientId ?? '',
    });
    const googleClientSecretNameParam = new cdk.CfnParameter(
      this,
      'GoogleClientSecretName',
      {
        type: 'String',
        description:
          'AWS Secrets Manager secret name containing the Google OAuth client secret as a plaintext SecretString.',
        default: props.googleClientSecretName ?? '',
      },
    );
    const oauthCallbackUrlsParam = new cdk.CfnParameter(this, 'OAuthCallbackUrls', {
      type: 'CommaDelimitedList',
      description:
        'Allowed OAuth callback URLs for the Cognito App Client (comma separated).',
      default:
        props.oauthCallbackUrls?.join(',') ?? 'http://localhost:3000/auth/callback',
    });
    const oauthLogoutUrlsParam = new cdk.CfnParameter(this, 'OAuthLogoutUrls', {
      type: 'CommaDelimitedList',
      description: 'Allowed logout URLs for the Cognito App Client (comma separated).',
      default: props.oauthLogoutUrls?.join(',') ?? 'http://localhost:3000/',
    });
    const corsAllowOriginsParam = new cdk.CfnParameter(this, 'CorsAllowOrigins', {
      type: 'CommaDelimitedList',
      description: 'CORS allow origins for the HTTP API (comma separated).',
      default: props.corsAllowOrigins?.join(',') ?? 'http://localhost:3000',
    });

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `autonomo-control-${props.stageName}`,
      signInAliases: { email: true },
      selfSignUpEnabled: false,
      removalPolicy,
    });

    const userPoolDomainPrefix =
      props.userPoolDomainPrefix ??
      `autonomo-control-${props.stageName}-${cdk.Aws.ACCOUNT_ID}`;
    const userPoolDomain = userPool.addDomain('UserPoolDomain', {
      cognitoDomain: { domainPrefix: userPoolDomainPrefix },
    });

    const enableGoogleIdpCondition = new cdk.CfnCondition(this, 'EnableGoogleIdp', {
      expression: cdk.Fn.conditionAnd(
        cdk.Fn.conditionNot(
          cdk.Fn.conditionEquals(googleClientIdParam.valueAsString, ''),
        ),
        cdk.Fn.conditionNot(
          cdk.Fn.conditionEquals(googleClientSecretNameParam.valueAsString, ''),
        ),
      ),
    });
    const disableGoogleIdpCondition = new cdk.CfnCondition(this, 'DisableGoogleIdp', {
      expression: cdk.Fn.conditionNot(enableGoogleIdpCondition),
    });

    const userPoolClientCognitoOnly = userPool.addClient('UserPoolClientCognitoOnly', {
      userPoolClientName: `autonomo-control-${props.stageName}-web`,
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: oauthCallbackUrlsParam.valueAsList,
        logoutUrls: oauthLogoutUrlsParam.valueAsList,
      },
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
    });
    const cfnUserPoolClientCognitoOnly =
      userPoolClientCognitoOnly.node.defaultChild as cognito.CfnUserPoolClient;
    cfnUserPoolClientCognitoOnly.cfnOptions.condition = disableGoogleIdpCondition;

    const userPoolClientWithGoogle = userPool.addClient('UserPoolClientWithGoogle', {
      userPoolClientName: `autonomo-control-${props.stageName}-web`,
      generateSecret: false,
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.PROFILE,
        ],
        callbackUrls: oauthCallbackUrlsParam.valueAsList,
        logoutUrls: oauthLogoutUrlsParam.valueAsList,
      },
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
    });
    const cfnUserPoolClientWithGoogle =
      userPoolClientWithGoogle.node.defaultChild as cognito.CfnUserPoolClient;
    cfnUserPoolClientWithGoogle.cfnOptions.condition = enableGoogleIdpCondition;

    const googleClientSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'GoogleClientSecret',
      googleClientSecretNameParam.valueAsString,
    );

    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(
      this,
      'GoogleProvider',
      {
        userPool,
        clientId: googleClientIdParam.valueAsString,
        clientSecretValue: googleClientSecret.secretValue,
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
        },
      },
    );

    const cfnGoogleProvider = googleProvider.node.defaultChild as cognito.CfnUserPoolIdentityProvider;
    cfnGoogleProvider.cfnOptions.condition = enableGoogleIdpCondition;
    userPoolClientWithGoogle.node.addDependency(googleProvider);

    const apiLambda = new lambda.Function(this, 'AutonomoControlApiLambda', {
      functionName: `autonomo-control-api-${props.stageName}`,
      runtime: lambda.Runtime.JAVA_17,
      handler: 'autonomo.handler.RecordsLambda',
      code: lambda.Code.fromBucket(
        this.artifactBucket,
        `autonomo-control-api/${props.apiArtifactVersion}/app.zip`,
      ),
      memorySize: 1024,
      timeout: Duration.seconds(30),
      environment: {
        ENV: props.stageName,
        DDB_TABLE_PREFIX: `${props.tableNamePrefix}-${props.stageName}`,
      },
    });

    this.usersTable.grantReadWriteData(apiLambda);
    this.workspacesTable.grantReadWriteData(apiLambda);
    this.workspaceMembersTable.grantReadWriteData(apiLambda);
    this.workspaceRecordsTable.grantReadWriteData(apiLambda);
    this.workspaceSettingsTable.grantReadWriteData(apiLambda);

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `autonomo-control-${props.stageName}`,
      corsPreflight: {
        allowCredentials: true,
        allowHeaders: ['Authorization', 'Content-Type'],
        allowMethods: [apigwv2.CorsHttpMethod.ANY],
        allowOrigins: corsAllowOriginsParam.valueAsList,
      },
    });

    const jwtIssuer = `https://cognito-idp.${cdk.Aws.REGION}.amazonaws.com/${userPool.userPoolId}`;
    const jwtAudience = cdk.Fn.conditionIf(
      enableGoogleIdpCondition.logicalId,
      userPoolClientWithGoogle.userPoolClientId,
      userPoolClientCognitoOnly.userPoolClientId,
    ) as unknown as string;
    const jwtAuthorizer = new apigwv2Authorizers.HttpJwtAuthorizer(
      'CognitoJwtAuthorizer',
      jwtIssuer,
      { jwtAudience: [jwtAudience] },
    );

    new CfnOutput(this, 'CognitoJwtIssuer', { value: jwtIssuer });
    new CfnOutput(this, 'CognitoJwtAudience', {
      value: jwtAudience,
    });

    const integration = new apigwv2Integrations.HttpLambdaIntegration(
      'ApiLambdaIntegration',
      apiLambda,
    );

    new apigwv2.HttpRoute(this, 'DefaultRoute', {
      httpApi,
      routeKey: apigwv2.HttpRouteKey.DEFAULT,
      integration,
      authorizer: jwtAuthorizer,
    });

    new CfnOutput(this, 'UsersTableName', { value: this.usersTable.tableName });
    new CfnOutput(this, 'WorkspacesTableName', {
      value: this.workspacesTable.tableName,
    });
    new CfnOutput(this, 'WorkspaceMembersTableName', {
      value: this.workspaceMembersTable.tableName,
    });
    new CfnOutput(this, 'WorkspaceRecordsTableName', {
      value: this.workspaceRecordsTable.tableName,
    });
    new CfnOutput(this, 'WorkspaceSettingsTableName', {
      value: this.workspaceSettingsTable.tableName,
    });
    new CfnOutput(this, 'AutonomoControlApiArtifactBucketName', {
      value: this.artifactBucket.bucketName,
    });

    new CfnOutput(this, 'AutonomoControlApiLambdaName', { value: apiLambda.functionName });
    new CfnOutput(this, 'AutonomoControlApiLambdaArn', { value: apiLambda.functionArn });
    new CfnOutput(this, 'AutonomoControlApiUrl', {
      value: httpApi.url ?? 'no-default-stage',
    });
    new CfnOutput(this, 'CognitoUserPoolId', { value: userPool.userPoolId });
    new CfnOutput(this, 'CognitoUserPoolClientId', {
      value: jwtAudience,
    });
    new CfnOutput(this, 'CognitoDomain', { value: userPoolDomain.baseUrl() });
    new CfnOutput(this, 'CognitoGoogleIdpRedirectUri', {
      value: `${userPoolDomain.baseUrl()}/oauth2/idpresponse`,
    });
  }
}
