import React, { useState, useEffect, useCallback } from 'react';
import {
  UsersIcon,
  SearchIcon,
  PhoneIcon,
  MailIcon,
  GiftIcon,
  StarIcon,
  DownloadIcon,
  RefreshCwIcon,
  TrendingUpIcon,
  CalendarIcon,
  MessageSquareIcon,
} from 'lucide-react';
import { getCustomers } from '../../api/loyalty';
import type { Customer } from '../../types';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

interface CustomerStats {
  total: number;
  withPhone: number;
  withEmail: number;
  totalPoints: number;
}

export function LoyaltyManagement() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'points' | 'date'>('date');
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCustomers();
      setCustomers(data);
    } catch (err) {
      setError('Failed to load loyalty customers. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const filteredCustomers = customers
    .filter(c => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.name?.toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'points') return (b.totalPoints || 0) - (a.totalPoints || 0);
      if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      // date - newest first
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

  const stats: CustomerStats = {
    total: customers.length,
    withPhone: customers.filter(c => c.phone).length,
    withEmail: customers.filter(c => c.email).length,
    totalPoints: customers.reduce((sum, c) => sum + (c.totalPoints || 0), 0),
  };

  const toggleSelectAll = () => {
    if (selectedCustomers.size === filteredCustomers.length) {
      setSelectedCustomers(new Set());
    } else {
      setSelectedCustomers(new Set(filteredCustomers.map(c => c.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedCustomers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportToCSV = (customersToExport: Customer[]) => {
    const headers = ['Name', 'Phone', 'Email', 'Total Points', 'Join Date'];
    const rows = customersToExport.map(c => [
      c.name || '',
      c.phone || '',
      c.email || '',
      String(c.totalPoints || 0),
      c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '',
    ]);
    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `loyalty_customers_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportPhoneNumbers = (customersToExport: Customer[]) => {
    const phones = customersToExport
      .filter(c => c.phone)
      .map(c => c.phone)
      .join('\n');
    const blob = new Blob([phones], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sms_contacts_${new Date().toISOString().split('T')[0]}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const selectedList = filteredCustomers.filter(c => selectedCustomers.has(c.id));
  const exportTarget = selectedList.length > 0 ? selectedList : filteredCustomers;

  return (
    <div className="dark min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <div className="border-b border-slate-700/50 bg-slate-900/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <GiftIcon className="w-6 h-6 text-amber-400" />
                Loyalty Program Management
              </h1>
              <p className="text-slate-400 text-sm mt-0.5">View, manage and export customer loyalty data for SMS marketing</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="ghost" size="sm" onClick={loadCustomers} disabled={loading}>
                <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportPhoneNumbers(exportTarget)}
                disabled={filteredCustomers.length === 0}
              >
                <MessageSquareIcon className="w-4 h-4" />
                Export Phone Numbers ({exportTarget.length})
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => exportToCSV(exportTarget)}
                disabled={filteredCustomers.length === 0}
              >
                <DownloadIcon className="w-4 h-4" />
                Export CSV ({exportTarget.length})
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <UsersIcon className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Total Customers</p>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
              </div>
            </div>
          </Card>
          <Card className="bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <PhoneIcon className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">With Phone (SMS)</p>
                <p className="text-2xl font-bold text-white">{stats.withPhone}</p>
              </div>
            </div>
          </Card>
          <Card className="bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10">
                <MailIcon className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">With Email</p>
                <p className="text-2xl font-bold text-white">{stats.withEmail}</p>
              </div>
            </div>
          </Card>
          <Card className="bg-slate-800/60 border border-slate-700/50">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <StarIcon className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-xs text-slate-400">Total Points Issued</p>
                <p className="text-2xl font-bold text-white">{stats.totalPoints.toLocaleString()}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* SMS Marketing Info Banner */}
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <MessageSquareIcon className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-200 font-semibold text-sm">Bulk SMS Marketing</p>
              <p className="text-amber-300/80 text-xs mt-1">
                Export phone numbers to send bulk SMS promotions to your loyalty customers.
                {stats.withPhone > 0
                  ? ` You have ${stats.withPhone} customers with phone numbers ready for SMS campaigns.`
                  : ' Encourage customers to join the loyalty program at checkout.'}
              </p>
            </div>
          </div>
        </div>

        {/* Filters and Search */}
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          <div className="relative flex-1 max-w-md">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name, phone, or email..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Sort by:</span>
            {(['date', 'name', 'points'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  sortBy === s ? 'bg-amber-500 text-slate-900' : 'bg-slate-800 text-slate-400 border border-slate-700 hover:text-white'
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Selection info */}
        {selectedCustomers.size > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-2">
            <span className="text-amber-200 text-sm">{selectedCustomers.size} customer(s) selected</span>
            <div className="flex gap-2">
              <button
                onClick={() => exportPhoneNumbers(selectedList)}
                className="text-xs px-3 py-1 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition"
              >
                Export Phones
              </button>
              <button
                onClick={() => exportToCSV(selectedList)}
                className="text-xs px-3 py-1 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 transition"
              >
                Export CSV
              </button>
              <button
                onClick={() => setSelectedCustomers(new Set())}
                className="text-xs px-3 py-1 rounded-lg bg-slate-700 text-slate-400 hover:text-white transition"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300 text-sm">
            {error}
            <button onClick={loadCustomers} className="ml-3 underline text-red-400 hover:text-red-300">Retry</button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-3 text-slate-400">Loading customers...</span>
          </div>
        )}

        {/* Customers Table */}
        {!loading && (
          <Card className="bg-slate-800/50 border border-slate-700/50" padding="none">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-700/40 border-b border-slate-700/50">
                  <tr>
                    <th className="px-4 py-3 text-left w-10">
                      <input
                        type="checkbox"
                        checked={selectedCustomers.size === filteredCustomers.length && filteredCustomers.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded border-slate-500 bg-slate-800 accent-amber-500"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Phone</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Points</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Joined</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">SMS Ready</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/30">
                  {filteredCustomers.map(customer => (
                    <tr
                      key={customer.id}
                      className={`transition-colors hover:bg-slate-700/20 ${selectedCustomers.has(customer.id) ? 'bg-amber-500/5' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedCustomers.has(customer.id)}
                          onChange={() => toggleSelect(customer.id)}
                          className="rounded border-slate-500 bg-slate-800 accent-amber-500"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-500/30 to-amber-600/30 flex items-center justify-center text-amber-300 font-semibold text-sm">
                            {(customer.name || 'C')[0].toUpperCase()}
                          </div>
                          <div>
                            <p className="text-white font-medium text-sm">{customer.name || 'Anonymous'}</p>
                            <p className="text-xs text-slate-500">{customer.id.slice(0, 8)}...</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {customer.phone ? (
                          <div className="flex items-center gap-1.5">
                            <PhoneIcon className="w-3 h-3 text-green-400" />
                            <span className="text-sm text-slate-300 font-mono">{customer.phone}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {customer.email ? (
                          <div className="flex items-center gap-1.5">
                            <MailIcon className="w-3 h-3 text-blue-400" />
                            <span className="text-sm text-slate-300">{customer.email}</span>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <StarIcon className="w-3 h-3 text-amber-400" />
                          <span className="text-sm font-semibold text-amber-300">{(customer.totalPoints || 0).toLocaleString()}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <CalendarIcon className="w-3 h-3 text-slate-500" />
                          <span className="text-xs text-slate-400">
                            {customer.createdAt ? new Date(customer.createdAt).toLocaleDateString() : '—'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {customer.phone ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/15 text-green-300 border border-green-500/20">
                            Ready
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-700 text-slate-500 border border-slate-600">
                            No Phone
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {filteredCustomers.length === 0 && !loading && (
                    <tr>
                      <td colSpan={7} className="py-16 text-center">
                        <GiftIcon className="w-10 h-10 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-400 font-medium">
                          {searchQuery ? 'No customers match your search.' : 'No loyalty customers yet.'}
                        </p>
                        <p className="text-slate-600 text-sm mt-1">
                          Customers join when they fill the loyalty form during checkout.
                        </p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {filteredCustomers.length > 0 && (
              <div className="px-4 py-3 border-t border-slate-700/30 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  Showing {filteredCustomers.length} of {customers.length} customers
                </span>
                <div className="flex gap-2">
                  <span className="text-xs text-slate-500">
                    <TrendingUpIcon className="w-3 h-3 inline mr-1 text-green-400" />
                    {stats.withPhone} SMS-ready contacts
                  </span>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
