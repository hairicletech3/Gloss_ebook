import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function Auth() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState('sending');
    setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      setState('idle');
    } else {
      setState('sent');
    }
  }

  return (
    <div className="auth">
      <form className="auth-box" onSubmit={send}>
        <div className="mark">
          Gloss<sup>01</sup>
        </div>
        <p>Read anything, in any language. Sign in and your books stay yours.</p>
        {state === 'sent' ? (
          <div className="auth-note">
            A sign-in link is on its way to {email}. Open it in this browser.
          </div>
        ) : (
          <>
            <input
              type="email"
              required
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email address"
            />
            <button className="chip solid" type="submit" disabled={state === 'sending'}>
              {state === 'sending' ? 'Sending …' : 'Send a magic link'}
            </button>
            {error && <div className="auth-note bad">{error}</div>}
          </>
        )}
      </form>
    </div>
  );
}
