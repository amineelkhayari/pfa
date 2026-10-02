import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Smartphone,
  MessageSquare,
  Webhook,
  FileText,
  ClipboardList,
  LogOut,
  Send,
  Server,
  Puzzle,
  Sun,
  Moon,
  Monitor,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  Languages,
  UserRound,
  UsersRound,
  CreditCard,
  Bot,
  Megaphone,
  ContactRound,
  Activity,
  CircleHelp,
  GraduationCap,
  Store,
  Gauge,
} from 'lucide-react';
import { useTheme } from '../hooks/useTheme';
import { type UserRole } from '../hooks/useRole';
import { languageOptions, resolveSupportedLanguage, rtlLanguages, type SupportedLanguage } from '../i18n';
import { healthApi } from '../services/api';
import './Layout.css';
import { ProductTour, START_PRODUCT_TOUR_EVENT } from './ProductTour';
import { NotificationBell } from './NotificationBell';

interface LayoutProps {
  onLogout: () => void;
  userRole: UserRole | null;
}

interface NavItem {
  to: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  key: string;
  badge?: string;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const themeIcons = { light: Sun, dark: Moon, system: Monitor };

export function Layout({ onLogout, userRole }: LayoutProps) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme, resolvedTheme } = useTheme();
  const ThemeIcon = themeIcons[theme];
  const themeLabel = t(`theme.${theme}`);

  const navSections: NavSection[] =
    userRole === 'admin'
      ? [
          {
            title: t('nav.sections.overview', 'Overview'),
            items: [{ to: '/', icon: Gauge, key: 'dashboard' }],
          },
          {
            title: t('nav.sections.tenancy', 'Customers & Plans'),
            items: [
              { to: '/admin/users', icon: UsersRound, key: 'users' },
              { to: '/admin/payments', icon: CreditCard, key: 'payments' },
            ],
          },
          {
            title: t('nav.sections.intelligence', 'AI & Automations'),
            items: [
              { to: '/admin/ai', icon: Bot, key: 'aiSettings' },
              { to: '/admin/automation-logs', icon: Activity, key: 'automationLogs' },
            ],
          },
          {
            title: t('nav.sections.operations', 'Platform & Ops'),
            items: [
              { to: '/infrastructure', icon: Server, key: 'infrastructure' },
              { to: '/plugins', icon: Puzzle, key: 'plugins' },
              { to: '/logs', icon: FileText, key: 'logs' },
              { to: '/account', icon: UserRound, key: 'account' },
            ],
          },
        ]
      : [
          {
            title: t('nav.sections.main', 'Main'),
            items: [
              { to: '/', icon: LayoutDashboard, key: 'dashboard' },
              { to: '/chats', icon: MessageSquare, key: 'chats' },
            ],
          },
          {
            title: t('nav.sections.commerce', 'Commerce & Bot'),
            items: [
              { to: '/stores', icon: Store, key: 'stores' },
              { to: '/sessions', icon: Smartphone, key: 'sessions' },
              { to: '/ai-test', icon: Bot, key: 'aiTest' },
            ],
          },
          {
            title: t('nav.sections.marketing', 'Marketing'),
            items: [
              { to: '/campaigns', icon: Megaphone, key: 'campaigns' },
              { to: '/templates', icon: ClipboardList, key: 'templates' },
              { to: '/contacts', icon: ContactRound, key: 'contacts' },
            ],
          },
          {
            title: t('nav.sections.settings', 'Settings & Tools'),
            items: [
              { to: '/message-tester', icon: Send, key: 'messageTester' },
              { to: '/webhooks', icon: Webhook, key: 'webhooks' },
              { to: '/logs', icon: FileText, key: 'logs' },
              { to: '/guide', icon: GraduationCap, key: 'guide' },
              { to: '/account', icon: UserRound, key: 'account' },
            ],
          },
        ];

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  // Show the build-time version immediately, then replace it with the live running version from the
  // backend so a stale-built bundle can't display the wrong number. Falls back silently on error.
  const [version, setVersion] = useState(__APP_VERSION__);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);
  const languageMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setIsMobileOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    let active = true;
    healthApi
      .check()
      .then(info => {
        if (active && info?.version) setVersion(info.version);
      })
      .catch(() => {
        /* keep the build-time fallback */
      });
    return () => {
      active = false;
    };
  }, []);

  const handleNavClick = () => {
    if (isMobile) setIsMobileOpen(false);
  };

  useEffect(() => {
    document.body.style.overflow = isMobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileOpen]);

  useEffect(() => {
    if (!isLanguageMenuOpen) return;

    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!languageMenuRef.current?.contains(event.target as Node)) {
        setIsLanguageMenuOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsLanguageMenuOpen(false);
    };

    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isLanguageMenuOpen]);

  const toggleCollapse = () => setIsCollapsed(!isCollapsed);
  const toggleMobile = () => setIsMobileOpen(!isMobileOpen);

  const currentLang = resolveSupportedLanguage(i18n.resolvedLanguage || i18n.language);
  const languageLabel = languageOptions.find(option => option.value === currentLang)?.compactLabel ?? 'EN';
  const changeLanguage = (language: SupportedLanguage) => {
    setIsLanguageMenuOpen(false);
    void i18n.changeLanguage(language);
  };
  const isRtl = rtlLanguages.includes(currentLang);

  return (
    <div className="layout">
      {isMobile && (
        <header className="mobile-header">
          <button className="mobile-menu-btn" onClick={toggleMobile} aria-label={t('common.expand')}>
            {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
          <div className="mobile-brand">
            <img src="/smartconfirm_logo.webp" alt="SmartConfirm" className="sidebar-logo" />
            <span className="brand-name">{t('common.appName')}</span>
          </div>
          <div style={{ width: 40 }} />
        </header>
      )}

      {isMobile && isMobileOpen && <div className="sidebar-overlay" onClick={() => setIsMobileOpen(false)} />}

      <aside
        className={`sidebar ${isCollapsed ? 'collapsed' : ''} ${isMobile ? 'mobile' : ''} ${isMobileOpen ? 'open' : ''}`}
      >
        <div className="sidebar-header">
          <img src="/smartconfirm_logo.webp" alt="SmartConfirm" className="sidebar-logo" />
          {!isCollapsed && (
            <div className="sidebar-brand">
              <span className="brand-name">{t('common.appName')}</span>
            </div>
          )}
        </div>

        {!isMobile && (
          <button
            className="collapse-toggle"
            onClick={toggleCollapse}
            title={isCollapsed ? t('common.expand') : t('common.collapse')}
            aria-label={isCollapsed ? t('common.expand') : t('common.collapse')}
          >
            {isCollapsed ? (
              isRtl ? (
                <ChevronLeft size={16} />
              ) : (
                <ChevronRight size={16} />
              )
            ) : isRtl ? (
              <ChevronRight size={16} />
            ) : (
              <ChevronLeft size={16} />
            )}
          </button>
        )}

        <nav className="sidebar-nav">
          {navSections.map((section, sIdx) => (
            <div key={section.title || sIdx} className="nav-section">
              {section.title && !isCollapsed && (
                <div className="nav-section-title">{section.title}</div>
              )}
              {isCollapsed && sIdx > 0 && <div className="nav-section-divider" />}
              {section.items.map(({ to, icon: Icon, key }) => {
                const label = t(`nav.${key}`, {
                  defaultValue:
                    key === 'contacts'
                      ? 'Contacts'
                      : key === 'campaigns'
                        ? 'Campaigns & Report'
                        : key === 'account'
                          ? 'My Account'
                          : key === 'users'
                            ? 'Users & Merchants'
                            : key === 'payments'
                              ? 'Billing & Plans'
                              : key === 'aiSettings'
                                ? 'AI Settings'
                                : key === 'aiTest'
                                  ? 'Test AI Agent'
                                  : key === 'automationLogs'
                                    ? 'AI & Automation Logs'
                                    : key === 'guide'
                                      ? 'Setup Guide'
                                      : key,
                });
                return (
                  <NavLink
                    key={to}
                    to={to}
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                    end={to === '/'}
                    onClick={handleNavClick}
                    title={isCollapsed ? label : undefined}
                    data-tour={`nav-${key}`}
                  >
                    <Icon size={19} />
                    {!isCollapsed && <span>{label}</span>}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <NotificationBell collapsed={isCollapsed} />
          {userRole === 'operator' && (
            <button
              className="theme-toggle-btn"
              type="button"
              onClick={() => window.dispatchEvent(new Event(START_PRODUCT_TOUR_EVENT))}
              title="Product tour"
            >
              <CircleHelp size={18} />
              {!isCollapsed && <span>Product tour</span>}
            </button>
          )}
          <div className="language-menu" ref={languageMenuRef}>
            <button
              className="theme-toggle-btn"
              onClick={() => setIsLanguageMenuOpen(open => !open)}
              title={t('common.language')}
              aria-label={t('common.language')}
              aria-haspopup="menu"
              aria-expanded={isLanguageMenuOpen}
            >
              <Languages size={18} />
              {!isCollapsed && <span>{languageLabel}</span>}
            </button>
            {isLanguageMenuOpen && (
              <div className="language-menu-list" role="menu" aria-label={t('common.language')}>
                {languageOptions.map(option => (
                  <button
                    key={option.value}
                    className={`language-menu-item ${option.value === currentLang ? 'active' : ''}`}
                    onClick={() => changeLanguage(option.value)}
                    role="menuitemradio"
                    aria-checked={option.value === currentLang}
                  >
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="appearance-menu">
            <button
              className="theme-toggle-btn"
              onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
              title={t('theme.toggleTo', { value: t(resolvedTheme === 'dark' ? 'theme.light' : 'theme.dark') })}
              aria-label={t('theme.toggleTo', { value: t(resolvedTheme === 'dark' ? 'theme.light' : 'theme.dark') })}
            >
              <span className="appearance-button-cue" aria-hidden="true">
                <ThemeIcon size={16} />
              </span>
              {!isCollapsed && <span>{themeLabel}</span>}
            </button>
          </div>
          <button className="logout-btn" onClick={onLogout} title={isCollapsed ? t('common.logout') : undefined}>
            <LogOut size={20} />
            {!isCollapsed && <span>{t('common.logout')}</span>}
          </button>
          {!isCollapsed && (
            <div className="sidebar-version" style={{ fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '6px 0 2px' }}>
              v{version}
            </div>
          )}
        </div>
      </aside>

      <main className={`main-content ${isCollapsed ? 'expanded' : ''} ${isMobile ? 'mobile' : ''}`}>
        <Outlet />
      </main>
      <ProductTour role={userRole} />
    </div>
  );
}
