import * as cdk from 'aws-cdk-lib';
import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface AutonomoControlCdkStackProps extends cdk.StackProps {
  stageName: string;
  tableNamePrefix: string;
}

export class AutonomoControlCdkStack extends cdk.Stack {
  public readonly usersTable: dynamodb.Table;
  public readonly workspacesTable: dynamodb.Table;
  public readonly workspaceMembersTable: dynamodb.Table;
  public readonly workspaceRecordsTable: dynamodb.Table;
  public readonly workspaceSettingsTable: dynamodb.Table;

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
  }
}
