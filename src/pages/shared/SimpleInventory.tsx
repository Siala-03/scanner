import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  PackageIcon,
  TruckIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  CheckCircleIcon,
  XCircleIcon,
  AlertTriangleIcon,
  SearchIcon,
  MinusIcon,
  XIcon,
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { apiRequest } from '../../api/http';

const API_BASE = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace(/\/$/, '')}/api`
  : '/api';

// Types
interface InventoryItem {
  menuItemId: string;
  menuItemName: string;
  stock: number;
  lowStockThreshold: number;
  unitCost: number;
  category?: string;
  updatedAt: string;
}

interface Supplier {
  id: string;
  name: string;
  contactPerson: string;
  email: string;
  phone: string;
  isActive: boolean;
}

type Tab = 'stock' | 'suppliers';

export function SimpleInventory() {
  const [activeTab, setActiveTab] = useState<Tab>('stock');
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Edit modal state
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [editStock, setEditStock] = useState('');
  const [editThreshold, setEditThreshold] = useState('');
  
  // Supplier modal state
  const [showSupplierModal, setShowSupplierModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supplierForm, setSupplierForm] = useState({
    name: '',
    contactPerson: '',
    email: '',
    phone: '',
  });

  // Load data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [inventoryRes, suppliersRes] = await Promise.all([
        apiRequest<InventoryItem[]>(`${API_BASE}/inventory`),
        apiRequest<Supplier[]>(`${API_BASE}/suppliers`),
      ]);
      setItems(inventoryRes);
      setSuppliers(suppliersRes);
    } catch (err) {
      console.error('Failed to load inventory:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter items
  const filteredItems = items.filter(item => 
    item.menuItemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.menuItemId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get low stock items
  const lowStockItems = items.filter(item => item.stock <= item.lowStockThreshold);
  const outOfStockItems = items.filter(item => item.stock === 0);

  // Update stock
  const handleSaveStock = async () => {
    if (!editingItem) return;
    
    try {
      await apiRequest(`${API_BASE}/inventory/${editingItem.menuItemId}`, {
        method: 'PUT',
        json: {
          stock: parseInt(editStock) || 0,
          low_stock_threshold: parseInt(editThreshold) || 5,
        },
      });
      setEditingItem(null);
      loadData();
    } catch (err) {
      console.error('Failed to update stock:', err);
      alert('Failed to update stock');
    }
  };

  // Quick stock adjustment (+/-)
  const handleQuickAdjust = async (menuItemId: string, delta: number) => {
    try {
      await apiRequest(`${API_BASE}/inventory/${menuItemId}/adjust`, {
        method: 'PATCH',
        json: {
          adjustment: delta,
          reason: delta > 0 ? 'Stock added' : 'Stock removed',
          performed_by: 'manager',
        },
      });
      loadData();
    } catch (err) {
      console.error('Failed to adjust stock:', err);
    }
  };

  // Save supplier
  const handleSaveSupplier = async () => {
    try {
      if (editingSupplier) {
        await apiRequest(`${API_BASE}/suppliers/${editingSupplier.id}`, {
          method: 'PUT',
          json: supplierForm,
        });
      } else {
        await apiRequest(`${API_BASE}/suppliers`, {
          method: 'POST',
          json: {
            ...supplierForm,
            id: `sup_${Date.now()}`,
            address: '',
            categories: [],
            leadTimeDays: 7,
            paymentTerms: 'Net 30',
            rating: 3,
            isActive: true,
          },
        });
      }
      setShowSupplierModal(false);
      setSupplierForm({ name: '', contactPerson: '', email: '', phone: '' });
      setEditingSupplier(null);
      loadData();
    } catch (err) {
      console.error('Failed to save supplier:', err);
      alert('Failed to save supplier');
    }
  };

  // Delete supplier
  const handleDeleteSupplier = async (id: string) => {
    if (!confirm('Delete this supplier?')) return;
    try {
      await apiRequest(`${API_BASE}/suppliers/${id}`, {
        method: 'DELETE',
      });
      loadData();
    } catch (err) {
      console.error('Failed to delete supplier:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1a1410] flex items-center justify-center">
        <div className="text-amber-400">Loading inventory...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#1a1410] flex items-center justify-center">
        <div className="text-red-400">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <PackageIcon className="w-6 h-6 text-amber-400" />
                Inventory
              </h1>
              <p className="text-slate-400 text-sm mt-1">Manage stock levels and suppliers</p>
            </div>
            <Button variant="primary" size="sm" onClick={loadData}>
              <PackageIcon className="w-4 h-4 mr-1" />
              Refresh
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('stock')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'stock'
                  ? 'bg-amber-500 text-slate-900'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <PackageIcon className="w-4 h-4" />
              Stock
              {lowStockItems.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-red-500 text-white rounded-full">
                  {lowStockItems.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('suppliers')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'suppliers'
                  ? 'bg-amber-500 text-slate-900'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700/50'
              }`}
            >
              <TruckIcon className="w-4 h-4" />
              Suppliers
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6">
        {/* Stock Tab */}
        {activeTab === 'stock' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <Card className="bg-[#2a2018] border border-[#3a2e20]">
                <p className="text-xs text-slate-400 mb-1">Total Items</p>
                <p className="text-2xl font-bold text-white">{items.length}</p>
              </Card>
              <Card className="bg-[#2a2018] border border-[#3a2e20]">
                <p className="text-xs text-slate-400 mb-1">Low Stock</p>
                <p className="text-2xl font-bold text-amber-400">{lowStockItems.length}</p>
              </Card>
              <Card className="bg-[#2a2018] border border-[#3a2e20]">
                <p className="text-xs text-slate-400 mb-1">Out of Stock</p>
                <p className="text-2xl font-bold text-red-400">{outOfStockItems.length}</p>
              </Card>
            </div>

            {/* Search */}
            <div className="mb-4">
              <div className="relative">
                <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Items List */}
            <div className="space-y-2">
              {filteredItems.map((item) => {
                const isLow = item.stock <= item.lowStockThreshold;
                const isOut = item.stock === 0;
                
                return (
                  <Card 
                    key={item.menuItemId} 
                    className="bg-[#2a2018] border border-[#3a2e20] hover:border-amber-500/30 transition cursor-pointer"
                    onClick={() => {
                      setEditingItem(item);
                      setEditStock(item.stock.toString());
                      setEditThreshold(item.lowStockThreshold.toString());
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-white">{item.menuItemName}</span>
                          {isOut && (
                            <span className="px-2 py-0.5 text-xs bg-red-500/20 text-red-400 rounded-full">
                              Out of Stock
                            </span>
                          )}
                          {isLow && !isOut && (
                            <span className="px-2 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded-full">
                              Low Stock
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          Threshold: {item.lowStockThreshold} | Cost: {item.unitCost} RWF
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickAdjust(item.menuItemId, -1);
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-700 hover:bg-slate-600 text-white"
                          >
                            <MinusIcon className="w-4 h-4" />
                          </button>
                          <span className={`w-12 text-center font-bold ${isOut ? 'text-red-400' : isLow ? 'text-amber-400' : 'text-white'}`}>
                            {item.stock}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickAdjust(item.menuItemId, 1);
                            }}
                            className="w-8 h-8 flex items-center justify-center rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400"
                          >
                            <PlusIcon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
              
              {filteredItems.length === 0 && (
                <div className="py-12 text-center text-slate-500">
                  {searchQuery ? 'No items match your search' : 'No inventory items found'}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* Suppliers Tab */}
        {activeTab === 'suppliers' && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="flex justify-end mb-4">
              <Button 
                variant="primary" 
                size="sm" 
                onClick={() => {
                  setEditingSupplier(null);
                  setSupplierForm({ name: '', contactPerson: '', email: '', phone: '' });
                  setShowSupplierModal(true);
                }}
              >
                <PlusIcon className="w-4 h-4 mr-1" />
                Add Supplier
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {suppliers.map((supplier) => (
                <Card 
                  key={supplier.id} 
                  className="bg-[#2a2018] border border-[#3a2e20]"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-white">{supplier.name}</h3>
                      <p className="text-sm text-slate-400 mt-1">{supplier.contactPerson}</p>
                      <p className="text-xs text-slate-500 mt-1">{supplier.email}</p>
                      <p className="text-xs text-slate-500">{supplier.phone}</p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => {
                          setEditingSupplier(supplier);
                          setSupplierForm({
                            name: supplier.name,
                            contactPerson: supplier.contactPerson,
                            email: supplier.email,
                            phone: supplier.phone,
                          });
                          setShowSupplierModal(true);
                        }}
                        className="p-2 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white"
                      >
                        <EditIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteSupplier(supplier.id)}
                        className="p-2 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
              
              {suppliers.length === 0 && (
                <div className="col-span-2 py-12 text-center text-slate-500">
                  No suppliers found. Add your first supplier.
                </div>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* Edit Stock Modal */}
      <Modal
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        title="Edit Stock Level"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Item</label>
            <p className="text-white font-medium">{editingItem?.menuItemName}</p>
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Current Stock</label>
            <input
              type="number"
              value={editStock}
              onChange={(e) => setEditStock(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Low Stock Threshold</label>
            <input
              type="number"
              value={editThreshold}
              onChange={(e) => setEditThreshold(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="primary" onClick={handleSaveStock} className="flex-1">
              Save Changes
            </Button>
            <Button variant="secondary" onClick={() => setEditingItem(null)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Supplier Modal */}
      <Modal
        isOpen={showSupplierModal}
        onClose={() => setShowSupplierModal(false)}
        title={editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Name</label>
            <input
              type="text"
              value={supplierForm.name}
              onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Contact Person</label>
            <input
              type="text"
              value={supplierForm.contactPerson}
              onChange={(e) => setSupplierForm({ ...supplierForm, contactPerson: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Email</label>
            <input
              type="email"
              value={supplierForm.email}
              onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Phone</label>
            <input
              type="tel"
              value={supplierForm.phone}
              onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-amber-500"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="primary" onClick={handleSaveSupplier} className="flex-1">
              {editingSupplier ? 'Update' : 'Add'} Supplier
            </Button>
            <Button variant="secondary" onClick={() => setShowSupplierModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
