package com.aiohub.mobile

import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : TauriActivity() {
    private val TAG = "AIO_Insets"

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)

        val rootView = findViewById<View>(android.R.id.content)

        // 监听根视图的 Insets 变化
        ViewCompat.setOnApplyWindowInsetsListener(rootView) { v, windowInsets ->
            val systemBars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars())
            val ime = windowInsets.getInsets(WindowInsetsCompat.Type.ime())
            val isImeVisible = windowInsets.isVisible(WindowInsetsCompat.Type.ime())

            val top = systemBars.top
            // 如果键盘显示，避让键盘高度；否则避让系统栏（底部导航栏）高度
            val bottom = if (isImeVisible) ime.bottom else systemBars.bottom
            val density = resources.displayMetrics.density

            Log.d(TAG, "Insets update: top=$top, bottom=$bottom, imeVisible=$isImeVisible, density=$density")

            // 核心修复：通过 native padding 挤压布局，实现类似 adjustResize 的效果
            // 这会物理上改变 WebView 的高度，从而解决键盘遮挡输入框的问题
            v.setPadding(0, 0, 0, bottom)

            // 仍然通知前端（用于辅助 UI 调整，如移动某些绝对定位的悬浮按钮）
            val webView = findWebView(v)
            if (webView != null) {
                injectInsetsToWebView(webView, top, systemBars.bottom, ime.bottom, isImeVisible, density)
            } else {
                // 如果没找到，可能是刚启动，尝试在下一帧找
                v.post {
                    findWebView(v)?.let {
                        injectInsetsToWebView(it, top, systemBars.bottom, ime.bottom, isImeVisible, density)
                    }
                }
            }

            // 返回 consume 后的 insets，防止系统再次处理导致布局异常
            // 这里我们手动处理了 bottom padding，所以通常需要返回 insets
            windowInsets
        }
    }

    private fun injectInsetsToWebView(webView: WebView, top: Int, bottom: Int, imeHeight: Int, isImeVisible: Boolean, density: Float) {
        val js = """
            (function() {
                try {
                    const data = {
                        top: $top,
                        bottom: $bottom,
                        imeHeight: $imeHeight,
                        imeVisible: ${if (isImeVisible) "true" else "false"},
                        density: $density
                    };
                    window.__ANDROID_INSETS__ = data;
                    window.dispatchEvent(new CustomEvent('android-insets-changed', { detail: data }));
                } catch (e) {
                    console.error('Insets sync error:', e);
                }
            })();
        """.trimIndent()
        webView.evaluateJavascript(js, null)
    }

    private fun findWebView(view: View): WebView? {
        // 尝试通过类名判断，防止混淆或类加载器问题
        if (view.javaClass.name.contains("WebView")) {
            if (view is WebView) return view
        }
        
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                val child = view.getChildAt(i)
                val result = findWebView(child)
                if (result != null) return result
            }
        }
        return null
    }

    private fun printViewTree(view: View, depth: Int) {
        val indent = "  ".repeat(depth)
        Log.d(TAG, "$indent${view.javaClass.simpleName} (${view.javaClass.name}) id=${view.id}")
        if (view is ViewGroup) {
            for (i in 0 until view.childCount) {
                printViewTree(view.getChildAt(i), depth + 1)
            }
        }
    }
}
