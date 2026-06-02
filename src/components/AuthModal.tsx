import { useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { colors, fontSize, fontWeight, radius, spacing } from '../lib/theme';

type Tab = 'signin' | 'signup' | 'forgot';

export default function AuthModal() {
  const { signIn, signUp, signInWithGoogle, resetPassword } = useAuthStore();
  const [tab, setTab] = useState<Tab>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function switchTab(t: Tab) {
    setTab(t);
    setError(null);
    setInfo(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    if (tab === 'signin') {
      const err = await signIn(email, password);
      if (err) setError(err);
    } else if (tab === 'signup') {
      if (!displayName.trim()) { setError('Display name is required'); setLoading(false); return; }
      const err = await signUp(email, password, displayName.trim());
      if (err) setError(err);
      else setInfo('Account created! You can now sign in.');
    } else {
      const err = await resetPassword(email);
      if (err) setError(err);
      else setInfo('Password reset email sent. Check your inbox.');
    }

    setLoading(false);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: colors.bgCard,
    border: `1px solid ${colors.borderMed}`,
    borderRadius: radius.sm,
    padding: `${spacing.md}px ${spacing.md}px`,
    fontSize: fontSize.md,
    color: colors.text,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'signin', label: 'Sign In' },
    { key: 'signup', label: 'Sign Up' },
  ];

  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.85)', zIndex: 1000,
    }}>
      <div style={{
        width: 380, background: colors.bgPanel, border: `1px solid ${colors.border}`,
        borderRadius: radius.lg, overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
      }}>
        {/* Logo */}
        <div style={{ padding: `${spacing.xxl}px ${spacing.xxl}px 0`, display: 'flex', alignItems: 'center', gap: spacing.md }}>
          <div style={{
            width: 32, height: 32, borderRadius: radius.md,
            background: colors.accent,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <div style={{ width: 12, height: 12, borderRadius: radius.xs, background: 'rgba(255,255,255,0.9)' }} />
          </div>
          <span style={{ fontSize: fontSize.lg, fontWeight: fontWeight.bold, letterSpacing: '0.12em', color: colors.text, textTransform: 'uppercase' }}>
            SPOTLINE
          </span>
        </div>

        {/* Tabs (hidden when on forgot) */}
        {tab !== 'forgot' && (
          <div style={{ display: 'flex', margin: `${spacing.xl}px ${spacing.xxl}px 0`, gap: spacing.xxs, background: colors.bg, borderRadius: radius.sm, padding: spacing.xs }}>
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => switchTab(t.key)}
                style={{
                  flex: 1, padding: `${spacing.sm}px 0`, fontSize: fontSize.sm, fontWeight: fontWeight.medium,
                  border: 'none', borderRadius: radius.xs, cursor: 'pointer', transition: 'all 0.15s',
                  background: tab === t.key ? colors.accent : 'transparent',
                  color: tab === t.key ? colors.text : colors.textSecondary,
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: `${spacing.xl}px ${spacing.xxl}px ${spacing.xxl}px`, display: 'flex', flexDirection: 'column', gap: spacing.md }}>
          {tab === 'forgot' && (
            <div>
              <h2 style={{ margin: `0 0 ${spacing.xs}px`, fontSize: fontSize.lg, fontWeight: fontWeight.bold, color: colors.text }}>Reset Password</h2>
              <p style={{ margin: 0, fontSize: fontSize.sm, color: colors.textSecondary }}>We'll send a reset link to your email.</p>
            </div>
          )}

          {tab === 'signup' && (
            <div>
              <label style={{ display: 'block', fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs }}>Display Name</label>
              <input
                style={inputStyle}
                placeholder="Your name"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                required
                autoFocus
              />
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs }}>Email</label>
            <input
              style={inputStyle}
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus={tab !== 'signup'}
            />
          </div>

          {tab !== 'forgot' && (
            <div>
              <label style={{ display: 'block', fontSize: fontSize.sm, color: colors.textSecondary, marginBottom: spacing.xs }}>Password</label>
              <input
                style={inputStyle}
                type="password"
                placeholder={tab === 'signup' ? 'Min. 6 characters' : '••••••••'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
          )}

          {error && (
            <div style={{ padding: `${spacing.sm}px ${spacing.md}px`, background: colors.dangerBg, border: `1px solid ${colors.danger}`, borderRadius: radius.sm, fontSize: fontSize.sm, color: colors.danger }}>
              {error}
            </div>
          )}
          {info && (
            <div style={{ padding: `${spacing.sm}px ${spacing.md}px`, background: 'rgba(34,197,94,0.1)', border: `1px solid ${colors.success}`, borderRadius: radius.sm, fontSize: fontSize.sm, color: colors.success }}>
              {info}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: `${spacing.md}px 0`, fontSize: fontSize.md, fontWeight: fontWeight.medium,
              color: colors.text, border: 'none', borderRadius: radius.sm, cursor: loading ? 'not-allowed' : 'pointer',
              background: loading ? colors.borderMed : `linear-gradient(135deg, ${colors.accent}, ${colors.accentDark})`,
              transition: 'all 0.15s', marginTop: spacing.xs,
              boxShadow: loading ? 'none' : `0 0 20px rgba(124,58,237,0.25)`,
            }}
          >
            {loading ? 'Please wait…' : tab === 'signin' ? 'Sign In' : tab === 'signup' ? 'Create Account' : 'Send Reset Link'}
          </button>

          {tab !== 'forgot' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm, margin: `${spacing.xxs}px 0` }}>
                <div style={{ flex: 1, height: 1, background: colors.border }} />
                <span style={{ fontSize: fontSize.sm, color: colors.textFaint }}>or</span>
                <div style={{ flex: 1, height: 1, background: colors.border }} />
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={async () => {
                  setLoading(true);
                  const err = await signInWithGoogle();
                  if (err) { setError(err); setLoading(false); }
                }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
                  padding: `${spacing.md}px 0`, fontSize: fontSize.md, fontWeight: fontWeight.medium,
                  color: colors.text, border: `1px solid ${colors.borderMed}`, borderRadius: radius.sm,
                  cursor: loading ? 'not-allowed' : 'pointer', background: colors.bgCard,
                  transition: 'all 0.15s', opacity: loading ? 0.6 : 1,
                }}
                onMouseEnter={e => { if (!loading) e.currentTarget.style.borderColor = colors.textSecondary; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = colors.borderMed; }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>
            </>
          )}

          <div style={{ display: 'flex', justifyContent: 'center', gap: spacing.lg, marginTop: spacing.xs }}>
            {tab === 'signin' && (
              <button type="button" onClick={() => switchTab('forgot')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: fontSize.sm, color: colors.textSecondary, padding: 0 }}>
                Forgot password?
              </button>
            )}
            {tab === 'forgot' && (
              <button type="button" onClick={() => switchTab('signin')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: fontSize.sm, color: colors.textSecondary, padding: 0 }}>
                ← Back to sign in
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
