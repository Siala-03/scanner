import { Staff, WaiterAssignment, StaffCredentials } from '../types';

export const mockStaff: Staff[] = [
{
  id: 'staff-001',
  name: 'Jean Paul Nkurunziza',
  role: 'waiter',
  email: 'jeanpaul@servv.rw',
  phone: '+250 78 201 0101',
  isOnDuty: true,
  assignedTables: [1, 2, 3, 4, 5],
  performance: {
    ordersServed: 847,
    avgServiceTime: 12.5,
    rating: 4.8,
    totalRevenue: 28450,
    shiftsThisWeek: 5
  },
  hireDate: new Date('2022-03-15')
},
{
  id: 'staff-002',
  name: 'Aline Mukamana',
  role: 'waiter',
  email: 'aline@servv.rw',
  phone: '+250 78 201 0102',
  isOnDuty: true,
  assignedTables: [6, 7, 8, 9, 10],
  performance: {
    ordersServed: 923,
    avgServiceTime: 11.2,
    rating: 4.9,
    totalRevenue: 31200,
    shiftsThisWeek: 6
  },
  hireDate: new Date('2021-08-20')
},
{
  id: 'staff-003',
  name: 'Eric Habimana',
  role: 'waiter',
  email: 'eric.h@servv.rw',
  phone: '+250 78 201 0103',
  isOnDuty: true,
  assignedTables: [11, 12, 13, 14, 15],
  performance: {
    ordersServed: 654,
    avgServiceTime: 14.8,
    rating: 4.5,
    totalRevenue: 22100,
    shiftsThisWeek: 4
  },
  hireDate: new Date('2023-01-10')
},
{
  id: 'staff-004',
  name: 'Chantal Uwimana',
  role: 'waiter',
  email: 'chantal@servv.rw',
  phone: '+250 78 201 0104',
  isOnDuty: false,
  assignedTables: [16, 17, 18, 19, 20],
  performance: {
    ordersServed: 512,
    avgServiceTime: 13.5,
    rating: 4.6,
    totalRevenue: 17800,
    shiftsThisWeek: 3
  },
  hireDate: new Date('2023-06-01')
},
{
  id: 'staff-005',
  name: 'Diane Uwamahoro',
  role: 'supervisor',
  email: 'diane@servv.rw',
  phone: '+250 78 201 0105',
  isOnDuty: true,
  assignedTables: [],
  performance: {
    ordersServed: 0,
    avgServiceTime: 0,
    rating: 4.7,
    totalRevenue: 0,
    shiftsThisWeek: 5
  },
  hireDate: new Date('2020-05-12')
},
{
  id: 'staff-006',
  name: 'Patrick Nzabonimpa',
  role: 'manager',
  email: 'patrick@servv.rw',
  phone: '+250 78 201 0106',
  isOnDuty: true,
  assignedTables: [],
  performance: {
    ordersServed: 0,
    avgServiceTime: 0,
    rating: 4.9,
    totalRevenue: 0,
    shiftsThisWeek: 6
  },
  hireDate: new Date('2019-02-01')
},
{
  id: 'staff-007',
  name: 'Moses Niyonzima',
  role: 'kitchen',
  email: 'moses.kitchen@servv.rw',
  phone: '+250 78 201 0107',
  isOnDuty: true,
  assignedTables: [],
  performance: {
    ordersServed: 1250,
    avgServiceTime: 18.5,
    rating: 4.8,
    totalRevenue: 0,
    shiftsThisWeek: 5
  },
  hireDate: new Date('2021-04-15')
},
{
  id: 'staff-008',
  name: 'Sandrine Ingabire',
  role: 'kitchen',
  email: 'sandrine.kitchen@servv.rw',
  phone: '+250 78 201 0108',
  isOnDuty: true,
  assignedTables: [],
  performance: {
    ordersServed: 980,
    avgServiceTime: 16.2,
    rating: 4.7,
    totalRevenue: 0,
    shiftsThisWeek: 4
  },
  hireDate: new Date('2022-09-01')
}];


export const mockWaiterAssignments: WaiterAssignment[] = [
{
  waiterId: 'staff-001',
  tableNumbers: [1, 2, 3, 4, 5],
  shiftStart: new Date(new Date().setHours(10, 0, 0, 0)),
  shiftEnd: new Date(new Date().setHours(18, 0, 0, 0))
},
{
  waiterId: 'staff-002',
  tableNumbers: [6, 7, 8, 9, 10],
  shiftStart: new Date(new Date().setHours(10, 0, 0, 0)),
  shiftEnd: new Date(new Date().setHours(18, 0, 0, 0))
},
{
  waiterId: 'staff-003',
  tableNumbers: [11, 12, 13, 14, 15],
  shiftStart: new Date(new Date().setHours(12, 0, 0, 0)),
  shiftEnd: new Date(new Date().setHours(20, 0, 0, 0))
},
{
  waiterId: 'staff-004',
  tableNumbers: [16, 17, 18, 19, 20],
  shiftStart: new Date(new Date().setHours(14, 0, 0, 0)),
  shiftEnd: new Date(new Date().setHours(22, 0, 0, 0))
}];


export const staffCredentials: StaffCredentials[] = [
{ staffId: 'staff-001', username: 'jeanpaul', password: 'waiter123' },
{ staffId: 'staff-002', username: 'aline', password: 'waiter123' },
{ staffId: 'staff-003', username: 'eric', password: 'waiter123' },
{ staffId: 'staff-004', username: 'chantal', password: 'waiter123' },
{ staffId: 'staff-005', username: 'diane', password: 'super123' },
{ staffId: 'staff-006', username: 'patrick', password: 'manager123' },
{ staffId: 'staff-007', username: 'moses', password: 'kitchen123' },
{ staffId: 'staff-008', username: 'sandrine', password: 'kitchen123' }
];


export const validateLogin = (
username: string,
password: string)
: Staff | null => {
  const cred = staffCredentials.find(
    (c) => c.username === username && c.password === password
  );
  if (!cred) return null;
  return mockStaff.find((s) => s.id === cred.staffId) || null;
};

export const addStaffCredential = (cred: StaffCredentials) => {
  staffCredentials.push(cred);
};

export const getWaiters = (): Staff[] => {
  return mockStaff.filter((staff) => staff.role === 'waiter');
};

export const getOnDutyWaiters = (): Staff[] => {
  return mockStaff.filter((staff) => staff.role === 'waiter' && staff.isOnDuty);
};

export const getStaffById = (id: string): Staff | undefined => {
  return mockStaff.find((staff) => staff.id === id);
};

export const getWaiterByTable = (tableNumber: number): Staff | undefined => {
  const assignment = mockWaiterAssignments.find((a) =>
  a.tableNumbers.includes(tableNumber)
  );
  if (!assignment) return undefined;
  return mockStaff.find((staff) => staff.id === assignment.waiterId);
};

export const getStaffOnDuty = (): Staff[] => {
  return mockStaff.filter((staff) => staff.isOnDuty);
};

export const getTopPerformers = (limit: number = 5): Staff[] => {
  return [...mockStaff].
  filter((staff) => staff.role === 'waiter').
  sort((a, b) => b.performance.rating - a.performance.rating).
  slice(0, limit);
};