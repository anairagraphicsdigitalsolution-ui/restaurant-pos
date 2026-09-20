"use client"

import QRPrintCenter, { qrPrintResponsiveStyles } from "@/components/QRPrintCenter"

export default function DashboardQRPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: qrPrintResponsiveStyles }} />
      <QRPrintCenter />
    </>
  )
}
