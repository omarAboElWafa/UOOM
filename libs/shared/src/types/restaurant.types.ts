export enum RestaurantStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  CLOSED = 'CLOSED'
}

export enum CuisineType {
  ITALIAN = 'ITALIAN',
  CHINESE = 'CHINESE',
  INDIAN = 'INDIAN',
  MEXICAN = 'MEXICAN',
  AMERICAN = 'AMERICAN',
  JAPANESE = 'JAPANESE',
  THAI = 'THAI',
  MEDITERRANEAN = 'MEDITERRANEAN',
  OTHER = 'OTHER'
}

export interface RestaurantLocation {
  latitude: number;
  longitude: number;
  address: string;
  city: string;
  postalCode: string;
  country: string;
}

export interface RestaurantHours {
  dayOfWeek: number; // 0-6 (Sunday-Saturday)
  openTime: string; // HH:MM format
  closeTime: string; // HH:MM format
  isOpen: boolean;
}

export interface Restaurant {
  id: string;
  name: string;
  description: string;
  status: RestaurantStatus;
  cuisineType: CuisineType;
  location: RestaurantLocation;
  hours: RestaurantHours[];
  phoneNumber: string;
  email: string;
  averageRating: number;
  totalReviews: number;
  minimumOrderAmount: number;
  deliveryFee: number;
  estimatedPreparationTime: number; // in minutes
  createdAt: Date;
  updatedAt: Date;
}

export interface RestaurantCreateRequest {
  name: string;
  description: string;
  cuisineType: CuisineType;
  location: RestaurantLocation;
  hours: RestaurantHours[];
  phoneNumber: string;
  email: string;
  minimumOrderAmount: number;
  deliveryFee: number;
  estimatedPreparationTime: number;
}

export interface RestaurantUpdateRequest {
  name?: string;
  description?: string;
  status?: RestaurantStatus;
  cuisineType?: CuisineType;
  location?: RestaurantLocation;
  hours?: RestaurantHours[];
  phoneNumber?: string;
  email?: string;
  minimumOrderAmount?: number;
  deliveryFee?: number;
  estimatedPreparationTime?: number;
} 