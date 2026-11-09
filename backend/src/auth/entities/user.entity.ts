export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role?: string;
  passwordHash: string;
  loyaltyPoints: number;
  createdAt: string;
}

export type PublicUser = Omit<User, 'passwordHash'>;
