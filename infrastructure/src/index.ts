#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CaloUoopStack } from '../lib/calo-uoop-stack';

const app = new cdk.App();

// Get environment from context or default to development
const environment = app.node.tryGetContext('environment') || 'development';

// Create the main UOOP stack
new CaloUoopStack(app, `UoopStack-${environment}`, {
  environment,
  description: `UOOP Platform Infrastructure - ${environment}`,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  tags: {
    Environment: environment,
    Project: 'UOOP',
    Service: 'Food Delivery Platform',
  },
});

// Add tags to all resources
cdk.Tags.of(app).add('Project', 'UOOP');
cdk.Tags.of(app).add('ManagedBy', 'CDK');
cdk.Tags.of(app).add('Environment', environment); 