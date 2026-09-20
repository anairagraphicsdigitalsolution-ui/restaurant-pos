import { supabaseCloud } from "@/lib/supabaseCloud"

export async function enqueueCloudPrintJob({ restaurantId, jobType = "receipt", referenceId = null, content = "", data = {}, printerId = null }) {
  if (!restaurantId) throw new Error("Restaurant is required for cloud printing")
  const payload = { ...data, content: String(content || ""), queued_from: "anaira-pos" }
  const { data: job, error } = await supabaseCloud.from("print_jobs").insert({
    restaurant_id: restaurantId,
    printer_id: printerId,
    job_type: jobType,
    reference_id: referenceId,
    payload,
    status: "queued",
    attempts: 0,
  }).select("id,restaurant_id,job_type,reference_id,status,created_at").single()
  if (error) throw error
  return job
}
