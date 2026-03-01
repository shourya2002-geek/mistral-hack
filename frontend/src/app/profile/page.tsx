'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import {
  User, TrendingUp, Zap, BarChart3, Target,
  Film, Music, Type, Palette, RefreshCw, Link2, CheckCircle2, ExternalLink, Unlink,
} from 'lucide-react';

/** Safely convert any value to a renderable string — prevents "Objects are not valid as a React child" */
function safeStr(v: unknown, fallback: string): string {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') return v || fallback;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (Array.isArray(v)) return v.length > 0 ? v.join(', ') : fallback;
  if (typeof v === 'object' && Object.keys(v as object).length === 0) return fallback;
  if (typeof v === 'object') {
    try { return JSON.stringify(v); } catch { return fallback; }
  }
  return String(v);
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // YouTube account connection
  const [ytChannel, setYtChannel] = useState<string>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('vircut_yt_channel') ?? '';
    return '';
  });
  const [ytConnected, setYtConnected] = useState<boolean>(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('vircut_yt_connected') === 'true';
    return false;
  });
  const [ytConnecting, setYtConnecting] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    try {
      const [p, a] = await Promise.allSettled([
        api.getCreatorProfile('dev-creator'),
        api.getCreatorAnalytics('dev-creator'),
      ]);
      if (p.status === 'fulfilled') setProfile(p.value);
      if (a.status === 'fulfilled') setAnalytics(a.value);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const connectYouTube = () => {
    if (!ytChannel.trim()) return;
    setYtConnecting(true);
    // Simulate OAuth flow
    setTimeout(() => {
      localStorage.setItem('vircut_yt_channel', ytChannel.trim());
      localStorage.setItem('vircut_yt_connected', 'true');
      setYtConnected(true);
      setYtConnecting(false);
    }, 1500);
  };

  const disconnectYouTube = () => {
    localStorage.removeItem('vircut_yt_channel');
    localStorage.removeItem('vircut_yt_connected');
    setYtConnected(false);
    setYtChannel('');
  };

  // Map API fields to display values safely
  const pacingInterval = (() => {
    const v = profile?.pacing?.preferredCutIntervalMs;
    if (Array.isArray(v) && v.length === 2) return `${(v[0] / 1000).toFixed(1)}–${(v[1] / 1000).toFixed(1)}s`;
    return safeStr(v, '2.5s');
  })();

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Creator Profile</h1>
          <p className="text-sm text-white/40 mt-1">Your editing style DNA — the learning moat that gets smarter over time</p>
        </div>
        <button onClick={loadProfile} className="btn-secondary">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Profile Card */}
      <div className="card p-6">
        <div className="flex items-start gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-accent-cyan flex items-center justify-center text-2xl font-bold shadow-lg shadow-brand-500/20">
            V
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold">VIRCUT Creator</h2>
            <p className="text-sm text-white/40 mt-0.5">Creator ID: dev-creator</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <span className="badge-brand">AI-Enhanced</span>
              <span className="badge-green">Learning Active</span>
              <span className="badge-cyan">Style Indexed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Style Preferences Grid */}
      <div className="grid grid-cols-2 gap-4">
        <StyleCard
          icon={Zap}
          title="Pacing"
          value={safeStr(profile?.pacing?.energyCurveType, 'Adaptive')}
          description="Average cut interval and energy curve preferences"
          details={[
            { label: 'Cut Interval', value: pacingInterval },
            { label: 'Energy Curve', value: safeStr(profile?.pacing?.energyCurveType, 'rising') },
            { label: 'Speed Ramp', value: safeStr(profile?.pacing?.preferredSpeedRampIntensity, '0.5') },
          ]}
          color="brand"
        />
        <StyleCard
          icon={Type}
          title="Captions"
          value={safeStr(profile?.captions?.preferredColorPreset, 'Bold')}
          description="Caption style, animation, and placement preferences"
          details={[
            { label: 'Style', value: safeStr(profile?.captions?.preferredStyle, 'word-by-word') },
            { label: 'Max Words', value: safeStr(profile?.captions?.maxWordsPerSegment, '5') },
            { label: 'Color Preset', value: safeStr(profile?.captions?.preferredColorPreset, 'aggressive') },
          ]}
          color="amber"
        />
        <StyleCard
          icon={Palette}
          title="Visual Style"
          value={safeStr(profile?.visual?.colorGradePreset, 'Dynamic')}
          description="Zoom patterns, transitions, and color preferences"
          details={[
            { label: 'Transitions', value: safeStr(profile?.visual?.preferredTransition, 'cut') },
            { label: 'Zoom Intensity', value: safeStr(profile?.visual?.zoomIntensity, '0.6') },
            { label: 'Color Grade', value: safeStr(profile?.visual?.colorGradePreset, 'vibrant') },
          ]}
          color="cyan"
        />
        <StyleCard
          icon={Music}
          title="Hook & Opening"
          value={safeStr(profile?.hook?.preferredOpeningStyle, 'bold_claim')}
          description="Hook strategy and opening style preferences"
          details={[
            { label: 'Opening Style', value: safeStr(profile?.hook?.preferredOpeningStyle, 'bold_claim') },
            { label: 'Hook Duration', value: profile?.hook?.averageHookDurationMs ? `${(profile.hook.averageHookDurationMs / 1000).toFixed(1)}s` : '3.0s' },
            { label: 'SFX Intensity', value: safeStr(profile?.visual?.sfxIntensity, '0.5') },
          ]}
          color="green"
        />
      </div>

      {/* Performance Metrics */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Performance Metrics</h2>
        <div className="grid grid-cols-4 gap-4">
          <MetricCard
            label="Avg. Retention"
            value={typeof profile?.performance?.avgRetentionRate === 'number' ? `${Math.round(profile.performance.avgRetentionRate * 100)}%` : '50%'}
            trend={safeStr(analytics?.styleTrend, '—')}
            trendPositive={analytics?.styleTrend === 'improving'}
          />
          <MetricCard
            label="Completion Rate"
            value={typeof profile?.performance?.avgCompletionRate === 'number' ? `${Math.round(profile.performance.avgCompletionRate * 100)}%` : '30%'}
            trend="+1.1%"
            trendPositive
          />
          <MetricCard
            label="Edits Made"
            value={safeStr(analytics?.totalEdits ?? profile?.performance?.totalEdits, '0')}
            trend="—"
          />
          <MetricCard
            label="Optimal Duration"
            value={profile?.performance?.optimalDurationMs ? `${(profile.performance.optimalDurationMs / 1000).toFixed(0)}s` : '30s'}
            trend="target"
          />
        </div>
      </div>

      {/* Top Performing Traits */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Top Performing Traits</h2>
        <div className="card p-5">
          <div className="space-y-3">
            {(analytics?.topPerformingTraits?.length > 0
              ? analytics.topPerformingTraits.map((t: string, i: number) => ({ trait: t, score: 90 - i * 5 }))
              : [
                  { trait: 'Fast-paced intros (< 1s hook)', score: 92 },
                  { trait: 'Word-by-word caption animations', score: 88 },
                  { trait: 'Bass-drop synced cuts', score: 85 },
                  { trait: 'Zoom emphasis on key moments', score: 82 },
                  { trait: 'Emotional arc — tension → release', score: 78 },
                ]
            ).map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-4">
                <span className="text-xs text-white/50 w-6 text-right">{i + 1}.</span>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-white/80">{safeStr(item.trait, 'Trait')}</span>
                    <span className="text-xs font-mono text-brand-300">{item.score}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-accent-cyan"
                      style={{ width: `${item.score}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* YouTube Account Configuration */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Connected Accounts</h2>
        <div className="card p-5 space-y-4">
          {/* YouTube */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-600 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">YouTube</p>
                {ytConnected ? (
                  <p className="text-xs text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Connected — {ytChannel}
                  </p>
                ) : (
                  <p className="text-xs text-white/40">Connect your channel to post Shorts directly</p>
                )}
              </div>
            </div>
            {ytConnected ? (
              <button onClick={disconnectYouTube} className="text-xs text-red-400 hover:text-red-300 border border-red-500/30 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                <Unlink className="w-3 h-3" /> Disconnect
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Channel name or URL"
                  value={ytChannel}
                  onChange={e => setYtChannel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && connectYouTube()}
                  className="input text-xs py-1.5 px-3 w-48"
                />
                <button
                  onClick={connectYouTube}
                  disabled={!ytChannel.trim() || ytConnecting}
                  className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-40"
                >
                  {ytConnecting ? (
                    <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Connecting…</>
                  ) : (
                    <><Link2 className="w-3 h-3" /> Connect</>
                  )}
                </button>
              </div>
            )}
          </div>

          <div className="border-t border-dark-600" />

          {/* Instagram */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400 flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">Instagram Reels</p>
                <p className="text-xs text-white/40">Coming soon — requires Meta Business API</p>
              </div>
            </div>
            <span className="text-[10px] text-white/30 border border-dark-600 px-2 py-1 rounded-md">Coming Soon</span>
          </div>

          <div className="border-t border-dark-600" />

          {/* X / Twitter */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-black border border-dark-600 flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-white">X (Twitter)</p>
                <p className="text-xs text-white/40">Coming soon — requires X API v2</p>
              </div>
            </div>
            <span className="text-[10px] text-white/30 border border-dark-600 px-2 py-1 rounded-md">Coming Soon</span>
          </div>
        </div>
      </div>

      {/* Preferred Platforms */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Platform Preferences</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { name: 'Instagram Reels', active: true, color: 'border-pink-500/40 bg-pink-500/10' },
            { name: 'YouTube Shorts', active: ytConnected, color: 'border-red-500/40 bg-red-500/10' },
            { name: 'X (Twitter)', active: false, color: 'border-white/20 bg-white/5' },
          ].map((platform) => (
            <div
              key={platform.name}
              className={`card p-4 text-center ${
                platform.active
                  ? platform.color + ' border'
                  : 'opacity-40'
              }`}
            >
              <Film className="w-5 h-5 mx-auto mb-2 text-white/40" />
              <span className="text-xs font-medium">{platform.name}</span>
              {platform.active ? (
                <span className="block text-[10px] text-emerald-400 mt-1">Active</span>
              ) : (
                <span className="block text-[10px] text-white/30 mt-1">Not connected</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StyleCard({ icon: Icon, title, value, description, details, color }: {
  icon: any;
  title: string;
  value: string;
  description: string;
  details: Array<{ label: string; value: string }>;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    brand: 'text-brand-400 bg-brand-500/10 border-brand-500/20',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
    cyan: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/20',
    green: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
  };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-lg ${colorMap[color]} border flex items-center justify-center`}>
          <Icon className="w-4.5 h-4.5" />
        </div>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-white/40">{value}</p>
        </div>
      </div>
      <p className="text-xs text-white/30 mb-3">{description}</p>
      <div className="space-y-1.5">
        {details.map((detail) => (
          <div key={detail.label} className="flex items-center justify-between">
            <span className="text-[10px] text-white/40">{detail.label}</span>
            <span className="text-[10px] font-medium text-white/60">{detail.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ label, value, trend, trendPositive }: {
  label: string;
  value: string;
  trend: string;
  trendPositive?: boolean;
}) {
  return (
    <div className="card p-4">
      <span className="text-xs text-white/40 block mb-1">{label}</span>
      <div className="flex items-end gap-2">
        <span className="text-xl font-bold">{value}</span>
        <span className={`text-[10px] font-medium mb-0.5 ${
          trendPositive ? 'text-emerald-400' : 'text-white/30'
        }`}>
          {trend}
        </span>
      </div>
    </div>
  );
}
