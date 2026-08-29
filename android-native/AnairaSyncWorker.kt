package in.anairapos.app

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters

class AnairaSyncWorker(appContext: Context, params: WorkerParameters) : CoroutineWorker(appContext, params) {
  override suspend fun doWork(): Result {
    // Native scheduler trigger. WebView performs the authenticated sync cycle.
    return Result.success()
  }
}
