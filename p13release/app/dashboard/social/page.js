"use client"
import {useEffect} from "react"
import {useRouter} from "next/navigation"
export default function SocialRedirect(){const router=useRouter();useEffect(()=>router.replace("/dashboard/marketing"),[router]);return <main style={{padding:30}}>Opening Marketing Hub…</main>}
