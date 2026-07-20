package com.aiohub.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.net.Uri
import android.provider.OpenableColumns
import app.tauri.Logger
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

@InvokeArg
class OpenContentArgs {
    lateinit var uri: String
    lateinit var mode: String
}

@TauriPlugin
class AssetContentPlugin(private val activity: Activity) : Plugin(activity) {
    @SuppressLint("Recycle")
    @Command
    fun openContent(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(OpenContentArgs::class.java)
            val uri = Uri.parse(args.uri)
            if (uri.scheme != "content") {
                invoke.reject("Only content URIs are supported")
                return
            }
            val descriptor = activity.contentResolver.openFileDescriptor(uri, args.mode)
                ?: throw IllegalStateException("Content provider returned no file descriptor")
            val response = JSObject()
            response.put("fd", descriptor.detachFd())
            invoke.resolve(response)
        } catch (error: Exception) {
            Logger.error("Failed to open content URI", error)
            invoke.reject("Failed to open content URI: ${error.message}")
        }
    }

    @Command
    fun getContentMetadata(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(OpenContentArgs::class.java)
            val uri = Uri.parse(args.uri)
            if (uri.scheme != "content") {
                invoke.reject("Only content URIs are supported")
                return
            }
            var displayName: String? = null
            activity.contentResolver.query(
                uri,
                arrayOf(OpenableColumns.DISPLAY_NAME),
                null,
                null,
                null
            )?.use { cursor ->
                val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                if (nameIndex >= 0 && cursor.moveToFirst()) {
                    displayName = cursor.getString(nameIndex)
                }
            }
            val response = JSObject()
            response.put("displayName", displayName)
            response.put("mimeType", activity.contentResolver.getType(uri))
            invoke.resolve(response)
        } catch (error: Exception) {
            Logger.error("Failed to read content URI metadata", error)
            invoke.reject("Failed to read content URI metadata: ${error.message}")
        }
    }
}
