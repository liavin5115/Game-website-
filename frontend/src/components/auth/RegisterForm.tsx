/** Register form with distinctive casino-inspired design */
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../../api/client';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../common/Button';
import { Input, Label } from '../common/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from '../common/Card';
import { FeltBackgroundCSS } from '../../design/Background';

export function RegisterForm() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const response = await authApi.register({ username, email, password });
      setAuth(response.data.user, response.data.access_token);
      navigate('/lobby');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 py-12">
      <FeltBackgroundCSS />

      <div className="relative z-10 w-full max-w-md">
        {/* Brand header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-gold-400 to-gold-600 shadow-lg mb-6">
            <svg className="w-10 h-10 text-felt-950" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-6 6l6 6m-6-6h12" />
            </svg>
          </div>
          <h1 className="font-display text-4xl md:text-5xl text-white tracking-tight">Game Platform</h1>
          <p className="text-gold-300 mt-2 text-lg">Join the table</p>
        </div>

        <Card variant="elevated" padding="lg" className="shadow-2xl">
          <CardHeader className="text-center pb-6 mb-6">
            <CardTitle size="md" className="text-white">Create Account</CardTitle>
            <CardDescription className="text-gold-300">Start playing in seconds</CardDescription>
          </CardHeader>

          {error && (
            <div className="mb-6 p-4 rounded-xl bg-error-light/10 border border-error-light/30 text-error-light text-sm flex items-center gap-2 animate-slide-up">
              <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
                placeholder="Choose a username"
                minLength={3}
                maxLength={20}
                leftIcon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                }
                disabled={loading}
              />
            </div>

            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="Enter your email"
                leftIcon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                }
                disabled={loading}
              />
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Create a password"
                minLength={8}
                helperText="At least 8 characters"
                leftIcon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                }
                disabled={loading}
              />
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Confirm your password"
                leftIcon={
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                }
                disabled={loading}
              />
            </div>

            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="terms"
                required
                className="w-4 h-4 mt-0.5 rounded border-gray-300 text-felt-600 focus:ring-felt-500 bg-white dark:bg-gray-800"
              />
              <label htmlFor="terms" className="text-sm text-text-secondary dark:text-text-secondaryDark">
                I agree to the{' '}
                <Link to="/terms" className="text-gold-400 hover:text-gold-300 font-medium">Terms of Service</Link>
                {' '}and{' '}
                <Link to="/privacy" className="text-gold-400 hover:text-gold-300 font-medium">Privacy Policy</Link>
              </label>
            </div>

            <Button type="submit" variant="gold" fullWidth loading={loading} size="lg" className="mt-2">
              Create Account
            </Button>
          </form>

          <CardFooter className="justify-center pt-6">
            <p className="text-text-secondary dark:text-text-secondaryDark text-center">
              Already have an account?{' '}
              <Link to="/login" className="text-gold-400 hover:text-gold-300 font-semibold transition-colors">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>

        {/* Benefits */}
        <div className="mt-8 grid grid-cols-3 gap-4 text-center">
          <div className="p-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
            <div className="w-10 h-10 mx-auto mb-2 bg-felt-500/20 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <p className="text-xs text-gold-300 font-medium">Secure</p>
            <p className="text-xs text-text-muted dark:text-text-mutedDark">Encrypted data</p>
          </div>
          <div className="p-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
            <div className="w-10 h-10 mx-auto mb-2 bg-felt-500/20 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-xs text-gold-300 font-medium">Instant</p>
            <p className="text-xs text-text-muted dark:text-text-mutedDark">Play immediately</p>
          </div>
          <div className="p-3 rounded-xl bg-white/5 backdrop-blur-sm border border-white/10">
            <div className="w-10 h-10 mx-auto mb-2 bg-felt-500/20 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-gold-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <p className="text-xs text-gold-300 font-medium">Fair Play</p>
            <p className="text-xs text-text-muted dark:text-text-mutedDark">Verified games</p>
          </div>
        </div>
      </div>
    </div>
  );
}