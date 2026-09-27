// Razorpay integration is intentionally disabled until a real merchant
// account/OAuth + webhook configuration is supplied. Never report a fake
// payment as successful in production.
export async function pay() {
  return {
    success: false,
    code: "RAZORPAY_NOT_CONFIGURED",
    message: "Razorpay is not configured. Use the built-in manual payment ledger until a real provider is connected."
  }
}
