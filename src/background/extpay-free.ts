/**
 * GitHub edition: no payments. scripts/build.mjs swaps the 'extpay' package for
 * this file in free builds, so none of ExtensionPay's code ships there.
 */
export default function ExtPay(): never {
  throw new Error('4NTL: payments exist only in the store edition');
}
