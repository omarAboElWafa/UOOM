import { ValidationError } from 'class-validator';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

export function formatValidationErrors(errors: ValidationError[]): string[] {
  const formattedErrors: string[] = [];
  
  function extractErrors(errors: ValidationError[], prefix = ''): void {
    for (const error of errors) {
      const property = prefix ? `${prefix}.${error.property}` : error.property;
      
      if (error.constraints) {
        for (const constraint of Object.keys(error.constraints).map(key => error.constraints[key])) {
          formattedErrors.push(`${property}: ${constraint}`);
        }
      }
      
      if (error.children && error.children.length > 0) {
        extractErrors(error.children, property);
      }
    }
  }
  
  extractErrors(errors);
  return formattedErrors;
}

export function validateLatitude(latitude: number): boolean {
  return latitude >= -90 && latitude <= 90;
}

export function validateLongitude(longitude: number): boolean {
  return longitude >= -180 && longitude <= 180;
}

export function validatePhoneNumber(phoneNumber: string): boolean {
  // Basic phone number validation - can be enhanced based on requirements
  const phoneRegex = /^\+?[\d\s\-\(\)]+$/;
  return phoneRegex.test(phoneNumber) && phoneNumber.length >= 10;
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePostalCode(postalCode: string): boolean {
  // Basic postal code validation - can be enhanced based on country
  const postalCodeRegex = /^[\dA-Za-z\s\-]+$/;
  return postalCodeRegex.test(postalCode) && postalCode.length >= 3;
} 