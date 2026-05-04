import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusIcon,
  EditIcon,
  TrashIcon,
  KeyIcon,
  ChevronDownIcon } from
'lucide-react';
import { Staff, StaffRole, StaffCredentials } from '../../types';
import { addStaffCredential, staffCredentials } from '../../data/staffData';
import { useStaff } from '../../hooks/useStaff';
import { useTables } from '../../hooks/useTables';
import { signUpStaff } from '../../api/auth';
import { updateStaffAssignments, updateStaffStatus, updateStaffRole, deleteStaff } from '../../api/staff';
import { useKPIs } from '../../hooks/useKPIs';
import { createKPI, updateKPI, deleteKPI, assignKPI, unassignKPI } from '../../api/kpis';
import { fetchOrdersByDateRange } from '../../api/orders';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { SearchBar } from '../../components/ui/SearchBar';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
interface StaffManagementProps {
  onShowPerformance?: () => void;
}

export function StaffManagement({ onShowPerformance }: StaffManagementProps) {
  const { staff: backendStaff, isLoading, refetch } = useStaff();
  const { tables } = useTables();
  const availableTables = tables.length > 0 ? [...new Set(tables)].sort((a, b) => a - b) : Array.from({ length: 20 }, (_, idx) => idx + 1);
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
  const [isEditKPIOpen, setIsEditKPIOpen] = useState(false);
  const [editingKPI, setEditingKPI] = useState<any>(null);
  const [kpiForm, setKpiForm] = useState({
    selectedStaffId: '' as string,
    staffRole: 'waiter' as StaffRole,
    name: '',
    description: '',
    metric: 'orders_served' as 'orders_served' | 'revenue' | 'rating' | 'tables_served' | 'prep_time',
    targetValue: 0,
    period: 'daily' as 'daily' | 'weekly' | 'monthly',
    assignedStaffIds: [] as string[],
  });
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());
  const toggleStaffExpanded = (staffId: string) => {
    setExpandedStaff(prev => {
      const next = new Set(prev);
      if (next.has(staffId)) {
        next.delete(staffId);
      } else {
        next.add(staffId);
      }
      return next;
    });
  };
  const [kpiProgress, setKpiProgress] = useState<Record<string, number>>({});

  const getDateRange = (period: string) => {
    const now = new Date();
    let start: Date;
    if (period === 'daily') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'weekly') {
      start = new Date(now);
      start.setDate(start.getDate() - start.getDay());
      start.setHours(0, 0, 0, 0);
    } else {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    return { startDate: start.toISOString(), endDate: now.toISOString() };
  };

  const computeProgress = async (staffId: string, metric: string, period: string): Promise<number> => {
    try {
      const { startDate, endDate } = getDateRange(period);
      const orders = await fetchOrdersByDateRange(startDate, endDate);
      const staffOrders = orders.filter(o => o.createdBy === staffId || o.assignedTo === staffId);
      switch (metric) {
        case 'orders_served':
          return staffOrders.filter(o => o.status === 'served').length;
        case 'revenue':
          return staffOrders.filter(o => o.status === 'served').reduce((sum, o) => sum + o.total, 0);
        case 'tables_served':
          return new Set(staffOrders.filter(o => o.status === 'served').map(o => o.tableNumber).filter(Boolean)).size;
        case 'prep_time': {
          const completed = staffOrders.filter(o => o.completedAt && o.createdAt);
          if (completed.length === 0) return 0;
          const totalMinutes = completed.reduce((sum, o) => {
            return sum + (new Date(o.completedAt!).getTime() - new Date(o.createdAt).getTime()) / 60000;
          }, 0);
          return Math.round(totalMinutes / completed.length);
        }
        default:
          return 0;
      }
    } catch {
      return 0;
    }
  };

  useEffect(() => {
    if (kpis.length === 0 || backendStaff.length === 0) return;
    let cancelled = false;
    const fetchAll = async () => {
      const results: Record<string, number> = {};
      const promises: Promise<void>[] = [];
      for (const member of backendStaff) {
        const memberKPIs = kpis.filter(k => {
          const roleMatch = k.staff_role === member.role;
          const assignedTo = !k.assigned_staff_ids || k.assigned_staff_ids.length === 0 || k.assigned_staff_ids.includes(member.id);
          return roleMatch && assignedTo;
        });
        for (const kpi of memberKPIs) {
          const key = `${member.id}-${kpi.id}`;
          promises.push(
            computeProgress(member.id, kpi.metric, kpi.period).then(value => {
              if (!cancelled) results[key] = value;
            })
          );
        }
      }
      await Promise.all(promises);
      if (!cancelled) setKpiProgress(results);
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [kpis, backendStaff]);
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

  const toggleTableAssignment = (tableNumber: number) => {
    setAssignmentSelection((prev) =>
      prev.includes(tableNumber)
        ? prev.filter((n) => n !== tableNumber)
        : [...prev, tableNumber].sort((a, b) => a - b)
    );
  };

  const saveAssignedTables = async () => {
    if (!selectedStaffForAssign) return;
    console.log('[saveAssignedTables] Staff ID:', selectedStaffForAssign.id, 'Tables:', assignmentSelection);
    try {
      const result = await updateStaffAssignments(selectedStaffForAssign.id, assignmentSelection);
      console.log('[saveAssignedTables] Result:', result);
      await refetch();
      setIsAssignModalOpen(false);
      setSelectedStaffForAssign(null);
      setAssignmentSelection([]);
      alert('Tables assigned successfully!');
    } catch (err) {
      console.error('[saveAssignedTables] Failed to assign tables:', err);
      alert('Failed to assign tables. Please try again.');
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
        selectedStaffId: '',
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
    <div className="dark min-h-screen bg-slate-900 p-3 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-bold text-gray-100">Staff Management</h1>
                <p className="text-slate-400">
                  {backendStaff.filter((s) => s.isOnDuty).length} staff on duty
                </p>
              </div>
              {onShowPerformance && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3 sm:mt-0"
                  onClick={onShowPerformance}
                >
                  View Staff Performance
                </Button>
              )}
            </div>
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
          <Button variant="primary" size="sm" onClick={() => setIsAddStaffOpen(true)}>
            <PlusIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Add Staff</span>
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <SearchBar
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search staff..."
            className="sm:w-80" />

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
        <div className="grid sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
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
                        <option value="cashier">Cashier</option>
                        <option value="kitchen">Kitchen</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="manager">Manager</option>
                      </select>
                    </div>
                    {member.role === 'waiter' && (
                      <div className="bg-slate-700/50 rounded-lg p-2 border border-amber-500/20">
                        <p className="text-xs text-slate-300 mb-1.5 font-medium">🍽️ Assigned Tables</p>
                        {member.assignedTables && member.assignedTables.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {member.assignedTables.sort((a, b) => a - b).map((tableNum) => (
                              <span key={tableNum} className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-xs font-medium border border-amber-500/40">
                                T{tableNum}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400 italic">No tables assigned</p>
                        )}
                      </div>
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
                        variant="primary"
                        size="sm"
                        onClick={() => openAssignTablesModal(member)}
                        className="flex items-center gap-2">
                        <span>🍽️</span>
                        <span className="hidden sm:inline">Assign Tables</span>
                        <span className="sm:hidden">Tables</span>
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

          {backendStaff.map((member) => {
            const memberKPIs = kpis.filter(k => {
              const roleMatch = k.staff_role === member.role;
              const assignedTo = !k.assigned_staff_ids || k.assigned_staff_ids.length === 0 || k.assigned_staff_ids.includes(member.id);
              return roleMatch && assignedTo;
            });
            const isExpanded = expandedStaff.has(member.id);
            return (
              <Card key={member.id} className="bg-slate-800 border-slate-700 overflow-hidden">
                <button
                  onClick={() => toggleStaffExpanded(member.id)}
                  className="w-full flex items-center justify-between p-4 hover:bg-slate-700/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-medium">
                      {member.name.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="text-left">
                      <h3 className="text-base font-semibold text-white">{member.name}</h3>
                      <p className="text-xs text-slate-400 capitalize">{member.role}</p>
                    </div>
                    <Badge variant="count">{memberKPIs.length}</Badge>
                  </div>
                  <motion.div
                    animate={{ rotate: isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDownIcon className="w-5 h-5 text-slate-400" />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      {memberKPIs.length === 0 ? (
                        <div className="px-4 pb-4 text-slate-400 text-sm">
                          No KPIs assigned to {member.name} yet.
                        </div>
                      ) : (
                        <div className="border-t border-slate-700">
                          <table className="w-full">
                            <thead>
                              <tr className="text-xs text-slate-400 text-left">
                                <th className="px-3 py-2 font-medium">Name</th>
                                <th className="px-3 py-2 font-medium">Metric</th>
                                <th className="px-3 py-2 font-medium hidden sm:table-cell">Period</th>
                                <th className="px-3 py-2 font-medium min-w-[140px]">Progress</th>
                                <th className="px-3 py-2 font-medium text-right">Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {memberKPIs.map((kpi) => {
                                const current = kpiProgress[`${member.id}-${kpi.id}`] ?? 0;
                                const target = kpi.target_value;
                                const pct = target > 0 ? Math.min(Math.round((current / target) * 100), 100) : 0;
                                const barColor = pct >= 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
                                return (
                                <tr key={kpi.id} className="border-t border-slate-700/50 hover:bg-slate-700/30">
                                  <td className="px-3 py-3">
                                    <p className="text-sm font-medium text-white">{kpi.name}</p>
                                    {kpi.description && (
                                      <p className="text-xs text-slate-400 mt-0.5">{kpi.description}</p>
                                    )}
                                  </td>
                                  <td className="px-3 py-3">
                                    <Badge variant="secondary" size="sm">{kpi.metric.replace(/_/g, ' ')}</Badge>
                                  </td>
                                  <td className="px-3 py-3 hidden sm:table-cell">
                                    <Badge variant="primary" size="sm">{kpi.period}</Badge>
                                  </td>
                                  <td className="px-3 py-3">
                                    <div className="flex items-center gap-2">
                                      <div className="flex-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                                        <div
                                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                                          style={{ width: `${pct}%` }}
                                        />
                                      </div>
                                      <span className="text-xs text-slate-300 whitespace-nowrap">
                                        {current} / {target}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 mt-1">{pct}% of target</p>
                                  </td>
                                  <td className="px-3 py-3">
                                    <div className="flex gap-1 justify-end">
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => {
                                          setEditingKPI(kpi);
                                          const assignedId = kpi.assigned_staff_ids && kpi.assigned_staff_ids.length > 0 ? kpi.assigned_staff_ids[0] : '';
                                          setKpiForm({
                                            selectedStaffId: assignedId,
                                            staffRole: kpi.staff_role as StaffRole,
                                            name: kpi.name,
                                            description: kpi.description || '',
                                            metric: kpi.metric as any,
                                            targetValue: kpi.target_value,
                                            period: kpi.period as any,
                                            assignedStaffIds: kpi.assigned_staff_ids || [],
                                          });
                                          setIsEditKPIOpen(true);
                                        }}>
                                        <EditIcon className="w-4 h-4" />
                                      </Button>
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
                                        }}>
                                        <TrashIcon className="w-4 h-4" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })}
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
                <option value="cashier">Cashier</option>
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

        {/* Assign Tables Modal */}
        <Modal
          isOpen={isAssignModalOpen}
          onClose={() => setIsAssignModalOpen(false)}
          title={`Assign Tables to ${selectedStaffForAssign?.name ?? 'Staff'}`}
          variant="dark"
        >
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Select one or more tables to assign to this waiter.
            </p>
            
            {/* Current Assignment Info */}
            {selectedStaffForAssign?.assignedTables && selectedStaffForAssign.assignedTables.length > 0 && (
              <div className="rounded-lg border border-blue-500/25 bg-blue-500/10 p-3">
                <p className="text-xs font-semibold text-blue-300 mb-2">Currently Assigned:</p>
                <div className="flex flex-wrap gap-1.5">
                  {selectedStaffForAssign.assignedTables.sort((a, b) => a - b).map((t) => (
                    <span key={t} className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-600/40 text-blue-200 text-xs font-medium">
                      T{t}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* New Selection Info */}
            {assignmentSelection.length > 0 && (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3">
                <p className="text-xs font-semibold text-amber-300 mb-2">Will Be Assigned ({assignmentSelection.length}):</p>
                <div className="flex flex-wrap gap-1.5">
                  {assignmentSelection.sort((a, b) => a - b).map((t) => (
                    <span key={t} className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-600/40 text-amber-200 text-xs font-medium">
                      T{t}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {availableTables.map((tableNumber) => {
                const selected = assignmentSelection.includes(tableNumber);
                return (
                  <button
                    key={tableNumber}
                    type="button"
                    onClick={() => toggleTableAssignment(tableNumber)}
                    className={`rounded-2xl border p-3 text-left transition-colors ${selected ? 'border-amber-400 bg-amber-500/10 text-amber-100 shadow-sm shadow-amber-500/10' : 'border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-500'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">Table {tableNumber}</span>
                      {selected && <span className="rounded-full bg-amber-500/20 px-2 py-1 text-amber-200 text-xs">✓ Selected</span>}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-950/50 p-3 text-sm text-slate-400">
              Tip: if the table list is empty, add tables from the QR code manager or the table management screen.
            </div>
            <div className="flex gap-3 pt-4">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setIsAssignModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={saveAssignedTables}
                disabled={!selectedStaffForAssign}
              >
                Save Assignments
              </Button>
            </div>
          </div>
        </Modal>

        {/* KPI Modal */}
        <Modal
          isOpen={isKPIModalOpen}
          onClose={() => setIsKPIModalOpen(false)}
          title="Create New KPI"
          variant="dark"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1">Staff Member</label>
              <select
                value={kpiForm.selectedStaffId}
                onChange={(e) => {
                  const staffId = e.target.value;
                  const member = backendStaff.find(s => s.id === staffId);
                  setKpiForm(prev => ({
                    ...prev,
                    selectedStaffId: staffId,
                    staffRole: member ? member.role as StaffRole : prev.staffRole,
                    assignedStaffIds: staffId ? [staffId] : [],
                  }));
                }}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
                <option value="">Select a staff member</option>
                {backendStaff.map(member => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.role})
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="KPI Name"
              value={kpiForm.name}
              onChange={(e) => setKpiForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Orders Served per Day"
              className="bg-slate-700 border-slate-600 text-white" />

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1">Description</label>
              <textarea
                value={kpiForm.description}
                onChange={(e) => setKpiForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                rows={3}
                placeholder="Optional description" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1">Metric</label>
              <select
                value={kpiForm.metric}
                onChange={(e) => setKpiForm(prev => ({ ...prev, metric: e.target.value as any }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
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
              value={kpiForm.targetValue === 0 ? '' : kpiForm.targetValue}
              onChange={(e) => setKpiForm(prev => ({ ...prev, targetValue: parseFloat(e.target.value) || 0 }))}
              placeholder="e.g. 50"
              className="bg-slate-700 border-slate-600 text-white" />

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1">Period</label>
              <select
                value={kpiForm.period}
                onChange={(e) => setKpiForm(prev => ({ ...prev, period: e.target.value as any }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
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
                disabled={!kpiForm.selectedStaffId || !kpiForm.name || kpiForm.targetValue <= 0}>
                Create KPI
              </Button>
            </div>
          </div>
        </Modal>

        {/* Edit KPI Modal */}
        <Modal
          isOpen={isEditKPIOpen}
          onClose={() => setIsEditKPIOpen(false)}
          title="Edit KPI"
          variant="dark"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1">Staff Member</label>
              <select
                value={kpiForm.selectedStaffId}
                onChange={(e) => {
                  const staffId = e.target.value;
                  const member = backendStaff.find(s => s.id === staffId);
                  setKpiForm(prev => ({
                    ...prev,
                    selectedStaffId: staffId,
                    staffRole: member ? member.role as StaffRole : prev.staffRole,
                    assignedStaffIds: staffId ? [staffId] : [],
                  }));
                }}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
                <option value="">Select a staff member</option>
                {backendStaff.map(member => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.role})
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="KPI Name"
              value={kpiForm.name}
              onChange={(e) => setKpiForm(prev => ({ ...prev, name: e.target.value }))}
              placeholder="e.g. Orders Served per Day"
              className="bg-slate-700 border-slate-600 text-white" />

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1">Description</label>
              <textarea
                value={kpiForm.description}
                onChange={(e) => setKpiForm(prev => ({ ...prev, description: e.target.value }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                rows={3}
                placeholder="Optional description" />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1">Metric</label>
              <select
                value={kpiForm.metric}
                onChange={(e) => setKpiForm(prev => ({ ...prev, metric: e.target.value as any }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
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
              value={kpiForm.targetValue === 0 ? '' : kpiForm.targetValue}
              onChange={(e) => setKpiForm(prev => ({ ...prev, targetValue: parseFloat(e.target.value) || 0 }))}
              placeholder="e.g. 50"
              className="bg-slate-700 border-slate-600 text-white" />

            <div>
              <label className="block text-sm font-medium text-slate-200 mb-1">Period</label>
              <select
                value={kpiForm.period}
                onChange={(e) => setKpiForm(prev => ({ ...prev, period: e.target.value as any }))}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setIsEditKPIOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                fullWidth
                onClick={async () => {
                  if (!kpiForm.name.trim()) {
                    alert('Please enter a KPI name');
                    return;
                  }
                  if (!kpiForm.targetValue || kpiForm.targetValue <= 0) {
                    alert('Please enter a valid target value');
                    return;
                  }
                  try {
                    await updateKPI(editingKPI.id, {
                      staffRole: kpiForm.staffRole,
                      name: kpiForm.name,
                      description: kpiForm.description,
                      metric: kpiForm.metric,
                      targetValue: kpiForm.targetValue,
                      period: kpiForm.period,
                      assignedStaffIds: kpiForm.assignedStaffIds,
                    });
                    setIsEditKPIOpen(false);
                    setEditingKPI(null);
                    refetchKPIs();
                  } catch (error: any) {
                    console.error('Failed to update KPI:', error);
                    alert(error?.message || 'Failed to update KPI');
                  }
                }}
                disabled={!kpiForm.selectedStaffId || !kpiForm.name || kpiForm.targetValue <= 0}>
                Update KPI
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>);

}