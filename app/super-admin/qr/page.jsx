"use client"

import QRPrintCenter, { qrPrintResponsiveStyles } from "@/components/QRPrintCenter"

export default function SuperAdminQRPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: qrPrintResponsiveStyles }} />
      <QRPrintCenter superAdmin />
    </>
  )
}
