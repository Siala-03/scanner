import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Building2, Users, TrendingUp, Lock } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Modal } from '../../components/ui/Modal';
import { Input } from '../../components/ui/Input';

interface Restaurant {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  managerCount: number;
  createdAt: string;
}

interface SuperAdminDashboardProps {
  onNavigate: (page: 'dashboard' | 'restaurants' | 'analytics') => void;
}

export function SuperAdminDashboard({ onNavigate }: SuperAdminDashboardProps) {
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: ''
  });

  useEffect(() => {
    loadRestaurants();
  }, []);

  const loadRestaurants = async () => {
    setIsLoading(true);
    try {
      const token = localStorage.getItem('token');
      const response = await fetch('/api/restaurants', {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setRestaurants(data);
      }
    } catch (error) {
      console.error('Failed to load restaurants:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateOrUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    
    try {
      const url = editingId ? `/api/restaurants/${editingId}` : '/api/restaurants';
      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        await loadRestaurants();
        resetForm();
        setShowCreateModal(false);
      }
    } catch (error) {
      console.error('Failed to save restaurant:', error);
    }
  };

  const handleEdit = (restaurant: Restaurant) => {
    setFormData({
      name: restaurant.name,
      email: restaurant.email,
      phone: restaurant.phone,
      address: restaurant.address,
      city: restaurant.city,
      country: restaurant.country
    });
    setEditingId(restaurant.id);
    setShowCreateModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this restaurant?')) return;

    const token = localStorage.getItem('token');
    try {
      const response = await fetch(`/api/restaurants/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (response.ok) {
        await loadRestaurants();
      }
    } catch (error) {
      console.error('Failed to delete restaurant:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      country: ''
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
            <p className="text-slate-300 mt-1">Manage restaurants and operators for Servv</p>
          </div>
          <Button 
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" /> Add Restaurant
          </Button>
        </div>

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
                    <th className="px-4 py-3 text-left text-sm font-semibold">City</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Managers</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {restaurants.map((restaurant) => (
                    <tr key={restaurant.id} className="border-b border-slate-700 hover:bg-slate-700/30">
                      <td className="px-4 py-3">
                        <div className="font-medium">{restaurant.name}</div>
                        <div className="text-sm text-slate-400">{restaurant.address}</div>
                      </td>
                      <td className="px-4 py-3 text-sm">{restaurant.email}</td>
                      <td className="px-4 py-3 text-sm">{restaurant.phone}</td>
                      <td className="px-4 py-3 text-sm">{restaurant.city}</td>
                      <td className="px-4 py-3 text-center font-medium">{restaurant.managerCount}</td>
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
      </div>

      {/* Create/Edit Modal */}
      {showCreateModal && (
        <Modal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
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

            <div className="grid grid-cols-2 gap-3">
              <Input
                label="City"
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="New York"
                required
              />

              <Input
                label="Country"
                value={formData.country}
                onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                placeholder="USA"
                required
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                variant="primary"
                className="flex-1"
              >
                {editingId ? 'Update' : 'Create'} Restaurant
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setShowCreateModal(false);
                  resetForm();
                }}
                className="flex-1"
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
