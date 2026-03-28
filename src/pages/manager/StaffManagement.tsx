import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  KeyIcon } from
'lucide-react';
import { Staff, StaffRole, StaffCredentials } from '../../types';
import { addStaffCredential, staffCredentials } from '../../data/staffData';
import { useStaff } from '../../hooks/useStaff';
import { useTables } from '../../hooks/useTables';
import { signUpStaff } from '../../api/auth';
import { updateStaffAssignments, updateStaffStatus, updateStaffRole, deleteStaff } from '../../api/staff';
import { useKPIs } from '../../hooks/useKPIs';
import { createKPI, deleteKPI, assignKPI, unassignKPI } from '../../api/kpis';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { SearchBar } from '../../components/ui/SearchBar';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
export function StaffManagement() {
  const { staff: backendStaff, isLoading, refetch } = useStaff();
  const { kpis, refetch: refetchKPIs } = useKPIs();
  const [searchQuery, setSearchQuery] = useState('');

  const [selectedRole, setSelectedRole] = useState<StaffRole | 'all'>('all');
  const [isCredentialModalOpen, setIsCredentialModalOpen] = useState(false);
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [selectedStaffForCreds, setSelectedStaffForCreds] = useState<Staff | null>(null);
  const [selectedStaffForAssign, setSelectedStaffForAssign] = useState<Staff | null>(null);
  const [assignmentSelection, setAssignmentSelection] = useState<number[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [generatedCredentials, setGeneratedCredentials] = useState<{ staffName: string; username: string; password: string } | null>(null);
  const [isCreatingStaff, setIsCreatingStaff] = useState(false);
  const [addStaffError, setAddStaffError] = useState<string | null>(null);
  const [isKPIModalOpen, setIsKPIModalOpen] = useState(false);
  const [kpiForm, setKpiForm] = useState({
    staffRole: 'waiter' as StaffRole,
    name: '',
    description: '',
    metric: 'orders_served' as 'orders_served' | 'revenue' | 'rating' | 'tables_served' | 'prep_time',
    targetValue: 0,
    period: 'daily' as 'daily' | 'weekly' | 'monthly',
    assignedStaffIds: [] as string[],
  });
  const [addForm, setAddForm] = useState<{
    name: string;
    role: StaffRole;
    email: string;
    phone: string;
    assignedTables: string;
  }>({
    name: '',
    role: 'waiter',
    email: '',
    phone: '',
    assignedTables: ''
  });
  const filteredStaff = backendStaff.filter((s) => {
    const matchesSearch =
    s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = selectedRole === 'all' || s.role === selectedRole;
    return matchesSearch && matchesRole;
  });
  const handleManageCredentials = (staffMember: Staff) => {
    setSelectedStaffForCreds(staffMember);
    const existingCreds = staffCredentials.find(
      (c) => c.staffId === staffMember.id
    );
    if (existingCreds) {
      setNewUsername(existingCreds.username);
      setNewPassword(existingCreds.password);
    } else {
      setNewUsername(staffMember.phone.replace(/\s+/g, ''));
      setNewPassword('');
    }
    setIsCredentialModalOpen(true);
  };
  const handleSaveCredentials = () => {
    if (
    selectedStaffForCreds &&
    newUsername &&
    newPassword)
    {
      const newCred: StaffCredentials = {
        staffId: selectedStaffForCreds.id,
        username: newUsername,
        password: newPassword
      };
      // In a real app, this would be an API call
      // For demo, we just update the local array
      const existingIndex = staffCredentials.findIndex(
        (c) => c.staffId === selectedStaffForCreds.id
      );
      if (existingIndex >= 0) {
        staffCredentials[existingIndex] = newCred;
      } else {
        addStaffCredential(newCred);
      }
      setIsCredentialModalOpen(false);
    }
  };

  const openAssignTablesModal = (staffMember: Staff) => {
    setSelectedStaffForAssign(staffMember);
    setAssignmentSelection(staffMember.assignedTables ?? []);
    setIsAssignModalOpen(true);
  };

  const saveAssignedTables = async () => {
    if (!selectedStaffForAssign) return;
    try {
      await updateStaffAssignments(selectedStaffForAssign.id, assignmentSelection);
      await refetch();
    } catch (err) {
      console.error('Failed to assign tables', err);
    } finally {
      setIsAssignModalOpen(false);
      setSelectedStaffForAssign(null);
      setAssignmentSelection([]);
    }
  };

  const handleCreateKPI = async () => {
    // Validate required fields
    if (!kpiForm.name.trim()) {
      alert('Please enter a KPI name');
      return;
    }
    if (!kpiForm.targetValue || kpiForm.targetValue <= 0) {
      alert('Please enter a valid target value');
      return;
    }
    try {
      await createKPI(kpiForm);
      setIsKPIModalOpen(false);
      setKpiForm({
        staffRole: 'waiter',
        name: '',
        description: '',
        metric: 'orders_served',
        targetValue: 0,
        period: 'daily',
        assignedStaffIds: [],
      });
      refetchKPIs();
    } catch (error) {
      console.error('Failed to create KPI:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-lg">Loading staff...</div>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-100">Staff Management</h1>
            <p className="text-slate-400">
              {backendStaff.filter((s) => s.isOnDuty).length} staff on duty
            </p>
            {generatedCredentials && (
              <div className="mt-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-2 text-xs text-emerald-100">
                <p className="font-semibold text-emerald-200">Credentials generated for {generatedCredentials.staffName}</p>
                <div className="flex flex-col gap-1 mt-1 text-slate-200">
                  <span className="font-medium">Username: <span className="text-emerald-200">{generatedCredentials.username}</span></span>
                  <span className="font-medium">Password: <span className="text-emerald-200">{generatedCredentials.password}</span></span>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      // eslint-disable-next-line @typescript-eslint/no-empty-function
                      navigator.clipboard.writeText(`Username: ${generatedCredentials.username}\nPassword: ${generatedCredentials.password}`).catch(() => {});
                    }}
                  >
                    Copy credentials
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setGeneratedCredentials(null)}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}
          </div>
          <Button variant="primary" onClick={() => setIsAddStaffOpen(true)}>
            <PlusIcon className="w-5 h-5" />
            Add Staff
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-4 mb-6">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search staff..."
            className="md:w-80" />

          <div className="flex-1">
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedRole === 'all' ? 'primary' : 'secondary'}
                onClick={() => setSelectedRole('all')}>

                All Roles
              </Button>
              <Button
                variant={selectedRole === 'waiter' ? 'primary' : 'secondary'}
                onClick={() => setSelectedRole('waiter')}>

                Waiters
              </Button>
              <Button
                variant={selectedRole === 'kitchen' ? 'primary' : 'secondary'}
                onClick={() => setSelectedRole('kitchen')}>

                Kitchen
              </Button>
              <Button
                variant={selectedRole === 'supervisor' ? 'primary' : 'secondary'}
                onClick={() => setSelectedRole('supervisor')}>

                Supervisors
              </Button>
              <Button
                variant={selectedRole === 'manager' ? 'primary' : 'secondary'}
                onClick={() => setSelectedRole('manager')}>

                Managers
              </Button>
            </div>
          </div>
        </div>

        {/* Staff Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredStaff.map((member) =>
            <motion.div
              key={member.id}
              layout
              initial={{
                opacity: 0,
                scale: 0.9
              }}
              animate={{
                opacity: 1,
                scale: 1
              }}
              exit={{
                opacity: 0,
                scale: 0.9
              }}>

                <Card className="bg-slate-800 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-white font-medium text-lg">
                        {member.name.
                      split(' ').
                      map((n) => n[0]).
                      join('')}
                      </div>
                      <div>
                        <h3 className="font-semibold text-gray-100">
                          {member.name}
                        </h3>
                        <p className="text-sm text-slate-400 capitalize">
                          {member.role}
                        </p>
                      </div>
                    </div>
                    <Badge
                    variant={member.isOnDuty ? 'ready' : 'served'}
                    size="sm">

                      {member.isOnDuty ? 'On Duty' : 'Off Duty'}
                    </Badge>
                  </div>

                  <div className="space-y-2 mb-4 text-sm text-slate-300 min-h-[80px]">
                    <p>📧 {member.email}</p>
                    <p>📱 {member.phone}</p>
                    <div className="flex items-center gap-2">
                      <label className="text-slate-400 text-xs">Role:</label>
                      <select
                        value={member.role}
                        onChange={async (e) => {
                          const newRole = e.target.value as StaffRole;
                          try {
                            await updateStaffRole(member.id, newRole);
                            await refetch();
                          } catch (err) {
                            console.error('Failed to update role', err);
                          }
                        }}
                        className="rounded-lg bg-slate-700 px-2 py-1 text-xs text-white border border-slate-600"
                      >
                        <option value="waiter">Waiter</option>
                        <option value="kitchen">Kitchen</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="manager">Manager</option>
                      </select>
                    </div>
                    {member.role === 'waiter' && (
                  <p className="text-xs">
                        🍽️ Tables:{' '}
                        {member.assignedTables.length > 0 ?
                    member.assignedTables.join(', ') :
                    'None'}
                      </p>
                    )}
                    {member.role !== 'waiter' && (
                      <p className="text-xs text-slate-600">-</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-700 mt-auto">
                    <Button
                      variant={member.isOnDuty ? 'danger' : 'secondary'}
                      size="sm"
                      onClick={async () => {
                        try {
                          await updateStaffStatus(member.id, !member.isOnDuty);
                          await refetch();
                        } catch (err) {
                          console.error('Failed to update on-duty status', err);
                        }
                      }}
                    >
                      {member.isOnDuty ? 'Off Duty' : 'On Duty'}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleManageCredentials(member)}>
                      <KeyIcon className="w-3 h-3" />
                      <span className="hidden sm:inline">Credentials</span>
                    </Button>
                    {member.role === 'waiter' && (
                      <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => openAssignTablesModal(member)}>
                        <span className="hidden sm:inline">Assign </span>Tables
                      </Button>
                    )}
                    <div className="flex gap-1 ml-auto">
                      <Button variant="ghost" size="sm" className="p-1.5">
                        <EditIcon className="w-3.5 h-3.5" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        className="p-1.5 text-red-400 hover:text-red-300"
                        onClick={async () => {
                          if (window.confirm(`Are you sure you want to delete ${member.name}?`)) {
                            try {
                              await deleteStaff(member.id);
                              await refetch();
                            } catch (err: any) {
                              console.error('Failed to delete staff', err);
                              alert(err.message || 'Failed to delete staff member');
                            }
                          }
                        }}
                      >
                        <TrashIcon className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {generatedCredentials ? (
          <div className="mb-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-emerald-100">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-emerald-200">New staff credentials generated for {generatedCredentials.staffName}.</p>
                <div className="mt-1 text-xs text-emerald-100">
                  <p>Username: <span className="font-semibold text-gray-100">{generatedCredentials.username}</span></p>
                  <p>Password: <span className="font-semibold text-gray-100">{generatedCredentials.password}</span></p>
                </div>
              </div>
              <button
                onClick={() => setGeneratedCredentials(null)}
                className="text-emerald-100 hover:text-white text-xs rounded-md bg-emerald-500/20 px-2 py-1"
              >Clear</button>
            </div>
          </div>
        ) : null}

        {filteredStaff.length === 0 &&
        <div className="text-center py-12">
            <span className="text-4xl block mb-3">👥</span>
            <p className="text-slate-400">No staff found</p>
          </div>
        }

        {/* KPIs Section */}
        <div className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-white">Staff KPIs</h2>
            <Button variant="primary" onClick={() => setIsKPIModalOpen(true)}>
              <PlusIcon className="w-5 h-5" />
              Create KPI
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {kpis.length === 0 ? (
              <Card className="p-4">
                <p className="text-slate-400">No KPIs created yet. Create one to get started.</p>
              </Card>
            ) : (
              kpis.map((kpi) => (
                <Card key={kpi.id} className="p-4 bg-slate-800 border-slate-700">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold text-white">{kpi.name}</h3>
                      <p className="text-sm text-slate-400">{kpi.description || 'No description'}</p>
                      <div className="mt-2 flex gap-2">
                        <Badge variant="primary">{kpi.staff_role}</Badge>
                        <Badge variant="secondary">{kpi.period}</Badge>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-2">
                      <p className="text-lg font-bold text-amber-500">{kpi.target_value}</p>
                      <p className="text-xs text-slate-400">Target</p>
                      <Button 
                        variant="danger" 
                        size="sm"
                        onClick={async () => {
                          if (window.confirm(`Are you sure you want to delete the KPI "${kpi.name}"?`)) {
                            try {
                              await deleteKPI(kpi.id);
                              await refetchKPIs();
                            } catch (err: any) {
                              console.error('Failed to delete KPI', err);
                              alert(err.message || 'Failed to delete KPI');
                            }
                          }
                        }}
                      >
                        <TrashIcon className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  {kpi.assigned_staff_ids && kpi.assigned_staff_ids.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-700">
                      <p className="text-xs text-slate-400">Assigned to: {kpi.assigned_staff_ids.length} staff member(s)</p>
                    </div>
                  )}
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Credentials Modal */}
        <Modal
          isOpen={isCredentialModalOpen}
          onClose={() => setIsCredentialModalOpen(false)}
          title={`Manage Access: ${selectedStaffForCreds?.name}`}
          variant="light">

          <div className="space-y-4">
            <p className="text-sm text-slate-600 mb-4">
              Set up login credentials for this staff member to access their
              portal.
            </p>

            <Input
              label="Username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="e.g. john.doe" />


            <Input
              label="New Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password" />


            <div className="flex gap-3 pt-4">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setIsCredentialModalOpen(false)}>

                Cancel
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={handleSaveCredentials}
                disabled={!newUsername || !newPassword}>

                Save Credentials
              </Button>
            </div>
          </div>
        </Modal>

        {/* Add Staff Modal */}
        <Modal
          isOpen={isAddStaffOpen}
          onClose={() => setIsAddStaffOpen(false)}
          title="Add Staff Member"
          variant="dark"
        >
          <div className="space-y-4">
            <Input
              label="Full Name"
              value={addForm.name}
              onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Aline Mukamana"
            />
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Role
              </label>
              <select
                value={addForm.role}
                onChange={(e) =>
                  setAddForm((p) => ({ ...p, role: e.target.value as StaffRole }))
                }
                className="w-full px-4 py-2 rounded-lg bg-white border border-slate-100 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              >
                <option value="waiter">Waiter</option>
                <option value="kitchen">Kitchen</option>
                <option value="supervisor">Supervisor</option>
                <option value="manager">Manager</option>
              </select>
            </div>
            <Input
              label="Email"
              value={addForm.email}
              onChange={(e) => setAddForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="e.g. aline@servv.rw"
            />
            <Input
              label="Phone"
              value={addForm.phone}
              onChange={(e) => setAddForm((p) => ({ ...p, phone: e.target.value }))}
              placeholder="e.g. +250 78 123 4567"
            />
            {addForm.role === 'waiter' && (
              <Input
                label="Assigned Tables (comma separated)"
                value={addForm.assignedTables}
                onChange={(e) =>
                  setAddForm((p) => ({ ...p, assignedTables: e.target.value }))
                }
                placeholder="e.g. 1,2,3"
              />
            )}

            {addStaffError && (
              <div className="rounded-md bg-red-500/15 border border-red-500 text-red-600 px-3 py-2 text-sm">
                {addStaffError}
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setIsAddStaffOpen(false)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={async () => {
                  setAddStaffError(null);
                  setIsCreatingStaff(true);
                  if (!addForm.name || !addForm.email || !addForm.phone) {
                    setAddStaffError('Name, email, and phone are required.');
                    setIsCreatingStaff(false);
                    return;
                  }
                  const username = addForm.email.split('@')[0] + Date.now().toString().slice(-3);
                  const password = `Rw${Math.random().toString(36).slice(2, 8)}!`;
                  try {
                    const staff = await signUpStaff({
                      name: addForm.name,
                      role: addForm.role,
                      email: addForm.email,
                      phone: addForm.phone,
                      username,
                      password
                    });

                    const assignedTables =
                      addForm.role === 'waiter'
                        ? addForm.assignedTables
                            .split(',')
                            .map((s) => parseInt(s.trim(), 10))
                            .filter((n) => !Number.isNaN(n))
                        : [];

                    addStaffCredential({ staffId: staff.id, username, password });
                    setSelectedStaffForCreds({
                      ...staff,
                      assignedTables,
                      performance: staff.performance ?? {
                        ordersServed: 0,
                        avgServiceTime: 0,
                        rating: 5,
                        totalRevenue: 0,
                        shiftsThisWeek: 0
                      }
                    });
                    setNewUsername(username);
                    setNewPassword(password);
                    setIsAddStaffOpen(false);
                    setIsCredentialModalOpen(true);
                    setAddForm({
                      name: '',
                      role: 'waiter',
                      email: '',
                      phone: '',
                      assignedTables: ''
                    });
                    setGeneratedCredentials({
                      staffName: staff.name,
                      username,
                      password
                    });
                    await refetch();
                  } catch (error) {
                    console.error('Failed to create staff', error);
                    let message = 'Failed to create staff. Please try again.';
                    if ((error as any)?.status === 403) {
                      message = 'Unauthorized: please login as manager or refresh the page.';
                    } else if ((error as any)?.status === 409) {
                      message = 'Username or email already exists. Please use different values.';
                    }
                    setAddStaffError(message);
                  } finally {
                    setIsCreatingStaff(false);
                  }
                }}
                disabled={!addForm.name || !addForm.email || !addForm.phone || isCreatingStaff}
              >
                Create + Generate Login
              </Button>
            </div>
          </div>
        </Modal>

        {/* KPI Modal */}
        <Modal
          isOpen={isKPIModalOpen}
          onClose={() => setIsKPIModalOpen(false)}
          title="Create New KPI"
          variant="light"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Staff Role</label>
              <select
                value={kpiForm.staffRole}
                onChange={(e) => setKpiForm(prev => ({ ...prev, staffRole: e.target.value as StaffRole }))}
                className="w-full px-3 py-2 bg-white border border-slate-100 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
                <option value="waiter">Waiter</option>
                <option value="kitchen">Kitchen</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </div>

            <Input
              label="KPI Name"
              value={kpiForm.name}
              onChange={(e) => setKpiForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Orders Served per Day" />

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                value={kpiForm.description}
                onChange={(e) => setKpiForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 bg-white border border-slate-100 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                rows={3}
                placeholder="Optional description" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Metric</label>
              <select
                value={kpiForm.metric}
                onChange={(e) => setKpiForm(prev => ({ ...prev, metric: e.target.value as any }))}
                className="w-full px-3 py-2 bg-white border border-slate-100 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
                <option value="orders_served">Orders Served</option>
                <option value="revenue">Revenue</option>
                <option value="rating">Rating</option>
                <option value="tables_served">Tables Served</option>
                <option value="prep_time">Prep Time</option>
              </select>
            </div>

            <Input
              label="Target Value"
              type="number"
              value={kpiForm.targetValue}
              onChange={(e) => setKpiForm(prev => ({ ...prev, targetValue: parseFloat(e.target.value) || 0 }))}
              placeholder="e.g. 50" />

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Period</label>
              <select
                value={kpiForm.period}
                onChange={(e) => setKpiForm(prev => ({ ...prev, period: e.target.value as any }))}
                className="w-full px-3 py-2 bg-white border border-slate-100 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Assign to Staff (Optional)</label>
              <select
                multiple
                value={kpiForm.assignedStaffIds}
                onChange={(e) => {
                  const selected = Array.from(e.target.selectedOptions, option => option.value);
                  setKpiForm(prev => ({ ...prev, assignedStaffIds: selected }));
                }}
                className="w-full px-3 py-2 bg-white border border-slate-100 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 min-h-[100px]">
                {backendStaff
                  .filter(s => s.role === kpiForm.staffRole)
                  .map(staffMember => (
                    <option key={staffMember.id} value={staffMember.id}>
                      {staffMember.name}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">Hold Ctrl/Cmd to select multiple staff members</p>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setIsKPIModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={handleCreateKPI}
                disabled={!kpiForm.name || kpiForm.targetValue <= 0}>
                Create KPI
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>);

}