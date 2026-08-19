// plugins/pos/index.js

// 🔥 CREATE ORDER
export async function createOrder(data, config) {

  const items = data.items || []

  if (!items.length) {
    throw new Error("No items in order")
  }

  let total = 0

  items.forEach(item => {
    total += item.price * item.qty
  })

  const order = {
    order_id: "ORD_" + Date.now(),
    items,
    total,
    status: "created",
    created_at: new Date()
  }

  return {
    success: true,
    message: "Order created",
    order
  }
}


// 🔥 CALCULATE BILL
export async function calculateBill(data, config) {

  const items = data.items || []

  let subtotal = 0

  items.forEach(item => {
    subtotal += item.price * item.qty
  })

  const tax = subtotal * 0.05
  const total = subtotal + tax

  return {
    success: true,
    subtotal,
    tax,
    total
  }
}


// 🔥 PROCESS PAYMENT (plugin call ready)
export async function pay(data, config) {

  return {
    success: true,
    message: "Payment processed (dummy)",
    amount: data.amount
  }
}


// 🔥 SEND ORDER TO KITCHEN
export async function sendToKitchen(data, config) {

  return {
    success: true,
    message: "Order sent to kitchen",
    order_id: data.order_id
  }
}


// 🔥 COMPLETE ORDER
export async function completeOrder(data, config) {

  return {
    success: true,
    message: "Order completed",
    order_id: data.order_id
  }
}