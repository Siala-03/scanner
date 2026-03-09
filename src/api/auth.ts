import { apiRequest } from './http';
import type { Staff, StaffRole } from '../types';

export async function signUpStaff(input: {
  name: string;
  email: string;
  phone: string;
  role: StaffRole;
  username: string;
  password: string;
}): Promise<Staff> {
  const data = await apiRequest<{ staff: Staff }>('/api/auth/signup', {
    method: 'POST',
    json: input
  });
  return data.staff;
}

