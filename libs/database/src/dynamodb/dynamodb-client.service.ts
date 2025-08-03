import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DynamoDBClient,
  DynamoDBClientConfig,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
  DeleteItemCommand,
  QueryCommand,
  BatchGetItemCommand,
  BatchWriteItemCommand,
  GetItemCommandInput,
  PutItemCommandInput,
  UpdateItemCommandInput,
  QueryCommandInput,
} from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand as DocQueryCommand,
  BatchGetCommand,
  BatchWriteCommand,
} from '@aws-sdk/lib-dynamodb';

export interface DynamoDBConfig {
  region: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  tablePrefix?: string;
  daxEndpoint?: string;
  maxRetries?: number;
  timeout?: number;
}

@Injectable()
export class DynamoDBClientService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DynamoDBClientService.name);
  private dynamoClient: DynamoDBClient;
  private docClient: DynamoDBDocumentClient;
  private daxClient?: DynamoDBDocumentClient; // For DAX acceleration
  private readonly config: DynamoDBConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = {
      region: this.configService.get('AWS_REGION', 'us-east-1'),
      endpoint: this.configService.get('DYNAMODB_ENDPOINT'), // For local development
      accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
      secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      tablePrefix: this.configService.get('DYNAMODB_TABLE_PREFIX', 'uoom-'),
      daxEndpoint: this.configService.get('DAX_ENDPOINT'),
      maxRetries: this.configService.get('DYNAMODB_MAX_RETRIES', 3),
      timeout: this.configService.get('DYNAMODB_TIMEOUT', 5000),
    };
  }

  async onModuleInit() {
    await this.initializeClients();
  }

  async onModuleDestroy() {
    try {
      this.dynamoClient?.destroy();
      this.logger.log('DynamoDB clients disconnected');
    } catch (error) {
      this.logger.error('Error disconnecting DynamoDB clients', error);
    }
  }

  private async initializeClients() {
    try {
      // Configure DynamoDB client
      const clientConfig: DynamoDBClientConfig = {
        region: this.config.region,
        maxAttempts: this.config.maxRetries,
        requestHandler: {
          requestTimeout: this.config.timeout,
        },
      };

      // Add endpoint for local development
      if (this.config.endpoint) {
        clientConfig.endpoint = this.config.endpoint;
      }

      // Add credentials if provided
      if (this.config.accessKeyId && this.config.secretAccessKey) {
        clientConfig.credentials = {
          accessKeyId: this.config.accessKeyId,
          secretAccessKey: this.config.secretAccessKey,
        };
      }

      // Initialize clients
      this.dynamoClient = new DynamoDBClient(clientConfig);
      this.docClient = DynamoDBDocumentClient.from(this.dynamoClient, {
        marshallOptions: {
          removeUndefinedValues: true,
          convertEmptyValues: false,
        },
        unmarshallOptions: {
          wrapNumbers: false,
        },
      });

      // Initialize DAX client if endpoint provided
      if (this.config.daxEndpoint) {
        await this.initializeDaxClient();
      }

      this.logger.log('DynamoDB clients initialized successfully', {
        region: this.config.region,
        daxEnabled: !!this.daxClient,
        tablePrefix: this.config.tablePrefix,
      });
    } catch (error) {
      this.logger.error('Failed to initialize DynamoDB clients', error);
      throw error;
    }
  }

  private async initializeDaxClient() {
    try {
      // DAX client configuration
      // Note: In production, you'd use the DAX client library
      // For now, we'll use regular DynamoDB with the option to switch to DAX
      this.logger.log('DAX endpoint configured, using accelerated reads');
      // this.daxClient = new AmazonDaxClient({ endpoints: [this.config.daxEndpoint] });
    } catch (error) {
      this.logger.warn('Failed to initialize DAX client, falling back to regular DynamoDB', error);
    }
  }

  /**
   * Get client for read operations (uses DAX if available for ultra-low latency)
   */
  getReadClient(): DynamoDBDocumentClient {
    return this.daxClient || this.docClient;
  }

  /**
   * Get client for write operations (always uses regular DynamoDB)
   */
  getWriteClient(): DynamoDBDocumentClient {
    return this.docClient;
  }

  /**
   * Get table name with prefix
   */
  getTableName(tableName: string): string {
    return `${this.config.tablePrefix}${tableName}`;
  }

  /**
   * Get item from DynamoDB with automatic retries
   */
  async getItem<T = any>(
    tableName: string,
    key: Record<string, any>,
    useCache = true,
  ): Promise<T | null> {
    try {
      const client = useCache ? this.getReadClient() : this.getWriteClient();
      const command = new GetCommand({
        TableName: this.getTableName(tableName),
        Key: key,
      });

      const startTime = Date.now();
      const result = await client.send(command);
      const duration = Date.now() - startTime;

      this.logger.debug(`DynamoDB GetItem completed in ${duration}ms`, {
        tableName,
        hasItem: !!result.Item,
        fromCache: useCache && !!this.daxClient,
      });

      return result.Item as T || null;
    } catch (error) {
      this.logger.error(`DynamoDB GetItem failed`, {
        tableName,
        key,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Put item to DynamoDB
   */
  async putItem<T = any>(
    tableName: string,
    item: T,
    options?: {
      conditionExpression?: string;
      expressionAttributeNames?: Record<string, string>;
      expressionAttributeValues?: Record<string, any>;
    },
  ): Promise<void> {
    try {
      const command = new PutCommand({
        TableName: this.getTableName(tableName),
        Item: item,
        ConditionExpression: options?.conditionExpression,
        ExpressionAttributeNames: options?.expressionAttributeNames,
        ExpressionAttributeValues: options?.expressionAttributeValues,
      });

      const startTime = Date.now();
      await this.getWriteClient().send(command);
      const duration = Date.now() - startTime;

      this.logger.debug(`DynamoDB PutItem completed in ${duration}ms`, {
        tableName,
      });
    } catch (error) {
      this.logger.error(`DynamoDB PutItem failed`, {
        tableName,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Update item in DynamoDB
   */
  async updateItem(
    tableName: string,
    key: Record<string, any>,
    updateExpression: string,
    expressionAttributeNames?: Record<string, string>,
    expressionAttributeValues?: Record<string, any>,
    conditionExpression?: string,
  ): Promise<any> {
    try {
      const command = new UpdateCommand({
        TableName: this.getTableName(tableName),
        Key: key,
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ConditionExpression: conditionExpression,
        ReturnValues: 'ALL_NEW',
      });

      const startTime = Date.now();
      const result = await this.getWriteClient().send(command);
      const duration = Date.now() - startTime;

      this.logger.debug(`DynamoDB UpdateItem completed in ${duration}ms`, {
        tableName,
      });

      return result.Attributes;
    } catch (error) {
      this.logger.error(`DynamoDB UpdateItem failed`, {
        tableName,
        key,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Delete item from DynamoDB
   */
  async deleteItem(
    tableName: string,
    key: Record<string, any>,
  ): Promise<void> {
    try {
      const command = new DeleteCommand({
        TableName: this.getTableName(tableName),
        Key: key,
      });

      const startTime = Date.now();
      await this.getWriteClient().send(command);
      const duration = Date.now() - startTime;

      this.logger.debug(`DynamoDB DeleteItem completed in ${duration}ms`, {
        tableName,
      });
    } catch (error) {
      this.logger.error(`DynamoDB DeleteItem failed`, {
        tableName,
        key,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Query items from DynamoDB
   */
  async query<T = any>(
    tableName: string,
    keyConditionExpression: string,
    options?: {
      indexName?: string;
      filterExpression?: string;
      expressionAttributeNames?: Record<string, string>;
      expressionAttributeValues?: Record<string, any>;
      limit?: number;
      scanIndexForward?: boolean;
      exclusiveStartKey?: Record<string, any>;
    },
  ): Promise<{ items: T[]; lastEvaluatedKey?: Record<string, any> }> {
    try {
      const command = new DocQueryCommand({
        TableName: this.getTableName(tableName),
        KeyConditionExpression: keyConditionExpression,
        IndexName: options?.indexName,
        FilterExpression: options?.filterExpression,
        ExpressionAttributeNames: options?.expressionAttributeNames,
        ExpressionAttributeValues: options?.expressionAttributeValues,
        Limit: options?.limit,
        ScanIndexForward: options?.scanIndexForward,
        ExclusiveStartKey: options?.exclusiveStartKey,
      });

      const startTime = Date.now();
      const result = await this.getReadClient().send(command);
      const duration = Date.now() - startTime;

      this.logger.debug(`DynamoDB Query completed in ${duration}ms`, {
        tableName,
        itemCount: result.Items?.length || 0,
      });

      return {
        items: (result.Items as T[]) || [],
        lastEvaluatedKey: result.LastEvaluatedKey,
      };
    } catch (error) {
      this.logger.error(`DynamoDB Query failed`, {
        tableName,
        keyConditionExpression,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Batch get items from DynamoDB
   */
  async batchGetItems<T = any>(
    requests: { tableName: string; keys: Record<string, any>[] }[],
  ): Promise<Record<string, T[]>> {
    try {
      const requestItems: Record<string, any> = {};
      
      requests.forEach(({ tableName, keys }) => {
        requestItems[this.getTableName(tableName)] = {
          Keys: keys,
        };
      });

      const command = new BatchGetCommand({
        RequestItems: requestItems,
      });

      const startTime = Date.now();
      const result = await this.getReadClient().send(command);
      const duration = Date.now() - startTime;

      this.logger.debug(`DynamoDB BatchGetItem completed in ${duration}ms`, {
        tableCount: requests.length,
      });

      // Transform response to use logical table names
      const response: Record<string, T[]> = {};
      Object.entries(result.Responses || {}).forEach(([physicalTableName, items]) => {
        const logicalTableName = physicalTableName.replace(this.config.tablePrefix!, '');
        response[logicalTableName] = items as T[];
      });

      return response;
    } catch (error) {
      this.logger.error(`DynamoDB BatchGetItem failed`, {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get connection health status
   */
  async getHealthStatus(): Promise<{ status: 'healthy' | 'unhealthy'; details: any }> {
    try {
      // Simple health check by listing tables
      const startTime = Date.now();
      await this.dynamoClient.send(new GetItemCommand({
        TableName: this.getTableName('health-check'),
        Key: { id: { S: 'ping' } },
      }));
      const duration = Date.now() - startTime;

      return {
        status: 'healthy',
        details: {
          region: this.config.region,
          daxEnabled: !!this.daxClient,
          responseTime: duration,
          tablePrefix: this.config.tablePrefix,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error.message,
          region: this.config.region,
        },
      };
    }
  }
} 