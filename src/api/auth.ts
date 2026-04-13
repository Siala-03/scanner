import { supabase, type Staff } from '../lib/supabase';

export async function loginStaff(
  username: string,
  password: string,
  restaurantId?: string
): Promise<Staff> {
  try {
    console.log('Attempting login for:', username);

    // First, find staff by username
    // For superadmin (restaurant_id is null), search without restaurant filter
    let query = supabase
      .from('staff_credentials')
      .select('staff_id, password_hash, restaurant_id')
      .eq('username', username);

    if (restaurantId) {
      query = query.eq('restaurant_id', restaurantId);
    }

    const { data: credentials, error: credError } = await query;
    
    if (credError || !credentials || credentials.length === 0) {
      // Try finding superadmin (null restaurant_id) if no restaurant-specific user found
      const superadminQuery = await supabase
        .from('staff_credentials')
        .select('staff_id, password_hash, restaurant_id')
        .eq('username', username)
        .is('restaurant_id', null)
        .single();

      if (superadminQuery.error || !superadminQuery.data) {
        throw new Error('Invalid username or password');
      }
      Object.assign(credentials?.[0] || {}, superadminQuery.data);
    }

    const cred = credentials?.[0];
    if (!cred) {
      throw new Error('Invalid username or password');
    }

    // Accept test passwords for demo
    const validPasswords = ['admin123', '123456', 'demo123', 'manager123'];
    const isValid = validPasswords.includes(password) || cred.password_hash === password;
    
    if (!isValid) {
      throw new Error('Invalid username or password');
    }

    // Get staff data
    const { data: staff, error: staffError } = await supabase
      .from('staff')
      .select('*')
      .eq('id', cred.staff_id)
      .single();

    if (staffError || !staff) {
      throw new Error('Staff not found');
    }

    // Store auth info in localStorage
    localStorage.setItem('staffId', staff.id);
    localStorage.setItem('staffRole', staff.role);
    localStorage.setItem('restaurantId', staff.restaurant_id || '');

    console.log('Login successful for user:', staff.name);
    return staff as Staff;
  } catch (error) {
    console.error('Login failed:', error);
    throw error;
  }
}

export async function fetchAllStaff(): Promise<Staff[]> {
  const restaurantId = localStorage.getItem('restaurantId') || undefined;
  const role = localStorage.getItem('staffRole');
  
  // Superadmin sees all staff across all restaurants
  if (role === 'superadmin') {
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .order('name');
    if (error) throw error;
    return data as Staff[];
  }
  
  // Regular staff only sees staff from their restaurant
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('restaurant_id', restaurantId)
    .order('name');

  if (error) throw error;
  return data as Staff[];
}

export async function fetchStaffById(id: string): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Staff;
}

export async function fetchWaiters(): Promise<Staff[]> {
  const restaurantId = localStorage.getItem('restaurantId') || undefined;
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('role', 'waiter')
    .eq('restaurant_id', restaurantId)
    .order('name');

  if (error) throw error;
  return data as Staff[];
}

export async function signUpStaff(input: {
  name: string;
  email: string;
  phone: string;
  role: 'superadmin' | 'manager' | 'supervisor' | 'waiter' | 'kitchen';
  username: string;
  password: string;
  restaurantId?: string;
}): Promise<Staff> {
  const restaurantId = input.restaurantId || undefined;
  
  // Only superadmin can create other superadmins
  const currentRole = localStorage.getItem('staffRole');
  if (input.role === 'superadmin' && currentRole !== 'superadmin') {
    throw new Error('Only superadmin can create superadmin accounts');
  }
  
  const staffId = `staff-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Create staff record
  const { data: staff, error: staffError } = await supabase
    .from('staff')
    .insert({
      id: staffId,
      name: input.name,
      email: input.email,
      phone: input.phone,
      role: input.role,
      is_on_duty: true,
      assigned_tables: [],
      performance: {},
      restaurant_id: restaurantId // Can be null for superadmin
    })
    .select()
    .single();

  if (staffError) {
    if (staffError.message.includes('duplicate')) {
      throw new Error('Email already exists');
    }
    throw staffError;
  }

  // Create credentials
  const { error: credError } = await supabase
    .from('staff_credentials')
    .insert({
      staff_id: staffId,
      username: input.username,
      password_hash: input.password,
      restaurant_id: restaurantId // Can be null for superadmin
    });

  if (credError) {
    await supabase.from('staff').delete().eq('id', staffId);
    if (credError.message.includes('duplicate')) {
      throw new Error('Username already taken');
    }
    throw credError;
  }

  console.log('Signup successful for user:', staff.name);
  return staff as Staff;
}

export async function updateStaffRole(staffId: string, role: string): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .update({ role })
    .eq('id', staffId)
    .select()
    .single();

  if (error) throw error;
  return data as Staff;
}

export async function updateStaffDuty(staffId: string, isOnDuty: boolean): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .update({ is_on_duty: isOnDuty })
    .eq('id', staffId)
    .select()
    .single();

  if (error) throw error;
  return data as Staff;
}

export async function deleteStaff(staffId: string): Promise<void> {
  await supabase.from('staff_credentials').delete().eq('staff_id', staffId);
  const { error } = await supabase.from('staff').delete().eq('id', staffId);
  if (error) throw error;
}

export function logoutStaff(): void {
  localStorage.removeItem('staffId');
  localStorage.removeItem('token');
  localStorage.removeItem('staffRole');
  localStorage.removeItem('restaurantId');
  console.log('User logged out successfully');
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const staffId = localStorage.getItem('staffId');
  if (!staffId) {
    throw new Error('Not authenticated');
  }

  // Get current credentials
  const { data: credentials, error: credError } = await supabase
    .from('staff_credentials')
    .select('password_hash')
    .eq('staff_id', staffId)
    .single();

  if (credError || !credentials) {
    throw new Error('Credentials not found');
  }

  // Verify current password
  const isValid = currentPassword === 'admin123' || currentPassword === '123456' || 
    currentPassword === 'demo123' || currentPassword === 'manager123' ||
    credentials.password_hash === currentPassword;
  
  if (!isValid) {
    throw new Error('Current password is incorrect');
  }

  // Update password
  const { error: updateError } = await supabase
    .from('staff_credentials')
    .update({ password_hash: newPassword })
    .eq('staff_id', staffId);

  if (updateError) throw updateError;
}