package in.anairapos.app

import android.content.ContentValues
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

@CapacitorPlugin(name = "AnairaLocalDb")
class AnairaLocalDbPlugin : Plugin() {
  private lateinit var helper: LocalDbHelper

  override fun load() {
    super.load()
    helper = LocalDbHelper(context)
  }

  @com.getcapacitor.PluginMethod
  fun open(call: PluginCall) {
    helper.writableDatabase
    val ret = JSObject()
    ret.put("success", true)
    ret.put("driver", "android-sqlite")
    ret.put("version", LocalDbHelper.VERSION)
    call.resolve(ret)
  }

  @com.getcapacitor.PluginMethod
  fun put(call: PluginCall) {
    val restaurantId = call.getString("restaurantId") ?: return call.reject("restaurantId is required")
    val entity = call.getString("entity") ?: return call.reject("entity is required")
    val id = call.getString("id") ?: return call.reject("id is required")
    val data = call.getObject("data") ?: JSObject()
    helper.put(restaurantId, entity, id, data)
    call.resolve()
  }

  @com.getcapacitor.PluginMethod
  fun get(call: PluginCall) {
    val restaurantId = call.getString("restaurantId") ?: return call.reject("restaurantId is required")
    val entity = call.getString("entity") ?: return call.reject("entity is required")
    val id = call.getString("id") ?: return call.reject("id is required")
    call.resolve(helper.get(restaurantId, entity, id) ?: JSObject())
  }

  @com.getcapacitor.PluginMethod
  fun list(call: PluginCall) {
    val restaurantId = call.getString("restaurantId") ?: return call.reject("restaurantId is required")
    val entity = call.getString("entity") ?: return call.reject("entity is required")
    val limit = call.getInt("limit", 500) ?: 500
    val ret = JSObject()
    ret.put("records", JSArray(helper.list(restaurantId, entity, limit)))
    call.resolve(ret)
  }

  @com.getcapacitor.PluginMethod
  fun remove(call: PluginCall) {
    val restaurantId = call.getString("restaurantId") ?: return call.reject("restaurantId is required")
    val entity = call.getString("entity") ?: return call.reject("entity is required")
    val id = call.getString("id") ?: return call.reject("id is required")
    helper.remove(restaurantId, entity, id)
    call.resolve()
  }

  private class LocalDbHelper(ctx: android.content.Context) : SQLiteOpenHelper(ctx, DB_NAME, null, VERSION) {
    override fun onCreate(db: SQLiteDatabase) {
      db.execSQL("CREATE TABLE IF NOT EXISTS records(key TEXT PRIMARY KEY, restaurant_id TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL, data TEXT NOT NULL, updated_at TEXT NOT NULL)")
      db.execSQL("CREATE INDEX IF NOT EXISTS idx_records_restaurant_entity ON records(restaurant_id,entity)")
    }
    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) = onCreate(db)
    fun put(restaurantId: String, entity: String, id: String, data: JSObject) {
      val values = ContentValues().apply {
        put("key", "$restaurantId:$entity:$id")
        put("restaurant_id", restaurantId)
        put("entity", entity)
        put("entity_id", id)
        put("data", data.toString())
        put("updated_at", java.time.Instant.now().toString())
      }
      writableDatabase.insertWithOnConflict("records", null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }
    fun get(restaurantId: String, entity: String, id: String): JSObject? {
      readableDatabase.rawQuery("SELECT data FROM records WHERE key=?", arrayOf("$restaurantId:$entity:$id")).use {
        if (!it.moveToFirst()) return null
        return JSObject(it.getString(0))
      }
    }
    fun list(restaurantId: String, entity: String, limit: Int): List<JSONObject> {
      val out = mutableListOf<JSONObject>()
      readableDatabase.rawQuery("SELECT data FROM records WHERE restaurant_id=? AND entity=? ORDER BY updated_at DESC LIMIT ?", arrayOf(restaurantId, entity, limit.toString())).use {
        while (it.moveToNext()) out.add(JSONObject(it.getString(0)))
      }
      return out
    }
    fun remove(restaurantId: String, entity: String, id: String) {
      writableDatabase.delete("records", "key=?", arrayOf("$restaurantId:$entity:$id"))
    }
    companion object { const val DB_NAME = "anaira-pos.db"; const val VERSION = 11 }
  }
}
