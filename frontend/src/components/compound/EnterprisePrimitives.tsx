import React, { createContext, useContext, useState } from 'react';
import { ROLE_LABELS } from '../../services/enterpriseService';
import {
  Eye,
  EyeOff,
  Lock,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import {
  EnterpriseRole,
  NavSection,
  RBAC_MATRIX,
  RolePermissions,
  maskClinicalRecord,
  maskEmailAddress,
  maskNationalId,
  maskPhoneNumber,
} from '../../services/enterpriseService';

export type RadiusTokenPreset = '8px' | '12px' | '16px';
export type SyncEngineStatus = 'synced' | 'offline-draft' | 'syncing';

export interface PrefetchCacheEntry {
  section: NavSection;
  warmedAt: string;
  hits: number;
}

interface SecurityScopeContextValue {
  role: EnterpriseRole;
  permissions: RolePermissions;
  isDataMasked: boolean;
  onToggleGlobalMask?: () => void;
  onSwitchRole?: (role: EnterpriseRole) => void;
  radiusToken: RadiusTokenPreset;
  onChangeRadiusToken?: (radius: RadiusTokenPreset) => void;
  // Predictive Prefetching Engine
  prefetchedMap?: Record<NavSection, PrefetchCacheEntry>;
  onPrefetchNav?: (section: NavSection) => void;
  // Offline-First Sync Engine
  isOnline?: boolean;
  syncStatus?: SyncEngineStatus;
  pendingOutboxCount?: number;
  lastSyncedAt?: string;
  hasSavedDraft?: boolean;
  onToggleOfflineSimulation?: () => void;
  onTriggerManualSync?: () => void;
}

const SecurityScopeContext = createContext<SecurityScopeContextValue>({
  role: 'Admin',
  permissions: RBAC_MATRIX.Admin,
  isDataMasked: true,
  radiusToken: '12px',
});

export const useSecurityScope = () => useContext(SecurityScopeContext);

interface SecurityScopeProviderProps {
  role: EnterpriseRole;
  isDataMasked: boolean;
  onToggleGlobalMask?: () => void;
  onSwitchRole?: (role: EnterpriseRole) => void;
  radiusToken?: RadiusTokenPreset;
  onChangeRadiusToken?: (radius: RadiusTokenPreset) => void;
  prefetchedMap?: Record<NavSection, PrefetchCacheEntry>;
  onPrefetchNav?: (section: NavSection) => void;
  isOnline?: boolean;
  syncStatus?: SyncEngineStatus;
  pendingOutboxCount?: number;
  lastSyncedAt?: string;
  hasSavedDraft?: boolean;
  onToggleOfflineSimulation?: () => void;
  onTriggerManualSync?: () => void;
  children: React.ReactNode;
}

export const SecurityScopeProvider: React.FC<SecurityScopeProviderProps> = ({
  role,
  isDataMasked,
  onToggleGlobalMask,
  onSwitchRole,
  radiusToken = '12px',
  onChangeRadiusToken,
  prefetchedMap,
  onPrefetchNav,
  isOnline = true,
  syncStatus = 'synced',
  pendingOutboxCount = 0,
  lastSyncedAt = 'เมื่อสักครู่',
  hasSavedDraft = false,
  onToggleOfflineSimulation,
  onTriggerManualSync,
  children,
}) => {
  const permissions = RBAC_MATRIX[role];
  return (
    <SecurityScopeContext.Provider
      value={{
        role,
        permissions,
        isDataMasked,
        onToggleGlobalMask,
        onSwitchRole,
        radiusToken,
        onChangeRadiusToken,
        prefetchedMap,
        onPrefetchNav,
        isOnline,
        syncStatus,
        pendingOutboxCount,
        lastSyncedAt,
        hasSavedDraft,
        onToggleOfflineSimulation,
        onTriggerManualSync,
      }}
    >
      {children}
    </SecurityScopeContext.Provider>
  );
};

/* ============================================================================
   1. <PDPAShield> Compound Primitive
   Automatically masks Thai National ID (13-digit CID), phone, email, or clinical
   records and enforces RBAC permission checks before allowing inline reveal.
   ============================================================================ */

export type PDPADataFieldType = 'cid' | 'phone' | 'email' | 'clinical';

interface PDPAShieldProps {
  value: string;
  type: PDPADataFieldType;
  forceUnmasked?: boolean;
  allowInlineToggle?: boolean;
  className?: string;
}

export const PDPAShield: React.FC<PDPAShieldProps> = ({
  value,
  type,
  forceUnmasked = false,
  allowInlineToggle = false,
  className = '',
}) => {
  const { permissions, isDataMasked } = useSecurityScope();
  const [localReveal, setLocalReveal] = useState(false);

  const canUnmask = permissions.canViewUnmaskedPII;
  const shouldShowRaw = canUnmask && (!isDataMasked || forceUnmasked || localReveal);

  const formattedValue = React.useMemo(() => {
    if (shouldShowRaw) return value;
    switch (type) {
      case 'cid':
        return maskNationalId(value, false);
      case 'phone':
        return maskPhoneNumber(value, false);
      case 'email':
        return maskEmailAddress(value, false);
      case 'clinical':
        return maskClinicalRecord(value, false);
      default:
        return value;
    }
  }, [value, type, shouldShowRaw]);

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className="font-mono-tabular">{formattedValue}</span>
      {allowInlineToggle && (
        <button
          type="button"
          disabled={!canUnmask}
          onClick={(e) => {
            e.stopPropagation();
            if (!canUnmask) return;
            setLocalReveal((prev) => !prev);
          }}
          title={
            !canUnmask
              ? 'จำกัดสิทธิ์ PDPA สำหรับเจ้าหน้าที่ทั่วไป'
              : shouldShowRaw
              ? 'คลิกเพื่อซ่อนข้อมูลส่วนบุคคล (PDPA)'
              : 'คลิกเพื่อถอดรหัสเฉพาะจุด'
          }
          className={`min-h-[28px] px-1.5 py-0.5 rounded-md border text-xs font-semibold inline-flex items-center gap-1 transition-colors ${
            !canUnmask
              ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed'
              : shouldShowRaw
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 cursor-pointer'
              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-ink-3 hover:border-slate-300 cursor-pointer'
          }`}
        >
          {!canUnmask ? (
            <Lock className="w-3 h-3 shrink-0" />
          ) : shouldShowRaw ? (
            <EyeOff className="w-3 h-3 shrink-0" />
          ) : (
            <Eye className="w-3 h-3 shrink-0" />
          )}
          <span>{!canUnmask ? 'PDPA' : shouldShowRaw ? 'ซ่อน' : 'ดู'}</span>
        </button>
      )}
    </span>
  );
};

/* ============================================================================
   2. <RBACGuard> & <ZeroTrustViewGuard> Compound Primitives
   Declaratively guards UI actions & views based on Zero-Trust RBAC policy.
   ============================================================================ */

interface RBACGuardProps {
  requirePermission: keyof Omit<RolePermissions, 'role' | 'label'>;
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export const RBACGuard: React.FC<RBACGuardProps> = ({
  requirePermission,
  fallback = null,
  children,
}) => {
  const { permissions } = useSecurityScope();
  const isAllowed = Boolean(permissions[requirePermission]);

  if (!isAllowed) {
    return <>{fallback}</>;
  }
  return <>{children}</>;
};

interface ZeroTrustViewGuardProps {
  allowedRoles: EnterpriseRole[];
  resourceName: string;
  securityPolicyCode?: string;
  children: React.ReactNode;
}

export const ZeroTrustViewGuard: React.FC<ZeroTrustViewGuardProps> = ({
  allowedRoles,
  resourceName,
  securityPolicyCode = 'ZT-RBAC-SEC-403',
  children,
}) => {
  const { role, onSwitchRole } = useSecurityScope();
  const isAuthorized = allowedRoles.includes(role);

  if (isAuthorized) {
    return <>{children}</>;
  }

  return (
    <div className="gov-card p-5 sm:p-6 border-amber-300/80 dark:border-amber-800/80 bg-amber-50/50 dark:bg-amber-950/20 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-amber-200/70 dark:border-amber-800/60">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-600 text-white flex items-center justify-center shrink-0 shadow-xs">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-base sm:text-lg font-bold text-ink">
                ปิดกั้นการเข้าถึงส่วนควบคุม ({resourceName})
              </h4>
              <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 font-mono-tabular text-xs font-bold">
                {securityPolicyCode}
              </span>
            </div>
            <p className="text-sm font-medium text-ink-3 mt-1 leading-relaxed">
              บัญชีผู้ใช้งานปัจจุบันมีระดับสิทธิ์ <strong>{ROLE_LABELS[role]}</strong> ซึ่งไม่อยู่ในเกณฑ์ที่ได้รับอนุญาต ({allowedRoles.map((r) => ROLE_LABELS[r]).join(' / ')}) ตามนโยบายความปลอดภัยและ PDPA
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="text-sm font-medium text-ink-3 flex items-center gap-2">
          <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
          <span>บันทึกเหตุการณ์ลงในบันทึกการเข้าถึงอัตโนมัติ · สลับสิทธิ์ด้านขวาเพื่อปลดล็อก</span>
        </div>

        {onSwitchRole && (
          <div className="flex flex-wrap items-center gap-2">
            {allowedRoles.map((targetRole) => (
              <button
                key={targetRole}
                type="button"
                onClick={() => onSwitchRole(targetRole)}
                className="min-h-[44px] px-3.5 py-2 rounded-lg btn-brand text-white text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 cursor-pointer instant-press"
              >
                <UserCheck className="w-4 h-4 shrink-0" />
                <span>สลับเป็นสิทธิ์{ROLE_LABELS[targetRole]}ทันที</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};


/* ============================================================================
   3. <EnterpriseCard> Compound Component System
   Flexible, composable slots (Root, Header, Title, Description, Body, Footer)
   automatically bound to CSS Design Tokens (--token-surface-card, --token-radius-card)
   ============================================================================ */

interface EnterpriseCardRootProps {
  children: React.ReactNode;
  className?: string;
  as?: 'section' | 'article' | 'div';
}

const EnterpriseCardRoot: React.FC<EnterpriseCardRootProps> = ({
  children,
  className = '',
  as: Component = 'section',
}) => {
  return (
    <Component className={`gov-card overflow-hidden transition-colors ${className}`}>
      {children}
    </Component>
  );
};

interface EnterpriseCardHeaderProps {
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

const EnterpriseCardHeader: React.FC<EnterpriseCardHeaderProps> = ({
  children,
  actions,
  className = '',
}) => {
  return (
    <div
      className={`p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${className}`}
    >
      <div className="min-w-0 space-y-1">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
};

const EnterpriseCardTitle: React.FC<{
  children: React.ReactNode;
  badge?: string;
  className?: string;
}> = ({ children, badge, className = '' }) => (
  <div className="flex flex-wrap items-center gap-2">
    <h3
      className={`text-base sm:text-lg font-bold tracking-tight text-ink leading-snug ${className}`}
    >
      {children}
    </h3>
    {badge && (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-brand-soft text-brand text-xs font-mono-tabular font-bold">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
        <span>{badge}</span>
      </span>
    )}
  </div>
);

const EnterpriseCardDescription: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <p className={`text-sm font-medium text-ink-3 leading-relaxed ${className}`}>
    {children}
  </p>
);

const EnterpriseCardBody: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`p-4 sm:p-5 ${className}`}>{children}</div>
);

const EnterpriseCardFooter: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`px-4 sm:px-5 py-3.5 bg-slate-50/70 dark:bg-slate-900/60 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-sm font-medium ${className}`}
  >
    {children}
  </div>
);

export const EnterpriseCard = {
  Root: EnterpriseCardRoot,
  Header: EnterpriseCardHeader,
  Title: EnterpriseCardTitle,
  Description: EnterpriseCardDescription,
  Body: EnterpriseCardBody,
  Footer: EnterpriseCardFooter,
};
