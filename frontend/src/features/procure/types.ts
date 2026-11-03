export interface Permissions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export type Notify = (message: string, kind: 'success' | 'error') => void;
