# Welcome to your CDK TypeScript project

This is a blank project for CDK development with TypeScript.

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Stages (Dev/Prod)

This project now defines Dev and Prod stages via a shared `AutonomoControlStage` wrapper. Each stage
deploys its own stack (`AutonomoControlCdkStack-dev` and `AutonomoControlCdkStack-prod`) and tags
resources with `Stage=dev` or `Stage=prod`. You can override the target account/region per stage via
CDK context.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `npx cdk deploy Dev`   deploy the dev stage
* `npx cdk deploy Prod`  deploy the prod stage
* `npx cdk deploy Dev -c dev.account=123456789012 -c dev.region=us-east-1`   override dev env
* `npx cdk deploy Prod -c prod.account=123456789012 -c prod.region=us-east-1` override prod env
* `npx cdk diff`    compare deployed stack with current state
* `npx cdk synth`   emits the synthesized CloudFormation template
