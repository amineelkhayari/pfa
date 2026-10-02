import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Smartphone,
  Store,
  Bot,
  CheckCircle2,
  Circle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import './OnboardingWizard.css';

interface OnboardingWizardProps {
  hasReadySession: boolean;
  hasStore: boolean;
  hasConfirmedOrders: boolean;
}

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  hasReadySession,
  hasStore,
  hasConfirmedOrders,
}) => {
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);

  const steps = [
    {
      id: 1,
      title: 'Connect WhatsApp Number',
      description: 'Scan the QR code with WhatsApp on your phone to link your messaging channel.',
      isDone: hasReadySession,
      actionText: hasReadySession ? 'Manage Sessions' : 'Scan QR Code',
      icon: Smartphone,
      link: '/sessions',
    },
    {
      id: 2,
      title: 'Link Your Online Store',
      description: 'Connect Shopify, WooCommerce, or YouCan to sync orders and catalog.',
      isDone: hasStore,
      actionText: hasStore ? 'View Stores' : 'Connect Store',
      icon: Store,
      link: '/stores',
    },
    {
      id: 3,
      title: 'Test & Activate AI Sales Agent',
      description: 'Test the AI assistant in Moroccan Darija/Arabic/French and enable auto-confirmations.',
      isDone: hasConfirmedOrders || (hasReadySession && hasStore),
      actionText: 'Test AI Agent',
      icon: Bot,
      link: '/ai-test',
    },
  ];

  const completedSteps = steps.filter(s => s.isDone).length;
  const progressPercent = Math.round((completedSteps / steps.length) * 100);

  // If all steps completed, we default to collapsed or small badge
  if (completedSteps === steps.length && isCollapsed) {
    return (
      <div className="onboarding-collapsed-card" onClick={() => setIsCollapsed(false)}>
        <div className="onboarding-collapsed-left">
          <CheckCircle2 size={20} className="text-success" />
          <span>Setup Complete! All automations are active.</span>
        </div>
        <button type="button" className="btn-text">
          Show Checklist <ChevronDown size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="onboarding-wizard-card">
      <div className="onboarding-wizard-header">
        <div className="onboarding-header-title">
          <div className="onboarding-sparkle-icon">
            <Sparkles size={20} />
          </div>
          <div>
            <h3>Getting Started with SmartConfirm</h3>
            <p className="onboarding-header-subtitle">
              Complete these steps to automate WhatsApp order confirmations and sales recovery.
            </p>
          </div>
        </div>
        <div className="onboarding-header-actions">
          <div className="onboarding-progress-badge">
            <span>{progressPercent}% Complete</span>
            <div className="onboarding-progress-bar-bg">
              <div
                className="onboarding-progress-bar-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          <button
            type="button"
            className="onboarding-collapse-btn"
            onClick={() => setIsCollapsed(!isCollapsed)}
            aria-label={isCollapsed ? 'Expand checklist' : 'Collapse checklist'}
          >
            {isCollapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </button>
        </div>
      </div>

      {!isCollapsed && (
        <div className="onboarding-steps-list">
          {steps.map(step => {
            const Icon = step.icon;
            return (
              <div
                key={step.id}
                className={`onboarding-step-item ${step.isDone ? 'step-completed' : 'step-pending'}`}
              >
                <div className="onboarding-step-status">
                  {step.isDone ? (
                    <CheckCircle2 size={22} className="text-success" />
                  ) : (
                    <Circle size={22} className="text-muted" />
                  )}
                </div>
                <div className="onboarding-step-icon-wrapper">
                  <Icon size={20} />
                </div>
                <div className="onboarding-step-info">
                  <h4>{step.title}</h4>
                  <p>{step.description}</p>
                </div>
                <button
                  type="button"
                  className={`onboarding-step-action-btn ${step.isDone ? 'btn-outline' : 'btn-primary'}`}
                  onClick={() => navigate(step.link)}
                >
                  <span>{step.actionText}</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
