// plugins/razorpay/index.js

export async function pay(data, config) {
  // fake payment logic (real me Razorpay API laga dena)
  return {
    success: true,
    message: "Payment processed",
    amount: data.amount
  }
}