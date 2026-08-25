import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Eye, EyeOff, Languages } from 'lucide-react';
import { GithubIcon } from '../components/GithubIcon';
import { CustomSelect } from '../components/CustomSelect';
import { languageOptions, resolveSupportedLanguage, type SupportedLanguage } from '../i18n';
import { API_BASE_URL } from '../services/api';
import './Login.css';

interface LoginProps {
  onLogin: (apiKey: string) => void;
  initialMode?: 'signin' | 'signup';
  onBack?: () => void;
}

export function Login({ onLogin, initialMode = 'signin', onBack }: LoginProps) {
  const { t, i18n } = useTranslation();
  const [apiKey, setApiKey] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup' | 'apiKey'>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const currentLang = resolveSupportedLanguage(i18n.resolvedLanguage || i18n.language);

  const changeLanguage = (language: SupportedLanguage) => {
    void i18n.changeLanguage(language);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'apiKey' && !apiKey.trim()) {
      setError(t('login.apiKeyRequired'));
      return;
    }
    if (mode !== 'apiKey' && (!username.trim() || !password)) {
      setError('Username and password are required.');
      return;
    }
    setIsLoading(true);
    setError('');

    try {
      const endpoint = mode === 'apiKey' ? 'validate' : mode;
      const response = await fetch(`${API_BASE_URL}/auth/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(mode === 'apiKey' ? { 'X-API-Key': apiKey } : {}),
        },
        ...(mode !== 'apiKey'
          ? {
              body: JSON.stringify(
                mode === 'signin' ? { identifier: username, password } : { name, email, username, password },
              ),
            }
          : {}),
      });

      if (response.ok) {
        if (mode === 'apiKey') onLogin(apiKey);
        else {
          const data = await response.json();
          onLogin(data.token);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.message || t('login.invalidKey'));
      }
    } catch {
      setError(t('login.connectionError'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-container">
      {onBack && (
        <button type="button" className="login-back" onClick={onBack}>
          <ArrowLeft size={18} /> Back to website
        </button>
      )}
      <div className="login-card">
        <div className="login-logo">
          <img src="/openwa_logo.webp" alt="OpenWA" className="logo-icon" />
          <span className="version-info">
            {t('login.version', {
              version: __APP_VERSION__,
              // ISO date (YYYYMMDD) so the format is stable across locales/regions instead of the
              // locale-dependent toLocaleDateString() which renders differently per browser region.
              date: new Date(__BUILD_TIME__).toISOString().slice(0, 10).replace(/-/g, ''),
            })}
          </span>
        </div>

        <div className="login-language">
          <Languages size={18} />
          <CustomSelect
            value={currentLang}
            onChange={value => changeLanguage(value as SupportedLanguage)}
            options={languageOptions.map(opt => ({ value: opt.value, label: opt.label }))}
            ariaLabel={t('common.language')}
          />
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="auth-tabs">
            <button type="button" className={mode === 'signin' ? 'active' : ''} onClick={() => setMode('signin')}>
              Sign in
            </button>
            <button type="button" className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>
              Sign up
            </button>
            <button type="button" className={mode === 'apiKey' ? 'active' : ''} onClick={() => setMode('apiKey')}>
              API key
            </button>
          </div>
          {mode === 'signup' && (
            <>
              <div className="input-group">
                <label htmlFor="name">Full name</label>
                <div className="input-wrapper">
                  <input id="name" value={name} onChange={e => setName(e.target.value)} required />
                </div>
              </div>
              <div className="input-group">
                <label htmlFor="email">Email</label>
                <div className="input-wrapper">
                  <input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
              </div>
            </>
          )}
          {mode !== 'apiKey' && (
            <>
              <div className="input-group">
                <label htmlFor="username">Username or email</label>
                <div className="input-wrapper">
                  <input id="username" value={username} onChange={e => setUsername(e.target.value)} required />
                </div>
              </div>
              <div className="input-group">
                <label htmlFor="password">Password</label>
                <div className="input-wrapper">
                  <input
                    id="password"
                    type={showKey ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    minLength={mode === 'signup' ? 8 : undefined}
                    required
                  />
                  <button type="button" className="toggle-visibility" onClick={() => setShowKey(!showKey)}>
                    {showKey ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
            </>
          )}
          {mode === 'apiKey' && (
            <div className="input-group">
              <label htmlFor="apiKey">{t('login.apiKey')}</label>
              <div className="input-wrapper">
                <input
                  id="apiKey"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={t('login.apiKeyPlaceholder')}
                  className={error ? 'error' : ''}
                />
                <button
                  type="button"
                  className="toggle-visibility"
                  onClick={() => setShowKey(!showKey)}
                  aria-label={showKey ? t('common.hideApiKey') : t('common.showApiKey')}
                >
                  {showKey ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
              {error && <span className="error-message">{error}</span>}
            </div>
          )}
          {mode !== 'apiKey' && error && <span className="error-message auth-error">{error}</span>}

          <button type="submit" className="connect-btn" disabled={isLoading}>
            {isLoading
              ? 'Please wait…'
              : mode === 'signup'
                ? 'Create free account'
                : mode === 'signin'
                  ? 'Sign in'
                  : t('login.connect')}
          </button>
        </form>

        <p className="login-help">
          {t('login.help')}{' '}
          <a href="https://docs.open-wa.org" target="_blank" rel="noopener noreferrer">
            {t('login.viewDocs')}
          </a>
        </p>
      </div>

      <footer className="login-footer">
        <span>{t('login.footer')}</span>
        <a
          href="https://github.com/rmyndharis/OpenWA"
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
          aria-label="GitHub"
        >
          <GithubIcon size={18} />
        </a>
      </footer>
    </div>
  );
}
