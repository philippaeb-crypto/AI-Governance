import { Initiative, UserAccount, UserRole } from './types';

export function canEditInitiative(
  user: UserAccount,
  initiative: Initiative
): boolean {
  if (user.role === UserRole.GOVERNANCE) {
    return true;
  }
  if (user.role === UserRole.EMPLOYEE) {
    return initiative.ownerId === user.id;
  }
  // ADMIN is reserved for future configuration in Phase 2
  return false;
}

export function canCreateInitiative(user: UserAccount): boolean {
  return user.role === UserRole.EMPLOYEE || user.role === UserRole.GOVERNANCE;
}

export function canMarkOwnerReviewed(
  user: UserAccount,
  initiative: Initiative
): boolean {
  return canEditInitiative(user, initiative);
}

export function canTransitionLifecycle(
  user: UserAccount,
  initiative: Initiative
): boolean {
  // Governance manages lifecycle across all initiatives; owners can also update status on own items
  return canEditInitiative(user, initiative);
}

export function canAccessGovernanceWorkspace(user: UserAccount): boolean {
  return user.role === UserRole.GOVERNANCE;
}
