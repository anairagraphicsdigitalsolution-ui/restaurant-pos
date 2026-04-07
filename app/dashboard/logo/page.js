"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"

export default function LogoUpload() {
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [logo, setLogo] = useState("")

  useEffect(() => {
    fetchLogo()
  }, [])

  // 🔥 Fetch existing logo
  async function fetchLogo() {
    const { data } = await supabase
      .from("settings")
      .select("*")
      .eq("id", 1)
      .single()

    if (data?.logo) {
      setLogo(data.logo)
    }
  }

  // 🔥 Upload logo
  async function uploadLogo() {
    if (!file) {
      alert("Please select an image")
      return
    }

    setUploading(true)

    try {
      // 📁 Folder: image/logo/
      const fileName = `logo/${Date.now()}-${file.name}`

      // 🔥 Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from("image")
        .upload(fileName, file)

      if (uploadError) throw uploadError

      // 🔥 Get public URL
      const { data } = supabase.storage
        .from("image")
        .getPublicUrl(fileName)

      const logoUrl = data.publicUrl

      // 🔥 Save in DB
      await supabase.from("settings").upsert([
        {
          id: 1,
          logo: logoUrl,
        },
      ])

      setLogo(logoUrl)

      alert("✅ Logo uploaded successfully!")

    } catch (err) {
      console.error(err)
      alert("❌ Upload failed")
    }

    setUploading(false)
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>🖼️ Upload Restaurant Logo</h1>

      {/* 🔹 CURRENT LOGO */}
      {logo && (
        <div style={{ marginBottom: 20 }}>
          <h3>Current Logo:</h3>
          <img
            src={logo}
            alt="logo"
            style={{
              width: 120,
              borderRadius: 10,
              border: "1px solid #ccc"
            }}
          />
        </div>
      )}

      {/* 🔹 FILE INPUT */}
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files[0])}
      />

      <br /><br />

      {/* 🔹 BUTTON */}
      <button onClick={uploadLogo} disabled={uploading}>
        {uploading ? "Uploading..." : "Upload Logo"}
      </button>
    </div>
  )
}