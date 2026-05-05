package com.aiohub.mobile

import android.os.Bundle
// import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    // enableEdgeToEdge() // 注释掉，排除它对 adjustResize 的干扰，导致无法正确适配布局的元凶
    super.onCreate(savedInstanceState)
  }
}
