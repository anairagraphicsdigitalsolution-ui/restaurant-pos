// plugins/whatsapp/index.js

export async function send(data, config) {
  return {
    success: true,
    message: `Message sent to ${data.phone}`,
    text: data.message
  }
}