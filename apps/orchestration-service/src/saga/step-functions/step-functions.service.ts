import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SFNClient,
  StartExecutionCommand,
  DescribeExecutionCommand,
  StopExecutionCommand,
  ListExecutionsCommand,
  DescribeStateMachineCommand,
  CreateStateMachineCommand,
  UpdateStateMachineCommand,
  ExecutionStatus,
  StateMachineStatus,
} from '@aws-sdk/client-sfn';

export interface StepFunctionExecutionInput {
  orderId: string;
  sagaId: string;
  sagaData: any;
  correlationId?: string;
  retryCount?: number;
}

export interface StepFunctionExecutionResult {
  executionArn: string;
  startDate: Date;
  status: ExecutionStatus;
  input: string;
  output?: string;
  error?: string;
}

export interface SagaStateMachineDefinition {
  Comment: string;
  StartAt: string;
  States: {
    [key: string]: {
      Type: string;
      Resource?: string;
      Parameters?: any;
      Retry?: Array<{
        ErrorEquals: string[];
        IntervalSeconds: number;
        MaxAttempts: number;
        BackoffRate: number;
      }>;
      Catch?: Array<{
        ErrorEquals: string[];
        Next: string;
        ResultPath?: string;
      }>;
      Next?: string;
      End?: boolean;
    };
  };
}

@Injectable()
export class StepFunctionsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StepFunctionsService.name);
  private sfnClient: SFNClient;
  private stateMachineArn: string;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.initializeClient();
    await this.ensureStateMachineExists();
  }

  async onModuleDestroy() {
    // Cleanup if needed
  }

  private async initializeClient() {
    const region = this.configService.get('AWS_REGION', 'us-east-1');
    
    this.sfnClient = new SFNClient({
      region,
      credentials: this.configService.get('AWS_ACCESS_KEY_ID') ? {
        accessKeyId: this.configService.get('AWS_ACCESS_KEY_ID'),
        secretAccessKey: this.configService.get('AWS_SECRET_ACCESS_KEY'),
      } : undefined,
    });

    this.stateMachineArn = this.configService.get(
      'STEP_FUNCTION_ARN',
      `arn:aws:states:${region}:${this.configService.get('AWS_ACCOUNT_ID')}:stateMachine:OrderProcessingSaga`
    );

    this.logger.log('Step Functions client initialized', {
      region,
      stateMachineArn: this.stateMachineArn,
    });
  }

  private async ensureStateMachineExists() {
    try {
      // Check if state machine exists
      await this.sfnClient.send(new DescribeStateMachineCommand({
        stateMachineArn: this.stateMachineArn,
      }));
      
      this.logger.log('State machine found', { stateMachineArn: this.stateMachineArn });
    } catch (error) {
      if (error.name === 'StateMachineDoesNotExist') {
        this.logger.warn('State machine not found, will create when needed');
      } else {
        this.logger.error('Error checking state machine', { error: error.message });
      }
    }
  }

  /**
   * Start saga execution using Step Functions
   */
  async startSagaExecution(input: StepFunctionExecutionInput): Promise<string> {
    try {
      const executionName = `saga-${input.sagaId}-${Date.now()}`;
      
      const command = new StartExecutionCommand({
        stateMachineArn: this.stateMachineArn,
        name: executionName,
        input: JSON.stringify(input),
      });

      const result = await this.sfnClient.send(command);
      
      this.logger.log('Saga execution started', {
        executionArn: result.executionArn,
        sagaId: input.sagaId,
        orderId: input.orderId,
        correlationId: input.correlationId,
      });

      return result.executionArn;
    } catch (error) {
      this.logger.error('Failed to start saga execution', {
        sagaId: input.sagaId,
        orderId: input.orderId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get execution status and details
   */
  async getExecutionStatus(executionArn: string): Promise<StepFunctionExecutionResult> {
    try {
      const command = new DescribeExecutionCommand({
        executionArn,
      });

      const result = await this.sfnClient.send(command);

      return {
        executionArn: result.executionArn!,
        startDate: result.startDate!,
        status: result.status!,
        input: result.input!,
        output: result.output,
        error: result.error,
      };
    } catch (error) {
      this.logger.error('Failed to get execution status', {
        executionArn,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Stop saga execution
   */
  async stopSagaExecution(executionArn: string, reason: string): Promise<void> {
    try {
      const command = new StopExecutionCommand({
        executionArn,
        error: 'SagaCancelled',
        cause: reason,
      });

      await this.sfnClient.send(command);
      
      this.logger.log('Saga execution stopped', {
        executionArn,
        reason,
      });
    } catch (error) {
      this.logger.error('Failed to stop saga execution', {
        executionArn,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * List executions for monitoring
   */
  async listSagaExecutions(maxResults = 100): Promise<StepFunctionExecutionResult[]> {
    try {
      const command = new ListExecutionsCommand({
        stateMachineArn: this.stateMachineArn,
        maxResults,
        statusFilter: 'RUNNING',
      });

      const result = await this.sfnClient.send(command);
      
      return (result.executions || []).map(exec => ({
        executionArn: exec.executionArn!,
        startDate: exec.startDate!,
        status: exec.status!,
        input: '',
      }));
    } catch (error) {
      this.logger.error('Failed to list executions', {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Create or update state machine definition
   */
  async createOrUpdateStateMachine(): Promise<void> {
    const definition = this.getOrderProcessingStateMachineDefinition();
    const roleArn = this.configService.get(
      'STEP_FUNCTION_ROLE_ARN',
      `arn:aws:iam::${this.configService.get('AWS_ACCOUNT_ID')}:role/StepFunctionsExecutionRole`
    );

    try {
      // Try to update existing state machine
      const updateCommand = new UpdateStateMachineCommand({
        stateMachineArn: this.stateMachineArn,
        definition: JSON.stringify(definition),
        roleArn,
      });

      await this.sfnClient.send(updateCommand);
      this.logger.log('State machine updated successfully');
    } catch (error) {
      if (error.name === 'StateMachineDoesNotExist') {
        // Create new state machine
        const createCommand = new CreateStateMachineCommand({
          name: 'OrderProcessingSaga',
          definition: JSON.stringify(definition),
          roleArn,
          type: 'STANDARD',
        });

        const result = await this.sfnClient.send(createCommand);
        this.stateMachineArn = result.stateMachineArn!;
        
        this.logger.log('State machine created successfully', {
          stateMachineArn: this.stateMachineArn,
        });
      } else {
        throw error;
      }
    }
  }

  /**
   * Get the state machine definition for order processing saga
   */
  private getOrderProcessingStateMachineDefinition(): SagaStateMachineDefinition {
    return {
      Comment: "Order Processing Saga with compensation logic",
      StartAt: "ReserveInventory",
      States: {
        "ReserveInventory": {
          Type: "Task",
          Resource: `arn:aws:states:::lambda:invoke`,
          Parameters: {
            FunctionName: `${this.configService.get('LAMBDA_PREFIX', 'uoop')}-reserve-inventory`,
            Payload: {
              "sagaId.$": "$.sagaId",
              "orderId.$": "$.orderId",
              "sagaData.$": "$.sagaData",
              "correlationId.$": "$.correlationId",
              "stepName": "ReserveInventory"
            }
          },
          Retry: [
            {
              ErrorEquals: ["Lambda.ServiceException", "Lambda.AWSLambdaException"],
              IntervalSeconds: 2,
              MaxAttempts: 3,
              BackoffRate: 2.0
            },
            {
              ErrorEquals: ["States.TaskFailed"],
              IntervalSeconds: 1,
              MaxAttempts: 2,
              BackoffRate: 1.5
            }
          ],
          Catch: [
            {
              ErrorEquals: ["States.ALL"],
              Next: "CompensateInventory",
              ResultPath: "$.error"
            }
          ],
          Next: "BookPartner"
        },
        "BookPartner": {
          Type: "Task",
          Resource: `arn:aws:states:::lambda:invoke`,
          Parameters: {
            FunctionName: `${this.configService.get('LAMBDA_PREFIX', 'uoop')}-book-partner`,
            Payload: {
              "sagaId.$": "$.sagaId",
              "orderId.$": "$.orderId",
              "sagaData.$": "$.sagaData",
              "correlationId.$": "$.correlationId",
              "stepName": "BookPartner",
              "previousStepResult.$": "$.Payload"
            }
          },
          Retry: [
            {
              ErrorEquals: ["Lambda.ServiceException", "Lambda.AWSLambdaException"],
              IntervalSeconds: 2,
              MaxAttempts: 3,
              BackoffRate: 2.0
            }
          ],
          Catch: [
            {
              ErrorEquals: ["States.ALL"],
              Next: "CompensatePartner",
              ResultPath: "$.error"
            }
          ],
          Next: "ConfirmOrder"
        },
        "ConfirmOrder": {
          Type: "Task",
          Resource: `arn:aws:states:::lambda:invoke`,
          Parameters: {
            FunctionName: `${this.configService.get('LAMBDA_PREFIX', 'uoop')}-confirm-order`,
            Payload: {
              "sagaId.$": "$.sagaId",
              "orderId.$": "$.orderId",
              "sagaData.$": "$.sagaData",
              "correlationId.$": "$.correlationId",
              "stepName": "ConfirmOrder",
              "previousStepResult.$": "$.Payload"
            }
          },
          Retry: [
            {
              ErrorEquals: ["Lambda.ServiceException", "Lambda.AWSLambdaException"],
              IntervalSeconds: 2,
              MaxAttempts: 2,
              BackoffRate: 2.0
            }
          ],
          Catch: [
            {
              ErrorEquals: ["States.ALL"],
              Next: "CompensateOrder",
              ResultPath: "$.error"
            }
          ],
          Next: "SagaCompleted"
        },
        "SagaCompleted": {
          Type: "Pass",
          End: true
        },
        "CompensateOrder": {
          Type: "Task",
          Resource: `arn:aws:states:::lambda:invoke`,
          Parameters: {
            FunctionName: `${this.configService.get('LAMBDA_PREFIX', 'uoop')}-compensate-order`,
            Payload: {
              "sagaId.$": "$.sagaId",
              "orderId.$": "$.orderId",
              "sagaData.$": "$.sagaData",
              "correlationId.$": "$.correlationId",
              "error.$": "$.error"
            }
          },
          Next: "CompensatePartner"
        },
        "CompensatePartner": {
          Type: "Task",
          Resource: `arn:aws:states:::lambda:invoke`,
          Parameters: {
            FunctionName: `${this.configService.get('LAMBDA_PREFIX', 'uoop')}-compensate-partner`,
            Payload: {
              "sagaId.$": "$.sagaId",
              "orderId.$": "$.orderId",
              "sagaData.$": "$.sagaData",
              "correlationId.$": "$.correlationId",
              "error.$": "$.error"
            }
          },
          Next: "CompensateInventory"
        },
        "CompensateInventory": {
          Type: "Task",
          Resource: `arn:aws:states:::lambda:invoke`,
          Parameters: {
            FunctionName: `${this.configService.get('LAMBDA_PREFIX', 'uoop')}-compensate-inventory`,
            Payload: {
              "sagaId.$": "$.sagaId",
              "orderId.$": "$.orderId",
              "sagaData.$": "$.sagaData",
              "correlationId.$": "$.correlationId",
              "error.$": "$.error"
            }
          },
          Next: "SagaFailed"
        },
        "SagaFailed": {
          Type: "Pass", 
          End: true
        }
      }
    };
  }

  /**
   * Health check for Step Functions connectivity
   */
  async healthCheck(): Promise<{ status: string; details: any }> {
    try {
      await this.sfnClient.send(new DescribeStateMachineCommand({
        stateMachineArn: this.stateMachineArn,
      }));

      return {
        status: 'healthy',
        details: {
          stateMachineArn: this.stateMachineArn,
          region: this.configService.get('AWS_REGION'),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: error.message,
          stateMachineArn: this.stateMachineArn,
        },
      };
    }
  }
} 