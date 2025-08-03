import { Injectable, Logger } from '@nestjs/common';
import { SagaStep, SagaContext, SagaStepResult } from '../interfaces/saga-step.interface';

export interface PartnerBookingData {
  bookingId: string;
  partnerId: string;
  partnerName: string;
  channelId: string;
  estimatedPickupTime: Date;
  estimatedDeliveryTime: Date;
  deliveryFee: number;
  partnerCommission: number;
  optimizationScore: number;
}

@Injectable()
export class BookPartnerStep extends SagaStep {
  readonly stepName = 'BookPartner';
  readonly maxRetries = 3;
  readonly timeout = 8000; // 8 seconds for optimization calls

  private readonly logger = new Logger(BookPartnerStep.name);

  async execute(context: SagaContext): Promise<SagaStepResult> {
    const { sagaId, sagaData, correlationId } = context;
    
    try {
      this.logger.debug(`Booking delivery partner for order`, {
        sagaId,
        orderId: sagaData.orderId,
        correlationId,
      });

      // Call optimization service to get best partner
      const optimalPartner = await this.findOptimalPartner(sagaData);
      
      // Book the partner
      const bookingData = await this.bookPartner(optimalPartner, sagaData);

      this.logger.log(`Partner booked successfully`, {
        sagaId,
        bookingId: bookingData.bookingId,
        partnerId: bookingData.partnerId,
        correlationId,
      });

      return {
        success: true,
        data: bookingData,
      };
    } catch (error) {
      this.logger.error(`Failed to book partner`, {
        sagaId,
        error: error.message,
        correlationId,
      });

      return {
        success: false,
        error: error.message,
        shouldRetry: this.isRetryableError(error),
      };
    }
  }

  async compensate(context: SagaContext): Promise<SagaStepResult> {
    const { sagaId, correlationId } = context;
    
    try {
      // Get booking data from step execution
      const stepData = context.sagaData?.stepData?.find(
        (step: any) => step.stepName === this.stepName
      );
      
      if (!stepData?.data) {
        this.logger.warn(`No booking data found for compensation`, {
          sagaId,
          correlationId,
        });
        return { success: true }; // Nothing to compensate
      }

      const bookingData = stepData.data as PartnerBookingData;

      this.logger.debug(`Cancelling partner booking`, {
        sagaId,
        bookingId: bookingData.bookingId,
        correlationId,
      });

      // Cancel the partner booking
      await this.cancelPartnerBooking(bookingData);

      this.logger.log(`Partner booking cancelled successfully`, {
        sagaId,
        bookingId: bookingData.bookingId,
        correlationId,
      });

      return {
        success: true,
      };
    } catch (error) {
      this.logger.error(`Failed to cancel partner booking`, {
        sagaId,
        error: error.message,
        correlationId,
      });

      return {
        success: false,
        error: error.message,
      };
    }
  }

  private async findOptimalPartner(sagaData: any): Promise<any> {
    // Simulate call to optimization service
    // In real implementation, this would call the Python OR-Tools service
    
    this.logger.debug(`Finding optimal partner for delivery`, {
      restaurantId: sagaData.restaurantId,
      deliveryLocation: sagaData.deliveryLocation,
    });

    // Simulate processing delay for optimization
    await new Promise(resolve => setTimeout(resolve, 200));

    // Simulate optimization service response
    const partners = [
      {
        partnerId: 'partner-uber-eats',
        partnerName: 'Uber Eats',
        channelId: 'channel-uber',
        estimatedDeliveryMinutes: 35,
        deliveryFee: 5.99,
        commission: 0.20,
        score: 0.85,
        capacity: 80,
      },
      {
        partnerId: 'partner-deliveroo',
        partnerName: 'Deliveroo',
        channelId: 'channel-deliveroo',
        estimatedDeliveryMinutes: 40,
        deliveryFee: 4.99,
        commission: 0.18,
        score: 0.78,
        capacity: 60,
      },
      {
        partnerId: 'partner-own-fleet',
        partnerName: 'Own Fleet',
        channelId: 'channel-own',
        estimatedDeliveryMinutes: 30,
        deliveryFee: 3.99,
        commission: 0.05,
        score: 0.92,
        capacity: 40,
      },
    ];

    // Apply optimization scoring
    const scoredPartners = partners
      .filter(partner => partner.capacity > 0)
      .map(partner => ({
        ...partner,
        finalScore: this.calculateOptimizationScore(partner, sagaData),
      }))
      .sort((a, b) => b.finalScore - a.finalScore);

    if (scoredPartners.length === 0) {
      throw new Error('No available delivery partners found');
    }

    const optimalPartner = scoredPartners[0];
    
    this.logger.debug(`Optimal partner selected`, {
      partnerId: optimalPartner.partnerId,
      score: optimalPartner.finalScore,
      estimatedDeliveryMinutes: optimalPartner.estimatedDeliveryMinutes,
    });

    return optimalPartner;
  }

  private calculateOptimizationScore(partner: any, sagaData: any): number {
    // Multi-objective optimization scoring
    // Factors: delivery time, cost, reliability, capacity
    
    const timeScore = Math.max(0, 1 - (partner.estimatedDeliveryMinutes - 20) / 60); // Prefer faster delivery
    const costScore = Math.max(0, 1 - (partner.deliveryFee - 3) / 10); // Prefer lower cost
    const reliabilityScore = partner.score; // Partner's historical reliability
    const capacityScore = Math.min(1, partner.capacity / 100); // Prefer higher capacity
    
    // Weighted combination
    const weights = {
      time: 0.4,
      cost: 0.2,
      reliability: 0.3,
      capacity: 0.1,
    };
    
    return (
      timeScore * weights.time +
      costScore * weights.cost +
      reliabilityScore * weights.reliability +
      capacityScore * weights.capacity
    );
  }

  private async bookPartner(optimalPartner: any, sagaData: any): Promise<PartnerBookingData> {
    const bookingId = `booking-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Simulate API call to partner service
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Simulate potential failures (3% failure rate)
    if (Math.random() < 0.03) {
      throw new Error('Partner booking service temporarily unavailable');
    }

    // Simulate partner capacity issues
    if (Math.random() < 0.02) {
      throw new Error('Selected partner has insufficient capacity');
    }

    const pickupTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    const deliveryTime = new Date(Date.now() + optimalPartner.estimatedDeliveryMinutes * 60 * 1000);

    const bookingData: PartnerBookingData = {
      bookingId,
      partnerId: optimalPartner.partnerId,
      partnerName: optimalPartner.partnerName,
      channelId: optimalPartner.channelId,
      estimatedPickupTime: pickupTime,
      estimatedDeliveryTime: deliveryTime,
      deliveryFee: optimalPartner.deliveryFee,
      partnerCommission: optimalPartner.commission,
      optimizationScore: optimalPartner.finalScore,
    };

    return bookingData;
  }

  private async cancelPartnerBooking(bookingData: PartnerBookingData): Promise<void> {
    // Simulate API call to cancel booking
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // In a real implementation, this would call the partner service to cancel the booking
    this.logger.debug(`Cancelled partner booking: ${bookingData.bookingId}`);
  }

  private isRetryableError(error: Error): boolean {
    const retryableErrors = [
      'Partner booking service temporarily unavailable',
      'Optimization service timeout',
      'Connection timeout',
      'Service unavailable',
    ];

    return retryableErrors.some(retryableError => 
      error.message.includes(retryableError)
    );
  }
} 