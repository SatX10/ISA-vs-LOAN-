import { createContext, useContext, useEffect, useRef, useState } from 'react';
import * as api from '../api/plannerClient.js';

const AccountContext = createContext(null);

export function AccountProvider({ children }) {
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const workspaceDraft = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    api.getSession(controller.signal).then(({ profile, available }) => {
      if (controller.signal.aborted) return;
      if (workspaceDraft.current?.email !== profile?.email) workspaceDraft.current = null;
      setProfile(profile);
      setStatus(available ? 'ready' : 'unavailable');
    }).catch(() => {
      if (!controller.signal.aborted) setStatus('error');
    });
    return () => controller.abort();
  }, [attempt]);

  async function authenticate(fields, creating) {
    const { profile } = await (creating ? api.signUp(fields) : api.signIn(fields));
    if (workspaceDraft.current?.email !== profile.email) workspaceDraft.current = null;
    setProfile(profile);
  }

  async function update(fields) {
    try {
      const { profile } = await api.savePreferences(fields);
      setProfile(profile);
    } catch (error) {
      if (error.status === 401) {
        workspaceDraft.current = null;
        setProfile(null);
      }
      throw error;
    }
  }

  async function logOut() {
    await api.signOut();
    workspaceDraft.current = null;
    setProfile(null);
  }

  function retry() {
    setStatus('loading');
    setAttempt((value) => value + 1);
  }

  return (
    <AccountContext.Provider value={{ profile, status, authenticate, update, logOut, retry, workspaceDraft }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  return useContext(AccountContext);
}
