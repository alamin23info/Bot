/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { Home, DollarSign, CheckSquare, Wallet, Users, User, ChevronRight, Copy, ExternalLink, Play, Check, X, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
interface UserData {
  telegram_id: string;
  username: string;
  first_name: string;
  points: number;
  total_earnings: number;
  ads_watched: number;
  total_referrals: number;
  ads_in_window: number;
  last_ad_reset: string;
  last_check_in: string | null;
  check_in_streak: number;
}

interface Task {
  id: number;
  title: string;
  reward: number;
  link: string;
  type: string;
}

// --- Components ---

const TabButton = ({ active, icon: Icon, label, onClick }: { active: boolean, icon: any, label: string, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={`flex flex-col items-center justify-center flex-1 py-2 transition-colors ${active ? 'text-purple-500' : 'text-gray-400'}`}
  >
    <Icon size={24} />
    <span className="text-[10px] mt-1 font-medium">{label}</span>
  </button>
);

export default function App() {
  const [activeTab, setActiveTab] = useState('home');
  const [user, setUser] = useState<UserData | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [adProgress, setAdProgress] = useState(0);
  const [claimedBonuses, setClaimedBonuses] = useState<number[]>([]);
  const [withdrawForm, setWithdrawForm] = useState({ method: '', amount: '', address: '' });
  const [rankings, setRankings] = useState<any[]>([]);
  const [adTimer, setAdTimer] = useState<number | null>(null);
  const [totalAdTime, setTotalAdTime] = useState<number>(15);
  const [isWatchingAd, setIsWatchingAd] = useState(false);
  const [activeBonusIndex, setActiveBonusIndex] = useState<number | null>(null);
  const [specialClaims, setSpecialClaims] = useState<any[]>([]);
  const [activeSpecialTaskId, setActiveSpecialTaskId] = useState<number | null>(null);

  const fetchRankings = async () => {
    try {
      const res = await fetch('/api/rankings');
      const data = await res.json();
      setRankings(data);
    } catch (err) {
      console.error("Failed to fetch rankings:", err);
    }
  };

  const fetchUser = async (id: string, username?: string, firstName?: string) => {
    try {
      const res = await fetch(`/api/user/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          telegramId: id,
          username: username || "",
          firstName: firstName || "User"
        })
      });
      
      if (!res.ok) throw new Error("Failed to sync user");
      
      // Fetch claimed bonuses
      const bonusRes = await fetch(`/api/user/bonuses/${id}`);
      const bonusData = await bonusRes.json();
      setClaimedBonuses(bonusData);

      // Fetch profile with referrals
      const profileRes = await fetch(`/api/user/${id}`);
      const profileData = await profileRes.json();
      setUser(profileData);
      
      // Fetch rankings
      fetchRankings();

      // Fetch special claims
      const specialRes = await fetch(`/api/user/special-claims/${id}`);
      const specialData = await specialRes.json();
      setSpecialClaims(specialData);
    } catch (err) {
      console.error("User sync error:", err);
      // Fallback state
      setUser({
        telegram_id: id,
        username: username || "guest",
        first_name: firstName || "Guest User",
        points: 0,
        total_earnings: 0,
        ads_watched: 0,
        total_referrals: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const [isTelegram, setIsTelegram] = useState(true);

  // --- Telegram WebApp Integration ---
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    
    // Strict check: only initialize if initData is present (means we are in TG)
    if (tg && tg.initData && tg.initData !== "") {
      try {
        tg.ready();
        tg.expand();
        const telegramUser = tg.initDataUnsafe?.user;
        if (telegramUser) {
          fetchUser(telegramUser.id.toString(), telegramUser.username, telegramUser.first_name);
        } else {
          fetchUser("7731968815", "preview_user", "Preview User");
        }
        setIsTelegram(true);
      } catch (e) {
        console.warn("Telegram WebApp init failed", e);
        setIsTelegram(false);
        fetchUser("7731968815", "browser_user", "Browser User");
      }
    } else {
      // Not in Telegram environment
      setIsTelegram(false);
      fetchUser("7731968815", "browser_user", "Browser User");
    }
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error("Failed to fetch tasks", err);
    }
  };

  // Auto-finish special tasks when timer hits 0
  useEffect(() => {
    if (adTimer === 0 && activeSpecialTaskId !== null) {
      handleFinishAd();
    }
  }, [adTimer, activeSpecialTaskId]);

  const handleWatchAd = async () => {
    if (!user) return;
    
    // Start 15s timer
    setIsWatchingAd(true);
    setTotalAdTime(15);
    setAdTimer(15);

    const timer = setInterval(() => {
      setAdTimer(prev => {
        if (prev !== null && prev > 1) return prev - 1;
        clearInterval(timer);
        return 0;
      });
    }, 1000);
  };

  const handleClaimBonus = async (index: number) => {
    if (!user || claimedBonuses.includes(index)) return;
    
    setActiveBonusIndex(index);
    setIsWatchingAd(true);
    setTotalAdTime(15);
    setAdTimer(15);

    const timer = setInterval(() => {
      setAdTimer(prev => {
        if (prev !== null && prev > 1) return prev - 1;
        clearInterval(timer);
        return 0;
      });
    }, 1000);
  };

  const handleWatchSpecialTask = async (taskId: number, link: string) => {
    if (!user) return;
    
    // Check if already claimed in last 12 hours
    const claim = specialClaims.find(c => c.task_id === taskId);
    if (claim) {
      const lastClaimDate = new Date(claim.last_claimed_at);
      const now = new Date();
      const diffHours = (now.getTime() - lastClaimDate.getTime()) / (1000 * 60 * 60);
      if (diffHours < 12) {
        const remaining = Math.ceil(12 - diffHours);
        alert(`Please wait ${remaining} more hours to claim again.`);
        return;
      }
    }

    window.open(link, '_blank');
    
    setActiveSpecialTaskId(taskId);
    setIsWatchingAd(true);
    setTotalAdTime(60);
    setAdTimer(60);

    const timer = setInterval(() => {
      setAdTimer(prev => {
        if (prev !== null && prev > 1) return prev - 1;
        clearInterval(timer);
        return 0;
      });
    }, 1000);
  };

  const handleFinishAd = async () => {
    if (!user) return;
    
    if (activeSpecialTaskId !== null) {
      // Handle Special Task Claim
      const taskId = activeSpecialTaskId;
      const res = await fetch('/api/user/claim-special-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId: user.telegram_id, taskId })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Success! You earned ${data.reward} টাকা.`);
        fetchUser(user.telegram_id);
      } else {
        alert(data.error || "Failed to claim reward");
      }
      setActiveSpecialTaskId(null);
    } else if (activeBonusIndex !== null) {
      // Handle Bonus Claim
      const index = activeBonusIndex;
      if ((window as any).show_10663163) {
        (window as any).show_10663163().then(async () => {
          const res = await fetch('/api/user/claim-bonus', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: user.telegram_id, bonusIndex: index })
          });
          if (res.ok) {
            setClaimedBonuses(prev => [...prev, index]);
            setUser(prev => prev ? { ...prev, points: prev.points + 0.25, total_earnings: prev.total_earnings + 0.25 } : null);
          }
        });
      } else {
        alert("Ad SDK not loaded. Simulating bonus...");
        const res = await fetch('/api/user/claim-bonus', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegramId: user.telegram_id, bonusIndex: index })
        });
        if (res.ok) {
          setClaimedBonuses(prev => [...prev, index]);
          setUser(prev => prev ? { ...prev, points: prev.points + 0.25, total_earnings: prev.total_earnings + 0.25 } : null);
        }
      }
      setActiveBonusIndex(null);
    } else {
      // Handle Regular Ad
      if ((window as any).show_10663163) {
        (window as any).show_10663163().then(async () => {
          const res = await fetch('/api/user/watch-ad', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: user.telegram_id })
          });
          const data = await res.json();
          if (res.ok) {
            setUser(prev => prev ? { 
              ...prev, 
              points: data.points?.points ?? prev.points, 
              total_earnings: (prev.total_earnings ?? 0) + 0.25, 
              ads_watched: (prev.ads_watched ?? 0) + 1,
              ads_in_window: (prev.ads_in_window ?? 0) + 1
            } : null);
            setAdProgress(prev => (prev + 1) % 10);
          } else {
            alert(data.error || "Failed to watch ad");
          }
        });
      } else {
        // Mock ad for testing
        alert("Ad SDK not loaded. Simulating reward...");
        const res = await fetch('/api/user/watch-ad', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegramId: user.telegram_id })
        });
        const data = await res.json();
        if (res.ok) {
          setUser(prev => prev ? { 
            ...prev, 
            points: data.points?.points ?? prev.points, 
            total_earnings: (prev.total_earnings ?? 0) + 0.25, 
            ads_watched: (prev.ads_watched ?? 0) + 1,
            ads_in_window: (prev.ads_in_window ?? 0) + 1
          } : null);
          setAdProgress(prev => (prev + 1) % 10);
        } else {
          alert(data.error || "Failed to watch ad");
        }
      }
    }
    setIsWatchingAd(false);
    setAdTimer(null);
  };

  const handleCheckIn = async () => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    if (user.last_check_in === today) {
      alert("Already checked in today!");
      return;
    }

    try {
      const res = await fetch('/api/user/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramId: user.telegram_id })
      });
      const data = await res.json();
      if (res.ok) {
        alert(`Checked in! You got ${data.reward} টাকা.`);
        fetchUser(user.telegram_id);
      } else {
        alert(data.error || "Failed to check in");
      }
    } catch (err) {
      alert("An error occurred");
    }
  };

  const handleSubmitWithdrawal = async () => {
    if (!user) return;
    const amount = parseFloat(withdrawForm.amount);
    
    if (!withdrawForm.method || withdrawForm.method === 'Select a method') {
      alert("Please select a withdrawal method");
      return;
    }
    if (isNaN(amount) || amount < 3750) {
      alert("Minimum withdrawal is 3750");
      return;
    }
    if (amount > user.points) {
      alert("পর্যাপ্ত টাকা নেই");
      return;
    }
    if (!withdrawForm.address) {
      alert("Please enter your wallet address");
      return;
    }

    try {
      const res = await fetch('/api/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId: user.telegram_id,
          method: withdrawForm.method,
          amount: amount,
          walletAddress: withdrawForm.address
        })
      });
      if (res.ok) {
        alert("Withdrawal request submitted successfully!");
        setWithdrawForm({ method: '', amount: '', address: '' });
        fetchUser(user.telegram_id);
      } else {
        const data = await res.json();
        alert(data.error || "Failed to submit withdrawal");
      }
    } catch (err) {
      alert("An error occurred");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F0A1E] flex items-center justify-center text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F0A1E] text-white font-sans flex flex-col">
      {!isTelegram && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 p-2 text-center text-xs text-yellow-500">
          You are viewing this in a browser. For full features, open in Telegram.
        </div>
      )}
      {/* Header */}
      <div className="p-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full border-2 border-purple-500 overflow-hidden bg-gray-800">
          <img 
            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username || 'user'}`} 
            alt="avatar" 
            className="w-full h-full object-cover"
          />
        </div>
        <div>
          <h2 className="font-bold text-lg leading-tight">{user?.first_name || 'User'}</h2>
          <p className="text-purple-400 font-bold text-sm">টাকা {(user?.points ?? 0).toFixed(2)}</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-24">
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              {/* Daily Check-in */}
              <div className="bg-[#1A142D] rounded-3xl p-6 border border-white/5">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-lg font-bold">Daily Check-in</h3>
                  <span className="text-xs text-purple-400 font-medium bg-purple-500/10 px-3 py-1 rounded-full">
                    Day {user?.check_in_streak || 0}/7
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-3 mb-6">
                  {[0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 5.0].map((reward, i) => {
                    const day = i + 1;
                    const isClaimed = (user?.check_in_streak || 0) >= day;
                    const isCurrent = (user?.check_in_streak || 0) + 1 === day && user?.last_check_in !== new Date().toISOString().split('T')[0];
                    
                    return (
                      <div 
                        key={i} 
                        className={`p-3 rounded-2xl flex flex-col items-center gap-1 border transition-all ${
                          isClaimed 
                          ? 'bg-purple-600/20 border-purple-500/30 text-purple-300' 
                          : isCurrent
                          ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-500/20 scale-105'
                          : 'bg-gray-800/50 border-white/5 text-gray-500'
                        }`}
                      >
                        <span className="text-[10px] font-medium opacity-60">Day {day}</span>
                        <span className="text-xs font-bold">+{reward}</span>
                        {isClaimed && <Check size={12} className="mt-1" />}
                      </div>
                    );
                  })}
                  <div className="p-3 rounded-2xl bg-gray-800/30 border border-dashed border-white/10 flex items-center justify-center text-[10px] text-gray-500 text-center leading-tight">
                    Resets after Day 7
                  </div>
                </div>
                <button 
                  onClick={handleCheckIn}
                  disabled={user?.last_check_in === new Date().toISOString().split('T')[0]}
                  className={`w-full py-3 rounded-2xl font-bold text-sm transition-all active:scale-95 ${
                    user?.last_check_in === new Date().toISOString().split('T')[0]
                    ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/20'
                  }`}
                >
                  {user?.last_check_in === new Date().toISOString().split('T')[0] ? 'Already Claimed Today' : 'Claim Daily Reward'}
                </button>
              </div>

              <div className="bg-[#1A142D] rounded-3xl p-6 relative overflow-hidden border border-white/5">
                <div className="relative z-10">
                  <h3 className="text-2xl font-bold mb-1">Hello, {user?.first_name}!</h3>
                  <p className="text-gray-400 mb-6">Ready to boost your earnings?</p>
                  <button 
                    onClick={() => setActiveTab('earn')}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-full font-bold transition-transform active:scale-95"
                  >
                    Start Earning
                  </button>
                </div>
                <div className="absolute right-[-20px] top-[-20px] opacity-20">
                  <DollarSign size={150} className="text-purple-500" />
                </div>
              </div>

              {/* Referral Notice */}
              <div className="bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border border-purple-500/20 p-5 rounded-3xl">
                <div className="flex items-center gap-4">
                  <div className="bg-purple-500/20 p-3 rounded-2xl">
                    <Users size={24} className="text-purple-400" />
                  </div>
                  <div>
                    <h4 className="font-bold text-purple-100">Refer & Earn 5.00 টাকা</h4>
                    <p className="text-xs text-purple-300/70">Get 5.00 টাকা for every friend you invite!</p>
                  </div>
                </div>
              </div>

              {/* Top Earners Ranking */}
              <div className="bg-[#1A142D] rounded-3xl p-6 border border-white/5">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-bold">Top 5 Earners</h3>
                  <div className="bg-emerald-500/10 text-emerald-400 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                    Live Rankings
                  </div>
                </div>
                <div className="space-y-4">
                  {rankings.map((rank, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-2xl border border-white/5">
                      <div className="flex items-center gap-4">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                          i === 0 ? 'bg-yellow-500 text-black' : 
                          i === 1 ? 'bg-gray-300 text-black' : 
                          i === 2 ? 'bg-amber-600 text-white' : 
                          'bg-gray-800 text-gray-400'
                        }`}>
                          {i + 1}
                        </div>
                        <div className="w-10 h-10 rounded-full border border-white/10 overflow-hidden bg-gray-800 shrink-0">
                          <img 
                            src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${rank.username || rank.first_name || 'user'}`} 
                            alt="avatar" 
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <p className="font-bold text-sm truncate max-w-[100px]">{rank.first_name || 'User'}</p>
                          <p className="text-[10px] text-gray-500 truncate max-w-[100px]">@{rank.username || 'user'}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-purple-400 font-bold text-sm">{(rank.total_earnings || 0).toFixed(2)}</p>
                        <p className="text-[10px] text-gray-500 uppercase">Total Earned</p>
                      </div>
                    </div>
                  ))}
                  {rankings.length === 0 && (
                    <p className="text-center text-gray-500 text-sm py-4">Loading rankings...</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-[#1A142D] p-6 rounded-3xl border border-white/5 flex flex-col items-center text-center">
                  <div className="bg-purple-500/20 p-3 rounded-2xl mb-3">
                    <Play className="text-purple-500" />
                  </div>
                  <h4 className="text-2xl font-bold">{user?.ads_watched ?? 0}</h4>
                  <p className="text-gray-400 text-xs">Ads Watched</p>
                </div>
                <div className="bg-[#1A142D] p-6 rounded-3xl border border-white/5 flex flex-col items-center text-center">
                  <div className="bg-purple-500/20 p-3 rounded-2xl mb-3">
                    <Users className="text-purple-500" />
                  </div>
                  <h4 className="text-2xl font-bold">{user?.total_referrals ?? 0}</h4>
                  <p className="text-gray-400 text-xs">Refer & Earn</p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'earn' && (
            <motion.div 
              key="earn"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold text-center mt-4">Watch Ads & Earn</h2>
              <div className="bg-[#1A142D] rounded-3xl p-8 border border-white/5">
                <h3 className="text-lg font-bold mb-4">Daily Ad Limit</h3>
                <div className="flex justify-between text-sm text-gray-400 mb-2">
                  <span>8-Hour Window Progress</span>
                  <span>{user?.ads_in_window ?? 0}/500</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-3 mb-6">
                  <div 
                    className="bg-purple-600 h-full rounded-full transition-all duration-500" 
                    style={{ width: `${((user?.ads_in_window ?? 0) / 500) * 100}%` }}
                  ></div>
                </div>
                <p className="text-center text-gray-400 mb-6">Remaining in this window: {500 - (user?.ads_in_window ?? 0)}</p>
                <button 
                  onClick={handleWatchAd}
                  disabled={(user?.ads_in_window ?? 0) >= 500}
                  className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-transform active:scale-95 ${
                    (user?.ads_in_window ?? 0) >= 500 
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                    : 'bg-purple-600 hover:bg-purple-700 text-white'
                  }`}
                >
                  <Play size={20} fill="currentColor" />
                  {(user?.ads_in_window ?? 0) >= 500 ? 'Limit Reached' : 'Watch Ad'}
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'tasks' && (
            <motion.div 
              key="tasks"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 pb-10"
            >
              <h2 className="text-2xl font-bold text-center mt-4">Daily Tasks</h2>
              
              <div className="bg-[#1A142D] rounded-3xl p-6 border border-white/5">
                <h3 className="text-lg font-bold mb-6">Bonus Claims (10 Daily)</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[...Array(10)].map((_, i) => (
                    <button
                      key={i}
                      disabled={claimedBonuses.includes(i)}
                      onClick={() => handleClaimBonus(i)}
                      className={`p-4 rounded-2xl font-bold text-sm transition-all active:scale-95 flex flex-col items-center gap-2 ${
                        claimedBonuses.includes(i) 
                        ? 'bg-gray-800 text-gray-500 opacity-50' 
                        : 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/20'
                      }`}
                    >
                      <Play size={16} fill="currentColor" />
                      Bonus {i + 1}
                      <span className="text-[10px] block">Reward: 0.25</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-[#1A142D] rounded-3xl p-6 border border-white/5">
                <h3 className="text-lg font-bold mb-6">Special Tasks (12h Cooldown)</h3>
                <div className="space-y-4">
                  {tasks.filter(t => t.type === 'special').map(task => {
                    const claim = specialClaims.find(c => c.task_id === task.id);
                    let isCooldown = false;
                    let remainingText = "";
                    if (claim) {
                      const lastClaimDate = new Date(claim.last_claimed_at);
                      const now = new Date();
                      const diffHours = (now.getTime() - lastClaimDate.getTime()) / (1000 * 60 * 60);
                      if (diffHours < 12) {
                        isCooldown = true;
                        remainingText = `${Math.ceil(12 - diffHours)}h left`;
                      }
                    }

                    return (
                      <div key={task.id} className="bg-gray-800/50 p-4 rounded-2xl flex items-center justify-between border border-white/5">
                        <div>
                          <h4 className="font-bold">{task.title}</h4>
                          <p className="text-purple-400 text-sm font-bold">Reward: টাকা {task.reward.toFixed(2)}</p>
                          <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">1 Minute Verification</p>
                        </div>
                        <button
                          disabled={isCooldown}
                          onClick={() => handleWatchSpecialTask(task.id, task.link)}
                          className={`px-6 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 ${
                            isCooldown 
                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                            : 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-500/20'
                          }`}
                        >
                          {isCooldown ? remainingText : 'Claim Bonus'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-[#1A142D] rounded-3xl p-6 border border-white/5">
                <h3 className="text-lg font-bold mb-6">Join & Earn</h3>
                <div className="space-y-4">
                  {tasks.filter(t => t.type !== 'special').map(task => (
                    <div key={task.id} className="bg-gray-800/50 p-4 rounded-2xl flex items-center justify-between">
                      <div>
                        <h4 className="font-bold">{task.title}</h4>
                        <p className="text-green-400 text-sm">Reward: টাকা {task.reward}</p>
                      </div>
                      <div className="flex flex-col gap-2">
                        <a 
                          href={task.link} 
                          target="_blank" 
                          rel="noreferrer"
                          className="text-xs text-gray-400 text-center underline"
                        >
                          Join
                        </a>
                        <button className="bg-emerald-500 hover:bg-emerald-600 px-6 py-2 rounded-full font-bold text-sm transition-transform active:scale-95">
                          Verify
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'withdraw' && (
            <motion.div 
              key="withdraw"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold text-center mt-4">Request Withdrawal</h2>
              <div className="bg-[#1A142D] rounded-3xl p-6 border border-white/5 space-y-6">
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Withdrawal Method</label>
                  <select 
                    value={withdrawForm.method}
                    onChange={(e) => setWithdrawForm({ ...withdrawForm, method: e.target.value })}
                    className="w-full bg-gray-800 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-purple-500"
                  >
                    <option>Select a method</option>
                    <option>Binance (USDT)</option>
                    <option>Bkash</option>
                    <option>Nagad</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Amount (Min: 3750)</label>
                  <input 
                    type="number" 
                    placeholder="Enter amount"
                    value={withdrawForm.amount}
                    onChange={(e) => setWithdrawForm({ ...withdrawForm, amount: e.target.value })}
                    className="w-full bg-gray-800 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <div>
                  <label className="block text-gray-400 text-sm mb-2">Wallet Address</label>
                  <input 
                    type="text" 
                    placeholder="Enter your wallet address"
                    value={withdrawForm.address}
                    onChange={(e) => setWithdrawForm({ ...withdrawForm, address: e.target.value })}
                    className="w-full bg-gray-800 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-purple-500"
                  />
                </div>
                <button 
                  onClick={handleSubmitWithdrawal}
                  className="w-full bg-purple-600 hover:bg-purple-700 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-transform active:scale-95"
                >
                  Submit Withdrawal <ChevronRight size={20} />
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'refer' && (
            <motion.div 
              key="refer"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6 text-center"
            >
              <h2 className="text-2xl font-bold mt-4">Referral Program</h2>
              <div className="bg-[#1A142D] rounded-3xl p-8 border border-white/5">
                <div className="bg-purple-500/20 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6">
                  <DollarSign size={48} className="text-purple-500" />
                </div>
                <p className="text-gray-400 mb-8">Share your link and earn rewards for every friend who joins!</p>
                <div className="flex gap-2 mb-6">
                  <div className="flex-1 bg-gray-800 border border-white/10 rounded-xl p-4 text-sm text-gray-400 truncate">
                    https://t.me/chilly_earning_bot?start=ref_{user?.telegram_id}
                  </div>
                  <button 
                    onClick={() => {
                      navigator.clipboard.writeText(`https://t.me/chilly_earning_bot?start=ref_${user?.telegram_id}`);
                      alert("Copied!");
                    }}
                    className="bg-gray-700 p-4 rounded-xl hover:bg-gray-600"
                  >
                    <Copy size={20} />
                  </button>
                </div>
                <button className="w-full bg-purple-600 hover:bg-purple-700 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-transform active:scale-95">
                  <ExternalLink size={20} /> Share on Telegram
                </button>
              </div>
            </motion.div>
          )}

          {activeTab === 'profile' && (
            <motion.div 
              key="profile"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="bg-[#1A142D] rounded-3xl p-8 border border-white/5 flex flex-col items-center">
                <div className="w-24 h-24 rounded-full border-4 border-purple-500 p-1 mb-4">
                  <img 
                    src={`https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.username || 'user'}`} 
                    alt="avatar" 
                    className="w-full h-full rounded-full bg-gray-800"
                  />
                </div>
                <h3 className="text-2xl font-bold">{user?.first_name}</h3>
                <p className="text-gray-400 mb-8">@{user?.username || 'user'}</p>
                
                <div className="w-full space-y-4">
                  <div className="bg-purple-500/10 border border-purple-500/20 p-4 rounded-2xl text-xs text-purple-300 text-center mb-4">
                    📢 Notice: Users will receive payment on the 10th of every month.
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <Wallet size={20} className="text-gray-400" />
                      <span className="text-gray-400">Balance</span>
                    </div>
                    <span className="font-bold text-purple-400">টাকা {(user?.points ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <DollarSign size={20} className="text-gray-400" />
                      <span className="text-gray-400">Total Earnings</span>
                    </div>
                    <span className="font-bold">টাকা {(user?.total_earnings ?? 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <Play size={20} className="text-gray-400" />
                      <span className="text-gray-400">Ads Watched</span>
                    </div>
                    <span className="font-bold">{user?.ads_watched ?? 0}</span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <Users size={20} className="text-gray-400" />
                      <span className="text-gray-400">Total Referrals</span>
                    </div>
                    <span className="font-bold">{user?.total_referrals ?? 0}</span>
                  </div>
                </div>

                <div className="w-full mt-8 py-4 text-center text-gray-500 text-sm font-medium border-t border-white/5">
                  © Chilly 🌶️ Earning 2026
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Ad Timer Modal */}
      <AnimatePresence>
        {isWatchingAd && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[#0F0A1E]/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="relative w-48 h-48 mb-8">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="96"
                  cy="96"
                  r="88"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  className="text-gray-800"
                />
                <motion.circle
                  cx="96"
                  cy="96"
                  r="88"
                  stroke="currentColor"
                  strokeWidth="8"
                  fill="transparent"
                  strokeDasharray="553"
                  initial={{ strokeDashoffset: 553 }}
                  animate={{ strokeDashoffset: 553 - (553 * (totalAdTime - (adTimer || 0))) / totalAdTime }}
                  className="text-purple-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-black text-white">{adTimer}</span>
                <span className="text-xs text-gray-400 uppercase tracking-widest mt-1">Seconds</span>
              </div>
            </div>

            <h3 className="text-2xl font-bold text-white mb-2">
              {activeSpecialTaskId !== null ? 'Verifying Task...' : 'Watching Ad...'}
            </h3>
            <p className="text-gray-400 max-w-[250px] mb-8">
              {activeSpecialTaskId !== null 
                ? 'Please wait for 1 minute on the page to claim your reward.' 
                : 'Please wait for the timer to finish to claim your reward.'}
            </p>

            {adTimer === 0 && (
              <motion.button
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                onClick={handleFinishAd}
                className="bg-white text-black w-16 h-16 rounded-full flex items-center justify-center shadow-2xl shadow-white/20 hover:scale-110 transition-transform"
              >
                <X size={32} strokeWidth={3} />
              </motion.button>
            )}

            <div className="absolute bottom-12 flex items-center gap-2 text-purple-400/50">
              <Clock size={16} />
              <span className="text-xs font-medium uppercase tracking-widest">Ad Verification Active</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-[#1A142D] border-t border-white/5 flex px-2 pb-safe">
        <TabButton active={activeTab === 'home'} icon={Home} label="Home" onClick={() => setActiveTab('home')} />
        <TabButton active={activeTab === 'earn'} icon={DollarSign} label="Earn" onClick={() => setActiveTab('earn')} />
        <TabButton active={activeTab === 'tasks'} icon={CheckSquare} label="Tasks" onClick={() => setActiveTab('tasks')} />
        <TabButton active={activeTab === 'withdraw'} icon={Wallet} label="Withdraw" onClick={() => setActiveTab('withdraw')} />
        <TabButton active={activeTab === 'refer'} icon={Users} label="Refer" onClick={() => setActiveTab('refer')} />
        <TabButton active={activeTab === 'profile'} icon={User} label="Profile" onClick={() => setActiveTab('profile')} />
      </div>
    </div>
  );
}
