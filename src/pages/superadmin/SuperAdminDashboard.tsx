import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Edit2, Trash2, Building2, Users, TrendingUp, Lock, QrCode, ChevronDown, PowerOff, Power } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';
import { changePassword } from '../../api/auth';
import { fetchRestaurants, createRestaurant, updateRestaurant, deleteRestaurant, setRestaurantActive, fetchReceiptSettings, saveReceiptSettings, type Restaurant, type OutletType } from '../../api/restaurants';
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
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    outlet_type: 'restaurant' as OutletType,
    managerName: '',
    managerEmail: '',
    managerPhone: '',
    managerUsername: '',
    managerPassword: ''
  });
  const [printerWidth, setPrinterWidth] = useState<'58mm' | '80mm'>('80mm');
  const [savingPrinterId, setSavingPrinterId] = useState<string | null>(null);

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
          name:        formData.name,
          email:       formData.email,
          phone:       formData.phone,
          address:     formData.address,
          outlet_type: formData.outlet_type,
        });
        // Persist printer width into receipt settings (non-blocking if it fails)
        try {
          const current = await fetchReceiptSettings(editingId);
          await saveReceiptSettings(editingId, { ...current, printerWidth });
        } catch {
          // non-critical
        }
      } else {
        await createRestaurant({
          name:            formData.name,
          email:           formData.email,
          phone:           formData.phone,
          address:         formData.address,
          outlet_type:     formData.outlet_type,
          managerName:     formData.managerName,
          managerEmail:    formData.managerEmail,
          managerPhone:    formData.managerPhone,
          managerUsername: formData.managerUsername,
          managerPassword: formData.managerPassword,
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

  const handleEdit = async (restaurant: Restaurant) => {
    setFormData({
      name:            restaurant.name,
      email:           restaurant.email,
      phone:           restaurant.phone,
      address:         restaurant.address,
      outlet_type:     (restaurant.outlet_type || 'restaurant') as OutletType,
      managerName:     '',
      managerEmail:    '',
      managerPhone:    '',
      managerUsername: '',
      managerPassword: '',
    });
    setFormError('');
    setPrinterWidth('80mm');
    try {
      const receiptSettings = await fetchReceiptSettings(restaurant.id);
      setPrinterWidth(receiptSettings.printerWidth ?? '80mm');
    } catch {
      // non-critical — keep default
    }
    setEditingId(restaurant.id);
    setShowCreateModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this company? This cannot be undone.')) return;
    try {
      await deleteRestaurant(id);
      await loadRestaurants();
    } catch (error) {
      console.error('Failed to delete restaurant:', error);
      alert(error instanceof Error ? error.message : 'Failed to delete company. Please try again.');
    }
  };

  const handleToggleActive = async (restaurant: Restaurant) => {
    const willSuspend = restaurant.is_active !== false;
    const label = restaurant.name;
    const msg = willSuspend
      ? `Suspend access for "${label}"? They will be locked out until reactivated.`
      : `Reactivate "${label}"? They will regain full access.`;
    if (!confirm(msg)) return;
    setTogglingId(restaurant.id);
    try {
      await setRestaurantActive(restaurant.id, !willSuspend);
      await loadRestaurants();
    } catch (error) {
      console.error('Failed to toggle restaurant status:', error);
      alert('Failed to update status. Please try again.');
    } finally {
      setTogglingId(null);
    }
  };

  const handleSetPrinterWidth = useCallback(async (restaurant: Restaurant, width: '58mm' | '80mm') => {
    setSavingPrinterId(restaurant.id);
    try {
      const current = await fetchReceiptSettings(restaurant.id);
      await saveReceiptSettings(restaurant.id, { ...current, printerWidth: width });
      // Update local restaurant settings optimistically
      setRestaurants((prev) => prev.map((r) => {
        if (r.id !== restaurant.id) return r;
        const existing = (r.settings as Record<string, unknown> | undefined) || {};
        const receipt = ((existing.receipt as Record<string, unknown> | undefined) || {});
        return { ...r, settings: { ...existing, receipt: { ...receipt, printerWidth: width } } };
      }));
    } catch {
      alert('Failed to save printer width. Please try again.');
    } finally {
      setSavingPrinterId(null);
    }
  }, []);

  const resetForm = () => {
    setFormData({
      name:            '',
      email:           '',
      phone:           '',
      address:         '',
      outlet_type:     'restaurant',
      managerName:     '',
      managerEmail:    '',
      managerPhone:    '',
      managerUsername: '',
      managerPassword: '',
    });
    setEditingId(null);
    setPrinterWidth('80mm');
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
            <p className="text-slate-300 mt-1">Manage companies and operators for Servv IQ</p>
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
              <Plus className="w-4 h-4 mr-2" /> Add Company
            </Button>
          </div>
        </div>


        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <Card className="bg-slate-800/70 border-slate-700 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-400 text-sm">Total Companies</p>
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
                <p className="text-slate-400 text-sm">Active / Suspended</p>
                <p className="text-2xl font-bold mt-2">
                  <span className="text-green-400">{restaurants.filter(r => r.is_active !== false).length}</span>
                  <span className="text-slate-500 mx-1">/</span>
                  <span className="text-red-400">{restaurants.filter(r => r.is_active === false).length}</span>
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
          </Card>
        </div>

        {/* Companies List */}
        <Card className="bg-slate-800/50 border-slate-700">
          <div className="p-4 border-b border-slate-700">
            <h2 className="text-xl font-bold">Companies</h2>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-slate-400">Loading...</div>
          ) : restaurants.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              <p>No companies yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="px-4 py-3 text-left text-sm font-semibold">Name</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Type</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Status</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Email</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Phone</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Address</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Printer</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {restaurants.map((restaurant) => (
                    <tr key={restaurant.id} className={`border-b border-slate-700 hover:bg-slate-700/30 ${restaurant.is_active === false ? 'opacity-60' : ''}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium">{restaurant.name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                          restaurant.outlet_type === 'minimart' ? 'bg-violet-500/15 text-violet-300 border border-violet-500/25' :
                          restaurant.outlet_type === 'bar'      ? 'bg-amber-500/15 text-amber-300 border border-amber-500/25' :
                          restaurant.outlet_type === 'hotel'    ? 'bg-sky-500/15 text-sky-300 border border-sky-500/25' :
                          restaurant.outlet_type === 'cafe'     ? 'bg-orange-500/15 text-orange-300 border border-orange-500/25' :
                          'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                        }`}>
                          {restaurant.outlet_type || 'restaurant'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {restaurant.is_active === false ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-500/15 text-red-300 border border-red-500/25">
                            Suspended
                          </span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-500/15 text-green-300 border border-green-500/25">
                            {restaurant.subscription_status === 'trial' ? 'Trial' : 'Active'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm">{restaurant.email}</td>
                      <td className="px-4 py-3 text-sm">{restaurant.phone}</td>
                      <td className="px-4 py-3 text-sm text-slate-400">{restaurant.address}</td>
                      <td className="px-4 py-3">
                        {(() => {
                          const currentWidth = ((restaurant.settings as any)?.receipt?.printerWidth as '58mm' | '80mm' | undefined) ?? '80mm';
                          return (
                            <div className="flex gap-1">
                              {(['58mm', '80mm'] as const).map((w) => (
                                <button
                                  key={w}
                                  disabled={savingPrinterId === restaurant.id}
                                  onClick={() => handleSetPrinterWidth(restaurant, w)}
                                  className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors disabled:opacity-50 ${
                                    currentWidth === w
                                      ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                                      : 'bg-slate-800 border-slate-600 text-slate-500 hover:text-slate-300 hover:border-slate-500'
                                  }`}
                                >
                                  {w}
                                </button>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
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
                            onClick={() => handleToggleActive(restaurant)}
                            disabled={togglingId === restaurant.id}
                            className={`p-1 hover:bg-slate-600 rounded transition disabled:opacity-50 ${restaurant.is_active === false ? 'text-green-400' : 'text-amber-400'}`}
                            title={restaurant.is_active === false ? 'Reactivate' : 'Suspend'}
                          >
                            {restaurant.is_active === false
                              ? <Power className="w-4 h-4" />
                              : <PowerOff className="w-4 h-4" />
                            }
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
            <p className="text-slate-400 text-sm mt-1">View QR codes for each company. QR code deletion is performed by the company manager.</p>
          </div>

          {selectedRestaurantId === null ? (
            <div className="p-4">
              <div className="space-y-2">
                <p className="text-slate-300 font-semibold mb-3">Select a company to view its QR codes:</p>
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
                Back to Company Selection
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
                    No QR codes/tables created yet for this company.
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
          title={editingId ? 'Edit Company' : 'Add New Company'}
        >
          <form onSubmit={handleCreateOrUpdate} className="space-y-4">
            <Input
              label="Company Name"
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
              placeholder="contact@company.com"
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

            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Outlet Type</label>
              <select
                value={formData.outlet_type}
                onChange={(e) => setFormData({ ...formData, outlet_type: e.target.value as OutletType })}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="restaurant">Restaurant</option>
                <option value="bar">Bar</option>
                <option value="minimart">Minimart / Supermarket</option>
                <option value="hotel">Hotel</option>
                <option value="cafe">Cafe</option>
              </select>
              <p className="text-xs text-slate-500">
                {formData.outlet_type === 'minimart'
                  ? 'Minimart outlets use a cashier POS interface instead of table-based ordering.'
                  : 'Restaurant, bar, hotel and cafe outlets use the standard table ordering interface.'}
              </p>
            </div>

            {editingId && (
              <div className="space-y-1">
                <label className="block text-sm font-medium text-slate-300">Printer Paper Width</label>
                <div className="flex gap-2">
                  {(['58mm', '80mm'] as const).map((w) => (
                    <button
                      key={w}
                      type="button"
                      onClick={() => setPrinterWidth(w)}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        printerWidth === w
                          ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300'
                          : 'bg-slate-800 border-slate-600 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {w} {w === '58mm' ? '(XPrinter)' : '(standard)'}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-500">Thermal printer paper roll width for this client.</p>
              </div>
            )}

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
                  placeholder="manager@company.com"
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
                {editingId ? 'Update' : 'Create'} Company
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
