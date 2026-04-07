"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function Home() {

  const router = useRouter()

  useEffect(() => {
    checkUser()
  }, [])

  async function checkUser(){

    const { data: userData } = await supabase.auth.getUser()

    // ❌ NOT LOGGED IN
    if(!userData?.user){
      router.replace("/login")
      return
    }

    // 🔥 GET ROLE
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .single()

    if(!profile){
      router.replace("/login")
      return
    }

    // 🔥 ROLE BASED REDIRECT
    if(profile.role === "staff"){
      router.replace("/staff")
    }
    else if(profile.role === "admin"){
      router.replace("/dashboard")
    }
    else if(profile.role === "super_admin"){
      router.replace("/super-admin")
    }
    else{
      router.replace("/login")
    }
  }

  return (
    <div style={{color:"#fff",padding:20}}>
      Loading...
    </div>
  )
}