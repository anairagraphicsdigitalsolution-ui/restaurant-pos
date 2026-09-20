import { redirect } from "next/navigation"

export default function LegacyPluginsRedirect(){
  redirect("/super-admin/plugins")
}
