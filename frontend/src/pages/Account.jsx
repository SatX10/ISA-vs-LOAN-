import { useState } from 'react';
import { ArrowUpRight, LogIn, LogOut, UserRound } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAccount } from '../account/AccountProvider.jsx';
import { BudgetField, PriorityField } from '../account/PlanningFields.jsx';
import Spending from '../account/Spending.jsx';
import LoadingPanel from '../components/LoadingPanel.jsx';
import '../theme/account.css';

const SOCIAL_ERRORS = new Map([
  ['unavailable', 'This account provider hasn’t been configured yet. You can continue with email.'],
  ['expired', 'That sign-in request expired. Choose your account provider again.'],
  ['cancelled', 'Sign-in was cancelled. You can try again whenever you’re ready.'],
  ['failed', 'The provider couldn’t complete sign-in. Try again or continue with email.'],
  ['existing_account', 'An ISA Truth profile already uses this email. Sign in with the method you originally used.'],
  ['missing_email', 'The provider didn’t supply an email for this profile. Try another account or continue with email.'],
]);

function AccountStatus({ status, retry }) {
  if (status === 'loading') return <LoadingPanel label="Checking account" />;
  return (
    <div className="workspace-form">
      <p role="status" className="workspace-message">
        {status === 'unavailable'
          ? 'Accounts are currently unavailable. You can still use the calculator and planner.'
          : 'Your account status could not be loaded. Try again.'}
      </p>
      {status === 'error' && <button type="button" onClick={retry} className="btn btn-secondary">Retry</button>}
    </div>
  );
}

export function AuthPage({ creating = false }) {
  const { profile, status, authenticate, retry } = useAccount();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const location = useLocation();
  const query = new URLSearchParams(location.search);
  const requested = location.state?.returnTo ?? query.get('oauth_return');
  const privateReport = /^\/workspace\?report=[a-fA-F0-9-]{36}$/.test(requested ?? '');
  const reportInvite = /^\/workspace#invite=[A-Za-z0-9_-]{32}$/.test(requested ?? '');
  const destination = privateReport || reportInvite || ['/planner', '/workspace'].includes(requested) ? requested : '/profile';
  const socialError = SOCIAL_ERRORS.get(query.get('oauth_error'));
  const socialParams = new URLSearchParams({ page: creating ? 'sign-up' : 'sign-in', target: destination.split(/[?#]/)[0].slice(1) });
  const title = creating ? 'Create your account' : 'Sign in';
  const Icon = creating ? UserRound : LogIn;

  async function submit(event) {
    event.preventDefault();
    if (pending) return;
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    setPending(true);
    setError('');
    try {
      await authenticate(fields, creating);
      navigate(destination, { replace: true });
    } catch (error) {
      setError(error.message);
    } finally {
      setPending(false);
    }
  }

  if (profile) return <Navigate to={destination} replace />;

  return (
    <div className="account-page">
      <section className="card account-card">
        <div className="workspace-icon"><Icon size={23} strokeWidth={1.75} aria-hidden="true" /></div>
        <header className="page-header">
          <h1>{title}</h1>
          <p>{creating ? 'Save your repayment budget and planning priority.' : 'Use your saved planning preferences.'}</p>
        </header>
        {status !== 'ready' ? <AccountStatus status={status} retry={retry} /> : (
          <>
          <div className="account-providers" aria-label="Continue with an account provider" role="group">
            {['Google', 'Microsoft'].map((provider) => (
              <a key={provider} className="btn btn-secondary"
                href={`/api/auth/oauth/${provider.toLowerCase()}/start?${socialParams}`}>
                Continue with {provider}
              </a>
            ))}
          </div>
          {socialError && <p role="alert" className="workspace-message">{socialError}</p>}
          <p className="account-divider">or continue with email</p>
          <form className="workspace-form" onSubmit={submit} key={title}>
            {creating && (
              <label className="workspace-field"><span>Display name</span>
                <input name="display_name" autoComplete="name" maxLength="80" required />
              </label>
            )}
            <label className="workspace-field"><span>Email</span>
              <input name="email" type="email" autoComplete="username" maxLength="254" required />
            </label>
            <label className="workspace-field"><span>Password</span>
              <input name="password" type="password" autoComplete={creating ? 'new-password' : 'current-password'}
                minLength={creating ? 12 : undefined} maxLength="128" required
                aria-describedby={creating ? 'password-tip' : undefined} />
              {creating && <small id="password-tip">Use at least 12 characters.</small>}
            </label>
            {error && <p className="workspace-message" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? 'Please wait…' : creating ? 'Create account' : 'Sign in'}
            </button>
          </form>
          </>
        )}
        <p className="account-switch">
          {creating ? 'Already have an account?' : 'New to ISA Truth?'}{' '}
          <Link to={creating ? '/sign-in' : '/sign-up'} state={{ returnTo: destination }}>
            {creating ? 'Sign in' : 'Create an account'}
          </Link>
        </p>
      </section>
    </div>
  );
}

function ProfileForm({ profile, update, logOut }) {
  const [name, setName] = useState(profile.display_name);
  const [budget, setBudget] = useState(String(profile.monthly_budget_inr ?? ''));
  const [priority, setPriority] = useState(profile.priority);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const navigate = useNavigate();

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setError('');
    setNotice('');
    try {
      await update({ display_name: name, monthly_budget_inr: budget === '' ? null : Number(budget), priority });
      setNotice('Preferences saved.');
    } catch (error) {
      setError(error.message);
    } finally {
      setPending(false);
    }
  }

  async function signOut() {
    setPending(true);
    setError('');
    setNotice('');
    try {
      await logOut();
      navigate('/sign-in', { replace: true });
    } catch (error) {
      setError(error.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="workspace-form" onSubmit={submit}>
      <label className="workspace-field"><span>Display name</span>
        <input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} maxLength="80" required />
      </label>
      <label className="workspace-field"><span>Email</span>
        <input type="email" value={profile.email} readOnly />
      </label>
      <BudgetField value={budget} onChange={setBudget} optional />
      <PriorityField value={priority} onChange={setPriority} />
      {error && <p role="alert" className="workspace-message">{error}</p>}
      {notice && <p role="status" className="workspace-message">{notice}</p>}
      <div className="workspace-actions">
        <button type="submit" className="btn btn-primary" disabled={pending}>Save profile</button>
        <button type="button" className="btn btn-secondary" onClick={signOut} disabled={pending}>
          <LogOut size={17} strokeWidth={1.75} aria-hidden="true" /> Sign out
        </button>
      </div>
    </form>
  );
}

export function ProfilePage() {
  const { profile, status, update, logOut, retry } = useAccount();
  if (status === 'ready' && !profile) return <Navigate to="/sign-in" replace />;
  return (
    <div className="account-dashboard">
      <header className="page-header account-heading">
        <div className="workspace-icon"><UserRound size={23} strokeWidth={1.75} aria-hidden="true" /></div>
        <div>
          <h1>Your account</h1>
          <p>Manage your profile, log education expenses, and plan for repayment.</p>
          {profile && <a className="workspace-text-link account-profile-jump" href="#profile-title">Jump to profile settings</a>}
        </div>
      </header>
      {profile ? (
        <div className="account-dashboard-grid" key={profile.email}>
          <Spending />
          <section className="card account-settings" aria-labelledby="profile-title">
            <h2 id="profile-title">Profile and preferences</h2>
            <ProfileForm {...{ profile, update, logOut }} />
            <p>Your repayment budget and priority prefill the AI Planner.</p>
            <Link to="/planner" className="workspace-text-link">
              Open AI Planner <ArrowUpRight size={16} strokeWidth={1.75} aria-hidden="true" />
            </Link>
          </section>
        </div>
      ) : (
        <section className="card"><AccountStatus status={status} retry={retry} /></section>
      )}
    </div>
  );
}
