import React, { useMemo } from 'react';
import {
  AuthProvider,
  useAuth,
  deriveOperationalRole,
  computeOperationalRoleOutcome,
  type OperationalRoleCategory,
  type OperationalRoleOutcome
} from './AuthContext';
import { AcademyDataProvider, useAcademyData } from './AcademyDataContext';
import {
  FinanceProvider,
  useFinance,
  type TeacherFinancialSummary
} from './FinanceContext';
import { ModerationProvider, useModeration } from './ModerationContext';

export {
  deriveOperationalRole,
  computeOperationalRoleOutcome,
  type OperationalRoleCategory,
  type OperationalRoleOutcome,
  type TeacherFinancialSummary
};

/**
 * Fachada de compatibilidad: compone los 4 contextos especializados
 * (AuthContext -> AcademyDataContext -> FinanceContext -> ModerationContext)
 * manteniendo `AppProvider` y `useApp` para cualquier consumidor heredado.
 */
export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <AuthProvider>
      <AcademyDataProvider>
        <FinanceProvider>
          <ModerationProvider>{children}</ModerationProvider>
        </FinanceProvider>
      </AcademyDataProvider>
    </AuthProvider>
  );
};

export const useApp = () => {
  const auth = useAuth();
  const academy = useAcademyData();
  const finance = useFinance();
  const moderation = useModeration();

  return useMemo(
    () => ({
      ...auth,
      ...academy,
      ...finance,
      ...moderation
    }),
    [auth, academy, finance, moderation]
  );
};
