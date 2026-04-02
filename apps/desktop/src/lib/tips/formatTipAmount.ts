export function formatTipAmount(amount: number | null, currency: string | null) {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return 'a tip'
  }

  const normalizedCurrency =
    typeof currency === 'string' && currency.length === 3 ? currency.toUpperCase() : null

  if (normalizedCurrency) {
    try {
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: normalizedCurrency,
        maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
      }).format(amount)
    } catch {
      return `${amount.toFixed(amount % 1 === 0 ? 0 : 2)} ${normalizedCurrency}`
    }
  }

  return amount.toFixed(amount % 1 === 0 ? 0 : 2)
}
