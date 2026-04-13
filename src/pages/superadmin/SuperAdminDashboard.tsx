import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Building2, Users, TrendingUp, Lock, QrCode, ChevronDown } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { changePassword, signUpStaff } from '../../api/auth';
import { fetchRestaurants, createRestaurant, updateRestaurant, deleteRestaurant, type Restaurant } from '../../api/restaurants';
import { isAdminConfigured } from '../../lib/supabase';
import { fetchTablesForRestaurant, deleteTable } from '../../api/tables';

interface Table {
  id: string;
  tableNumber: number;
  name: string;
  capacity: number;
  location: string;
  restaurantId: string;
}

interface SuperAdminDashboardProps {
  onNavigate: (page: 'dashboard' | 'restaurants' | 'analytics') => void;
}

export function SuperAdminDashboard({ onNavigate }: SuperAdminDashboardProps) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [selectedRestaurantId, setSelectedRestaurantId] = useState<string | null>(null);
  const [restaurantTables, setRestaurantTables] = useState<Table[]>([]);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [isPasswordLoading, setIsPasswordLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    managerName: '',
    managerEmail: '',
    managerPhone: '',
    managerUsername: '',
    managerPassword: ''
  });

  useEffect(() => {
    loadRestaurants();
  }, []);

  const loadRestaurants = async () => {
    setIsLoading(true);
    try {
      const data = await fetchRestaurants();
      setRestaurants(data);
    } catch (error) {
      console.error('Failed to load restaurants:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadTablesForRestaurant = async (restaurantId: string) => {
    setIsLoadingTables(true);
    try {
      const tables = await fetchTablesForRestaurant(restaurantId);
      setRestaurantTables(tables);
    } catch (error) {
      console.error('Failed to load tables:', error);
      setRestaurantTables([]);
    } finally {
      setIsLoadingTables(false);
    }
  };

  const handleViewTables = async (restaurantId: string) => {
    setSelectedRestaurantId(restaurantId);
    await loadTablesForRestaurant(restaurantId);
  };

  const handleDeleteTable = async (tableId: string) => {
    if (!confirm('Are you sure you want to delete this QR code/table?')) return;
    try {
      await deleteTable(tableId);
      // Reload tables after deletion
      if (selectedRestaurantId) {
        await loadTablesForRestaurant(selectedRestaurantId);
      }
    } catch (error) {
      console.error('Failed to delete table:', error);
      alert('Failed to delete QR code/table');
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New password and confirmation must match.');
      return;
    }

    setIsPasswordLoading(true);
    try {
      await changePassword(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordSuccess('Password updated successfully.');
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setTimeout(() => setShowPasswordModal(false), 1200);
    } catch (error) {
      console.error('Failed to update password:', error);
      setPasswordError(
        error instanceof Error ? error.message : 'Failed to update password. Please try again.'
      );
    } finally {
      setIsPasswordLoading(false);
    }
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setIsSubmitting(true);
    try {
      if (editingId) {
        await updateRestaurant(editingId, {
          name:    formData.name,
          email:   formData.email,
          phone:   formData.phone,
          address: formData.address,
        });
      } else {
        // 1. Create the restaurant
        const newRestaurant = await createRestaurant({
          name:    formData.name,
          email:   formData.email,
          phone:   formData.phone,
          address: formData.address,
        });

        // 2. Create the manager staff account linked to this restaurant
        await signUpStaff({
          name: formData.managerName,
          email: formData.managerEmail,
          phone: formData.managerPhone,
          role: 'manager',
          username: formData.managerUsername,
          password: formData.managerPassword,
          restaurantId: newRestaurant.id,
        });
      }

      await loadRestaurants();
      resetForm();
      setShowCreateModal(false);
    } catch (error) {
      console.error('Failed to save restaurant:', error);
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error !== null
            ? (error as any).message || (error as any).error_description || JSON.stringify(error)
            : String(error) || 'Failed to save. Please try again.';
      setFormError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (restaurant: Restaurant) => {
    setFormData({
      name:            restaurant.name,
      email:           restaurant.email,
      phone:           restaurant.phone,
      address:         restaurant.address,
      managerName:     '',
      managerEmail:    '',
      managerPhone:    '',
      managerUsername: '',
      managerPassword: '',
    });
    setFormError('');
    setEditingId(restaurant.id);
    setShowCreateModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this restaurant?')) return;
    try {
      await deleteRestaurant(id);
      await loadRestaurants();
    } catch (error) {
      console.error('Failed to delete restaurant:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name:            '',
      email:           '',
      phone:           '',
      address:         '',
      managerName:     '',
      managerEmail:    '',
      managerPhone:    '',
      managerUsername: '',
      managerPassword: '',
    });
    setEditingId(null);
  };

  return (
    <div className="bg-slate-900 text-slate-100 p-4 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-100 flex items-center gap-2">
              <Lock className="w-8 h-8" />
              SuperAdmin Dashboard
            </h1>
            <p className="text-slate-300 mt-1">Manage restaurants and operators for Servv IQ</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => setShowPasswordModal(true)}
              variant="secondary"
            >
              <Lock className="w-4 h-4 mr-2" /> Change Password
            </Button>
            <Button
              onClick={() => {
                resetForm();
                setFormError('');
                setShowCreateModal(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" /> Add Restaurant
            </Button>
          </div>
        </div>

        {/* Admin key warning */}
        {!isAdminConfigured && (
          <div className="mb-4 px-4 py-3 bg-yellow-500/10 border border-yellow-500/40 rounded-lg text-yellow-400 text-sm">
            <strong>Warning:</strong> VITE_SUPABASE_SERVICE_KEY is not configured. Restaurant creation and staff management will fail due to RLS. Add the service role key to your <code>.env</code> file and restart the dev server.
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <Card className="bg-slate-800/70 border-slate-700 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total Restaurants</p>
                <p className="text-2xl font-bold mt-2">{restaurants.length}</p>
              </div>
              <Building2 className="w-8 h-8 text-amber-500" />
            </div>
          </Card>

          <Card className="bg-slate-800/70 border-slate-700 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total Managers</p>
                <p className="text-2xl font-bold mt-2">
                  {restaurants.reduce((sum, r) => sum + r.managerCount, 0)}
                </p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </Card>

          <Card className="bg-slate-800/70 border-slate-700 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Active Status</p>
                <p className="text-2xl font-bold mt-2 text-green-500">Operational</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
          </Card>
        </div>

        {/* Restaurants List */}
        <Card className="bg-slate-800/50 border-slate-700">
          <div className="p-4 border-b border-slate-700">
            <h2 className="text-xl font-bold">Restaurants</h2>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-slate-400">Loading...</div>
          ) : restaurants.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <p>No restaurants yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="px-4 py-3 text-left text-sm font-semibold">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Email</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Phone</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Address</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {restaurants.map((restaurant) => (
                    <tr key={restaurant.id} className="border-b border-slate-700 hover:bg-slate-700/30">
                      <td className="px-4 py-3">
                        <div className="font-medium">{restaurant.name}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">{restaurant.email}</td>
                      <td className="px-4 py-3 text-sm">{restaurant.phone}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{restaurant.address}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEdit(restaurant)}
                            className="p-1 hover:bg-slate-600 rounded transition"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4 text-blue-400" />
                          </button>
                          <button
                            onClick={() => handleDelete(restaurant.id)}
                            className="p-1 hover:bg-slate-600 rounded transition"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4 text-red-400" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* QR Codes (Tables) Management */}
        <Card className="bg-slate-800/50 border-slate-700 mt-6">
          <div className="p-4 border-b border-slate-700">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <QrCode className="w-5 h-5" />
              QR Codes Overview
            </h2>
            <p className="text-slate-400 text-sm mt-1">View QR codes for each restaurant. QR code deletion is performed by the restaurant manager.</p>
          </div>

          {selectedRestaurantId === null ? (
            <div className="p-4">
              <div className="space-y-2">
                <p className="text-slate-300 font-semibold mb-3">Select a restaurant to view its QR codes:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {restaurants.map((restaurant) => (
                    <button
                      key={restaurant.id}
                      onClick={() => handleViewTables(restaurant.id)}
                      className="p-3 bg-slate-700 hover:bg-slate-600 rounded border border-slate-600 text-left transition"
                    >
                      <div className="font-medium text-slate-100">{restaurant.name}</div>
                      <div className="text-xs text-slate-400">{restaurant.city}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4">
              <button
                onClick={() => {
                  setSelectedRestaurantId(null);
                  setRestaurantTables([]);
                }}
                className="mb-4 flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm"
              >
                <ChevronDown className="w-4 h-4 rotate-90" />
                Back to Restaurant Selection
              </button>

              <div className="space-y-3">
                <div>
                  <p className="text-slate-300 font-semibold">
                    {restaurants.find(r => r.id === selectedRestaurantId)?.name}
                  </p>
                  <p className="text-slate-400 text-sm">QR Codes: {restaurantTables.length}</p>
                </div>

                {isLoadingTables ? (
                  <div className="p-4 text-center text-slate-400">Loading QR codes...</div>
                ) : restaurantTables.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">
                    No QR codes/tables created yet for this restaurant.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700">
                          <th className="px-3 py-2 text-left font-semibold">Table #</th>
                          <th className="px-3 py-2 text-left font-semibold">Name</th>
                          <th className="px-3 py-2 text-left font-semibold">Capacity</th>
                          <th className="px-3 py-2 text-left font-semibold">Location</th>
                          <th className="px-3 py-2 text-left font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {restaurantTables.map((table) => (
                          <tr key={table.id} className="border-b border-slate-700 hover:bg-slate-700/30">
                            <td className="px-3 py-2">#{table.tableNumber}</td>
                            <td className="px-3 py-2">{table.name || '-'}</td>
                            <td className="px-3 py-2">{table.capacity || '-'}</td>
                            <td className="px-3 py-2 text-slate-400">{table.location || '-'}</td>
                            <td className="px-3 py-2">
                            <span className="text-slate-400 text-sm">Manager action only</span>
                          </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Change Password Modal */}
      {showPasswordModal && (
        <Modal
          isOpen={showPasswordModal}
          onClose={() => {
            setShowPasswordModal(false);
            setPasswordError('');
            setPasswordSuccess('');
          }}
          title="Change Password"
        >
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <Input
              label="Current Password"
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              placeholder="Enter current password"
              required
            />
            <Input
              label="New Password"
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              placeholder="Enter new password"
              required
              minLength={6}
            />
            <Input
              label="Confirm New Password"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              placeholder="Confirm new password"
              required
              minLength={6}
            />

            {passwordError && <p className="text-red-400 text-sm">{passwordError}</p>}
            {passwordSuccess && <p className="text-green-400 text-sm">{passwordSuccess}</p>}

            <div className="flex gap-3 pt-4">
              <Button type="submit" variant="primary" className="flex-1" isLoading={isPasswordLoading}>
                Update Password
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  setShowPasswordModal(false);
                  setPasswordError('');
                  setPasswordSuccess('');
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <Modal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setFormError('');
            resetForm();
          }}
          title={editingId ? 'Edit Restaurant' : 'Add New Restaurant'}
        >
          <form onSubmit={handleCreateOrUpdate} className="space-y-4">
            <Input
              label="Restaurant Name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., The Burger Joint"
              required
            />

            <Input
              label="Email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="contact@restaurant.com"
              required
            />

            <Input
              label="Phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+1 (555) 123-4567"
              required
            />

            <Input
              label="Address"
              value={formData.address}
              onChange={(e) => setFormData({ ...formData, address: e.target.value })}
              placeholder="123 Main Street"
              required
            />

            {!editingId && (
              <div className="border-t border-slate-600 pt-4 mt-6">
                <h3 className="text-lg font-semibold text-slate-200 mb-3">Manager Account</h3>

                <Input
                  label="Manager Name"
                  value={formData.managerName}
                  onChange={(e) => setFormData({ ...formData, managerName: e.target.value })}
                  placeholder="John Doe"
                  required
                />

                <Input
                  label="Manager Email"
                  type="email"
                  value={formData.managerEmail}
                  onChange={(e) => setFormData({ ...formData, managerEmail: e.target.value })}
                  placeholder="manager@restaurant.com"
                  required
                />

                <Input
                  label="Manager Phone"
                  value={formData.managerPhone}
                  onChange={(e) => setFormData({ ...formData, managerPhone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                  required
                />

                <Input
                  label="Manager Username"
                  value={formData.managerUsername}
                  onChange={(e) => setFormData({ ...formData, managerUsername: e.target.value })}
                  placeholder="manager_username"
                  required
                />

                <Input
                  label="Manager Password"
                  type="password"
                  value={formData.managerPassword}
                  onChange={(e) => setFormData({ ...formData, managerPassword: e.target.value })}
                  placeholder="Secure password"
                  required
                />
              </div>
            )}

            {formError && (
              <p className="text-red-400 text-sm bg-red-400/10 border border-red-400/30 rounded-lg px-3 py-2">
                {formError}
              </p>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                variant="primary"
                className="flex-1"
                isLoading={isSubmitting}
                disabled={isSubmitting}
              >
                {editingId ? 'Update' : 'Create'} Restaurant
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowCreateModal(false);
                  setFormError('');
                  resetForm();
                }}
                className="flex-1"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
