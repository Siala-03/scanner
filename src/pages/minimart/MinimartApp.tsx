import { MinimartPOS } from '../../components/minimart/MinimartPOS';
import { MinimartManagerDashboard } from './MinimartManagerDashboard';
import type { Staff } from '../../types';

interface MinimartAppProps {
  restaurantId: string;
  restaurantName: string;
  authUser: Staff;
  onLogout: () => void;
}

export function MinimartApp({ restaurantId, restaurantName, authUser, onLogout }: MinimartAppProps) {
  const { role } = authUser;

  if (role === 'cashier') {
    return (
      <MinimartPOS
        restaurantName={restaurantName}
        cashier={authUser}
        restaurantId={restaurantId}
        onLogout={onLogout}
      />
    );
  }

  if (role === 'manager' || role === 'supervisor') {
    return (
      <MinimartManagerDashboard
        restaurantId={restaurantId}
        restaurantName={restaurantName}
        manager={authUser}
        onLogout={onLogout}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 p-8 text-center">
      <div>
        <p className="mb-4">
          Role <span className="text-slate-200 font-medium">{role}</span> does not have access to
          the minimart portal.
        </p>
        <button onClick={onLogout} className="text-indigo-400 underline text-sm">
          Sign out
        </button>
      </div>
    </div>
  );
}
