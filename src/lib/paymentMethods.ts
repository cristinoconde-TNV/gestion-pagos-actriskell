import { PaymentMethod } from '../types';
import { TranslationKey } from './i18n';

export type TranslatorFn = (
  key: TranslationKey,
  vars?: Record<string, string | number>
) => string;

export function getPaymentMethodLabel(
  method: PaymentMethod | string | undefined | null,
  t: TranslatorFn,
  options?: {
    shortTransfer?: boolean;
    detailedCard?: boolean;
  }
): string {
  switch (method) {
    case 'cash':
      return t('common.paymentMethods.cash');
    case 'bizum':
      return t('common.paymentMethods.bizum');
    case 'transfer':
      return t(
        options?.shortTransfer
          ? 'common.paymentMethods.transferShort'
          : 'common.paymentMethods.transfer'
      );
    case 'card':
      return t(
        options?.detailedCard
          ? 'common.paymentMethods.cardDebitCredit'
          : 'common.paymentMethods.card'
      );
    default:
      return method ? String(method) : '';
  }
}
