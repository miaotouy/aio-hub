package com.aiohub.mobile

import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.provider.MediaStore
import android.provider.OpenableColumns
import androidx.core.content.FileProvider
import app.tauri.Logger
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.util.UUID

@InvokeArg
class OpenContentArgs {
    lateinit var uri: String
    lateinit var mode: String
}

@InvokeArg
class ShareContentArgs {
    lateinit var path: String
    lateinit var mimeType: String
    lateinit var fileName: String
}

@InvokeArg
class CapturePhotoArgs

@TauriPlugin
class AssetContentPlugin(private val activity: Activity) : Plugin(activity) {
    private var pendingCapture: File? = null

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

    @Command
    fun shareContent(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(ShareContentArgs::class.java)
            val cacheRoot = activity.cacheDir.canonicalFile
            val file = File(args.path).canonicalFile
            val cachePrefix = cacheRoot.path + File.separator
            if (!file.path.startsWith(cachePrefix) || !file.isFile) {
                invoke.reject("Only existing cache files can be shared")
                return
            }
            val uri = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                file
            )
            val sendIntent = Intent(Intent.ACTION_SEND).apply {
                type = args.mimeType.ifBlank { "*/*" }
                putExtra(Intent.EXTRA_STREAM, uri)
                putExtra(Intent.EXTRA_TITLE, args.fileName)
                clipData = ClipData.newRawUri("AIO Hub asset", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            activity.startActivity(Intent.createChooser(sendIntent, null))
            Handler(Looper.getMainLooper()).postDelayed(
                { file.parentFile?.deleteRecursively() },
                30 * 60 * 1000L
            )
            val response = JSObject()
            response.put("started", true)
            invoke.resolve(response)
        } catch (error: Exception) {
            Logger.error("Failed to share asset", error)
            invoke.reject("Failed to share asset: ${error.message}")
        }
    }

    @Command
    fun capturePhoto(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(CapturePhotoArgs::class.java)
            val captureDirectory = File(activity.cacheDir, "assets/captures")
            if (!captureDirectory.mkdirs() && !captureDirectory.isDirectory) {
                invoke.reject("Unable to create camera cache")
                return
            }
            val file = File(captureDirectory, "camera-${UUID.randomUUID()}.jpg")
            val uri = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                file
            )
            val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE).apply {
                putExtra(MediaStore.EXTRA_OUTPUT, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                clipData = ClipData.newRawUri("AIO Hub camera output", uri)
            }
            if (intent.resolveActivity(activity.packageManager) == null) {
                invoke.reject("No camera application is available")
                return
            }
            pendingCapture = file
            startActivityForResult(invoke, intent, "capturePhotoResult")
        } catch (error: Exception) {
            pendingCapture = null
            Logger.error("Failed to launch camera", error)
            invoke.reject("Failed to launch camera: ${error.message}")
        }
    }

    @ActivityCallback
    fun capturePhotoResult(invoke: Invoke, result: androidx.activity.result.ActivityResult) {
        val file = pendingCapture
        pendingCapture = null
        if (result.resultCode == Activity.RESULT_CANCELED) {
            file?.delete()
            val response = JSObject()
            response.put("cancelled", true)
            invoke.resolve(response)
            return
        }
        try {
            if (result.resultCode != Activity.RESULT_OK || file == null || !file.isFile || file.length() == 0L) {
                file?.delete()
                invoke.reject("Camera returned no image")
                return
            }
            val uri = FileProvider.getUriForFile(
                activity,
                "${activity.packageName}.fileprovider",
                file
            )
            Handler(Looper.getMainLooper()).postDelayed({ file.delete() }, 30 * 60 * 1000L)
            val response = JSObject()
            response.put("cancelled", false)
            response.put("reference", uri.toString())
            response.put("originalName", file.name)
            response.put("mimeType", "image/jpeg")
            invoke.resolve(response)
        } catch (error: Exception) {
            file?.delete()
            Logger.error("Failed to read camera result", error)
            invoke.reject("Failed to read camera result: ${error.message}")
        }
    }
}
