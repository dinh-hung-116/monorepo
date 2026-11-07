export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  loyaltyPoints: number;
  createdAt: string;
}

export type PublicUser = Omit<User, 'passwordHash'>;
