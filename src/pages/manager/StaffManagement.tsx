import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PlusIcon,
  SearchIcon,
  EditIcon,
  TrashIcon,
  KeyIcon } from
'lucide-react';
import { Staff, StaffRole, StaffCredentials } from '../../types';
import {
  mockStaff,
  staffCredentials,
  addStaffCredential } from
'../../data/staffData';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { SearchBar } from '../../components/ui/SearchBar';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
export function StaffManagement() {
  const [staff, setStaff] = useState<Staff[]>(mockStaff);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<StaffRole | 'all'>('all');
  const [isCredentialModalOpen, setIsCredentialModalOpen] = useState(false);
  const [isAddStaffOpen, setIsAddStaffOpen] = useState(false);
  const [selectedStaffForCreds, setSelectedStaffForCreds] =
  useState<Staff | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
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
  const filteredStaff = staff.filter((s) => {
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
  return (
    <div className="dark min-h-screen bg-slate-900 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Staff Management</h1>
            <p className="text-slate-400">
              {staff.filter((s) => s.isOnDuty).length} staff on duty
            </p>
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

                <Card className="bg-slate-800">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-slate-700 flex items-center justify-center text-white font-medium text-lg">
                        {member.name.
                      split(' ').
                      map((n) => n[0]).
                      join('')}
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">
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

                  <div className="space-y-2 mb-4 text-sm text-slate-300">
                    <p>📧 {member.email}</p>
                    <p>📱 {member.phone}</p>
                    {member.role === 'waiter' &&
                  <p>
                        🍽️ Tables:{' '}
                        {member.assignedTables.length > 0 ?
                    member.assignedTables.join(', ') :
                    'None'}
                      </p>
                  }
                  </div>

                  <div className="flex gap-2 pt-4 border-t border-slate-700">
                    <Button
                    variant="secondary"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleManageCredentials(member)}>

                      <KeyIcon className="w-4 h-4" />
                      Login Access
                    </Button>
                    <Button variant="secondary" size="sm">
                      <EditIcon className="w-4 h-4" />
                    </Button>
                  </div>
                </Card>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {filteredStaff.length === 0 &&
        <div className="text-center py-12">
            <span className="text-4xl block mb-3">👥</span>
            <p className="text-slate-400">No staff found</p>
          </div>
        }

        {/* Credentials Modal */}
        <Modal
          isOpen={isCredentialModalOpen}
          onClose={() => setIsCredentialModalOpen(false)}
          title={`Manage Access: ${selectedStaffForCreds?.name}`}>

          <div className="space-y-4">
            <p className="text-sm text-slate-400 mb-4">
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
        >
          <div className="space-y-4">
            <Input
              label="Full Name"
              value={addForm.name}
              onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="e.g. Aline Mukamana"
            />
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Role
              </label>
              <select
                value={addForm.role}
                onChange={(e) =>
                  setAddForm((p) => ({ ...p, role: e.target.value as StaffRole }))
                }
                className="w-full px-4 py-2 rounded-lg bg-slate-700 border border-slate-600 text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
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
              placeholder="e.g. aline@serv.rw"
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
                onClick={() => {
                  if (!addForm.name || !addForm.email || !addForm.phone) return;
                  const id = `staff-${Date.now()}`;
                  const assignedTables =
                    addForm.role === 'waiter'
                      ? addForm.assignedTables
                          .split(',')
                          .map((s) => parseInt(s.trim(), 10))
                          .filter((n) => !Number.isNaN(n))
                      : [];
                  const newStaff: Staff = {
                    id,
                    name: addForm.name,
                    role: addForm.role,
                    email: addForm.email,
                    phone: addForm.phone,
                    isOnDuty: true,
                    assignedTables,
                    performance: {
                      ordersServed: 0,
                      avgServiceTime: 0,
                      rating: 5,
                      totalRevenue: 0,
                      shiftsThisWeek: 0
                    },
                    hireDate: new Date()
                  };

                  setStaff((prev) => [newStaff, ...prev]);

                  const username = addForm.phone.replace(/\s+/g, '');
                  const password = `Rw${Math.random().toString(36).slice(2, 8)}!`;
                  addStaffCredential({ staffId: id, username, password });

                  setSelectedStaffForCreds(newStaff);
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
                }}
                disabled={!addForm.name || !addForm.email || !addForm.phone}
              >
                Create + Generate Login
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </div>);

}