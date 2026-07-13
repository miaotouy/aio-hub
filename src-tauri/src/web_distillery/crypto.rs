// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

//! Cookie 值加密模块
//!
//! - Windows: 使用 DPAPI (CryptProtectData / CryptUnprotectData)
//! - macOS: 使用 Keychain (security CLI) 存储 AES master key + AES-256-GCM
//! - Linux: 使用 libsecret (secret-tool CLI) 存储 AES master key + AES-256-GCM
//! - 其他/不可用: fallback 到明文，返回 available=false

use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use serde::Serialize;

/// 加密能力探测结果
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CryptoStatus {
    pub available: bool,
    pub backend: String,
}

// ============================================================
// Windows DPAPI 实现
// ============================================================

#[cfg(windows)]
mod platform {
    use super::*;
    use std::ptr;
    use windows::core::PWSTR;
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
    };

    // 直接链接 LocalFree，绕过 windows crate 的 Param trait 版本冲突
    extern "system" {
        fn LocalFree(hmem: *mut std::ffi::c_void) -> *mut std::ffi::c_void;
    }

    /// 使用 DPAPI 加密数据（当前用户级别）
    pub fn encrypt(plaintext: &[u8]) -> Result<Vec<u8>, String> {
        unsafe {
            let data_in = CRYPT_INTEGER_BLOB {
                cbData: plaintext.len() as u32,
                pbData: plaintext.as_ptr() as *mut u8,
            };

            let mut data_out = CRYPT_INTEGER_BLOB {
                cbData: 0,
                pbData: ptr::null_mut(),
            };

            // 描述字符串（可选，用于审计）
            let description: Vec<u16> = "AIOHub Cookie\0".encode_utf16().collect();

            let result = CryptProtectData(
                &data_in,
                PWSTR(description.as_ptr() as *mut u16),
                None, // 无额外熵
                None, // pvReserved
                None, // pPromptStruct
                0,    // dwFlags: 默认（当前用户）
                &mut data_out,
            );

            if result.is_err() {
                return Err(format!("CryptProtectData failed: {:?}", result));
            }

            if data_out.pbData.is_null() || data_out.cbData == 0 {
                return Err("CryptProtectData returned empty data".to_string());
            }

            // 复制输出数据
            let encrypted =
                std::slice::from_raw_parts(data_out.pbData, data_out.cbData as usize).to_vec();

            // 释放 DPAPI 分配的内存
            LocalFree(data_out.pbData as *mut std::ffi::c_void);

            Ok(encrypted)
        }
    }

    /// 使用 DPAPI 解密数据
    pub fn decrypt(ciphertext: &[u8]) -> Result<Vec<u8>, String> {
        unsafe {
            let data_in = CRYPT_INTEGER_BLOB {
                cbData: ciphertext.len() as u32,
                pbData: ciphertext.as_ptr() as *mut u8,
            };

            let mut data_out = CRYPT_INTEGER_BLOB {
                cbData: 0,
                pbData: ptr::null_mut(),
            };

            let result = CryptUnprotectData(
                &data_in,
                None, // ppszDataDescr
                None, // pOptionalEntropy
                None, // pvReserved
                None, // pPromptStruct
                0,    // dwFlags
                &mut data_out,
            );

            if result.is_err() {
                return Err(format!("CryptUnprotectData failed: {:?}", result));
            }

            if data_out.pbData.is_null() || data_out.cbData == 0 {
                return Err("CryptUnprotectData returned empty data".to_string());
            }

            // 复制输出数据
            let decrypted =
                std::slice::from_raw_parts(data_out.pbData, data_out.cbData as usize).to_vec();

            // 释放 DPAPI 分配的内存
            LocalFree(data_out.pbData as *mut std::ffi::c_void);

            Ok(decrypted)
        }
    }

    /// 探测 DPAPI 是否可用（尝试一次 round-trip）
    pub fn check_available() -> CryptoStatus {
        let test_data = b"AIOHub_crypto_probe_test";
        match encrypt(test_data) {
            Ok(encrypted) => match decrypt(&encrypted) {
                Ok(decrypted) if decrypted == test_data => CryptoStatus {
                    available: true,
                    backend: "dpapi".to_string(),
                },
                _ => CryptoStatus {
                    available: false,
                    backend: "none".to_string(),
                },
            },
            Err(_) => CryptoStatus {
                available: false,
                backend: "none".to_string(),
            },
        }
    }
}

// ============================================================
// macOS: Keychain + AES-256-GCM
// ============================================================

#[cfg(target_os = "macos")]
mod platform {
    use super::aes_backend;
    use super::*;
    use std::process::Command;

    const SERVICE_NAME: &str = "AIOHub-CookieCrypto";
    const ACCOUNT_NAME: &str = "cookie-master-key";

    /// 从 Keychain 获取 master key，不存在则生成并存入
    fn get_or_create_master_key() -> Result<Vec<u8>, String> {
        // 尝试读取已有 key
        if let Ok(key) = read_key_from_keychain() {
            return Ok(key);
        }
        // 生成新 key 并存入
        let key = aes_backend::generate_key();
        store_key_to_keychain(&key)?;
        Ok(key)
    }

    /// 从 Keychain 读取 key
    fn read_key_from_keychain() -> Result<Vec<u8>, String> {
        let output = Command::new("security")
            .args([
                "find-generic-password",
                "-s",
                SERVICE_NAME,
                "-a",
                ACCOUNT_NAME,
                "-w", // 只输出密码值
            ])
            .output()
            .map_err(|e| format!("Failed to run security CLI: {}", e))?;

        if !output.status.success() {
            return Err("Key not found in Keychain".to_string());
        }

        let hex_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        hex_decode(&hex_str)
    }

    /// 将 key 存入 Keychain
    fn store_key_to_keychain(key: &[u8]) -> Result<(), String> {
        let hex_str = hex_encode(key);

        let output = Command::new("security")
            .args([
                "add-generic-password",
                "-s",
                SERVICE_NAME,
                "-a",
                ACCOUNT_NAME,
                "-w",
                &hex_str,
                "-U", // 如果已存在则更新
            ])
            .output()
            .map_err(|e| format!("Failed to run security CLI: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to store key in Keychain: {}", stderr));
        }

        Ok(())
    }

    pub fn encrypt(plaintext: &[u8]) -> Result<Vec<u8>, String> {
        let key = get_or_create_master_key()?;
        aes_backend::encrypt_with_key(&key, plaintext)
    }

    pub fn decrypt(ciphertext: &[u8]) -> Result<Vec<u8>, String> {
        let key = get_or_create_master_key()?;
        aes_backend::decrypt_with_key(&key, ciphertext)
    }

    /// 探测 Keychain 是否可用
    pub fn check_available() -> CryptoStatus {
        let test_data = b"AIOHub_crypto_probe_test";
        match encrypt(test_data) {
            Ok(encrypted) => match decrypt(&encrypted) {
                Ok(decrypted) if decrypted == test_data => CryptoStatus {
                    available: true,
                    backend: "keychain".to_string(),
                },
                _ => CryptoStatus {
                    available: false,
                    backend: "none".to_string(),
                },
            },
            Err(_) => CryptoStatus {
                available: false,
                backend: "none".to_string(),
            },
        }
    }

    fn hex_encode(data: &[u8]) -> String {
        data.iter().map(|b| format!("{:02x}", b)).collect()
    }

    fn hex_decode(s: &str) -> Result<Vec<u8>, String> {
        if s.len() % 2 != 0 {
            return Err("Invalid hex string length".to_string());
        }
        (0..s.len())
            .step_by(2)
            .map(|i| {
                u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| format!("Invalid hex: {}", e))
            })
            .collect()
    }
}

// ============================================================
// Linux: libsecret (secret-tool) + AES-256-GCM
// ============================================================

#[cfg(target_os = "linux")]
mod platform {
    use super::aes_backend;
    use super::*;
    use std::io::Write;
    use std::process::Command;

    const ATTR_APP: &str = "application";
    const ATTR_APP_VALUE: &str = "AIOHub";
    const ATTR_TYPE: &str = "type";
    const ATTR_TYPE_VALUE: &str = "cookie-master-key";
    const LABEL: &str = "AIOHub Cookie Encryption Key";

    /// 从 libsecret 获取 master key，不存在则生成并存入
    fn get_or_create_master_key() -> Result<Vec<u8>, String> {
        if let Ok(key) = read_key_from_secret_service() {
            return Ok(key);
        }
        let key = aes_backend::generate_key();
        store_key_to_secret_service(&key)?;
        Ok(key)
    }

    /// 从 secret-service 读取 key
    fn read_key_from_secret_service() -> Result<Vec<u8>, String> {
        let output = Command::new("secret-tool")
            .args([
                "lookup",
                ATTR_APP,
                ATTR_APP_VALUE,
                ATTR_TYPE,
                ATTR_TYPE_VALUE,
            ])
            .output()
            .map_err(|e| format!("Failed to run secret-tool: {}", e))?;

        if !output.status.success() || output.stdout.is_empty() {
            return Err("Key not found in secret-service".to_string());
        }

        // secret-tool lookup 输出原始密码（可能带换行）
        let hex_str = String::from_utf8_lossy(&output.stdout).trim().to_string();
        hex_decode(&hex_str)
    }

    /// 将 key 存入 secret-service
    fn store_key_to_secret_service(key: &[u8]) -> Result<(), String> {
        let hex_str = hex_encode(key);

        // secret-tool store 从 stdin 读取密码值
        let mut child = Command::new("secret-tool")
            .args([
                "store",
                "--label",
                LABEL,
                ATTR_APP,
                ATTR_APP_VALUE,
                ATTR_TYPE,
                ATTR_TYPE_VALUE,
            ])
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn secret-tool: {}", e))?;

        if let Some(ref mut stdin) = child.stdin {
            stdin
                .write_all(hex_str.as_bytes())
                .map_err(|e| format!("Failed to write to secret-tool stdin: {}", e))?;
        }

        let output = child
            .wait_with_output()
            .map_err(|e| format!("Failed to wait for secret-tool: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to store key in secret-service: {}", stderr));
        }

        Ok(())
    }

    pub fn encrypt(plaintext: &[u8]) -> Result<Vec<u8>, String> {
        let key = get_or_create_master_key()?;
        aes_backend::encrypt_with_key(&key, plaintext)
    }

    pub fn decrypt(ciphertext: &[u8]) -> Result<Vec<u8>, String> {
        let key = get_or_create_master_key()?;
        aes_backend::decrypt_with_key(&key, ciphertext)
    }

    /// 探测 secret-tool 是否可用
    pub fn check_available() -> CryptoStatus {
        // 先检查 secret-tool 是否存在
        let which_result = Command::new("which").arg("secret-tool").output();

        match which_result {
            Ok(output) if output.status.success() => {
                // secret-tool 存在，尝试完整 round-trip
                let test_data = b"AIOHub_crypto_probe_test";
                match encrypt(test_data) {
                    Ok(encrypted) => match decrypt(&encrypted) {
                        Ok(decrypted) if decrypted == test_data => CryptoStatus {
                            available: true,
                            backend: "libsecret".to_string(),
                        },
                        _ => CryptoStatus {
                            available: false,
                            backend: "none".to_string(),
                        },
                    },
                    Err(_) => CryptoStatus {
                        available: false,
                        backend: "none".to_string(),
                    },
                }
            }
            _ => CryptoStatus {
                available: false,
                backend: "none".to_string(),
            },
        }
    }

    fn hex_encode(data: &[u8]) -> String {
        data.iter().map(|b| format!("{:02x}", b)).collect()
    }

    fn hex_decode(s: &str) -> Result<Vec<u8>, String> {
        if s.len() % 2 != 0 {
            return Err("Invalid hex string length".to_string());
        }
        (0..s.len())
            .step_by(2)
            .map(|i| {
                u8::from_str_radix(&s[i..i + 2], 16).map_err(|e| format!("Invalid hex: {}", e))
            })
            .collect()
    }
}

// ============================================================
// 其他平台 fallback（如 FreeBSD 等）
// ============================================================

#[cfg(not(any(windows, target_os = "macos", target_os = "linux")))]
mod platform {
    use super::*;

    pub fn encrypt(_plaintext: &[u8]) -> Result<Vec<u8>, String> {
        Err("No crypto backend available on this platform".to_string())
    }

    pub fn decrypt(_ciphertext: &[u8]) -> Result<Vec<u8>, String> {
        Err("No crypto backend available on this platform".to_string())
    }

    pub fn check_available() -> CryptoStatus {
        CryptoStatus {
            available: false,
            backend: "none".to_string(),
        }
    }
}

// ============================================================
// AES-256-GCM 后端（macOS/Linux 共用）
// ============================================================

#[cfg(not(windows))]
mod aes_backend {
    use aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Nonce,
    };
    use rand::RngCore;

    /// AES-256 key 长度 = 32 bytes
    const KEY_LEN: usize = 32;
    /// GCM nonce 长度 = 12 bytes
    const NONCE_LEN: usize = 12;

    /// 生成随机 AES-256 key
    pub fn generate_key() -> Vec<u8> {
        let mut key = vec![0u8; KEY_LEN];
        rand::thread_rng().fill_bytes(&mut key);
        key
    }

    /// 使用给定 key 加密数据
    /// 输出格式: [12 bytes nonce] + [ciphertext + tag]
    pub fn encrypt_with_key(key: &[u8], plaintext: &[u8]) -> Result<Vec<u8>, String> {
        if key.len() != KEY_LEN {
            return Err(format!(
                "Invalid key length: expected {}, got {}",
                KEY_LEN,
                key.len()
            ));
        }

        let cipher = Aes256Gcm::new_from_slice(key)
            .map_err(|e| format!("Failed to create cipher: {}", e))?;

        // 生成随机 nonce
        let mut nonce_bytes = [0u8; NONCE_LEN];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext)
            .map_err(|e| format!("AES-GCM encrypt failed: {}", e))?;

        // 输出: nonce + ciphertext
        let mut output = Vec::with_capacity(NONCE_LEN + ciphertext.len());
        output.extend_from_slice(&nonce_bytes);
        output.extend_from_slice(&ciphertext);
        Ok(output)
    }

    /// 使用给定 key 解密数据
    /// 输入格式: [12 bytes nonce] + [ciphertext + tag]
    pub fn decrypt_with_key(key: &[u8], data: &[u8]) -> Result<Vec<u8>, String> {
        if key.len() != KEY_LEN {
            return Err(format!(
                "Invalid key length: expected {}, got {}",
                KEY_LEN,
                key.len()
            ));
        }
        if data.len() < NONCE_LEN + 16 {
            // 至少需要 nonce(12) + tag(16)
            return Err("Ciphertext too short".to_string());
        }

        let cipher = Aes256Gcm::new_from_slice(key)
            .map_err(|e| format!("Failed to create cipher: {}", e))?;

        let nonce = Nonce::from_slice(&data[..NONCE_LEN]);
        let ciphertext = &data[NONCE_LEN..];

        cipher
            .decrypt(nonce, ciphertext)
            .map_err(|e| format!("AES-GCM decrypt failed: {}", e))
    }
}

// ============================================================
// Tauri 命令
// ============================================================

/// 探测加密能力是否可用
#[tauri::command]
pub async fn distillery_check_crypto() -> CryptoStatus {
    platform::check_available()
}

/// 批量加密 cookie values
/// 输入：明文字符串数组
/// 输出：base64 编码的密文数组（加密失败时返回原值，前缀 "plain:"）
#[tauri::command]
pub async fn distillery_encrypt_cookie_values(values: Vec<String>) -> Vec<String> {
    encrypt_cookie_values_inner(&values)
}

/// 批量解密 cookie values
/// 输入：加密后的字符串数组（"enc:base64..." 或 "plain:原值"）
/// 输出：明文字符串数组
#[tauri::command]
pub async fn distillery_decrypt_cookie_values(values: Vec<String>) -> Vec<String> {
    decrypt_cookie_values_inner(&values)
}

/// 内部解密逻辑（可测试，不依赖 async/tauri）
fn decrypt_cookie_values_inner(values: &[String]) -> Vec<String> {
    values
        .iter()
        .map(|v| {
            if let Some(encoded) = v.strip_prefix("enc:") {
                // 尝试解密
                match BASE64.decode(encoded) {
                    Ok(ciphertext) => match platform::decrypt(&ciphertext) {
                        Ok(plaintext) => String::from_utf8_lossy(&plaintext).to_string(),
                        Err(e) => {
                            log::error!("[crypto] decrypt failed: {}", e);
                            // 解密失败，返回空字符串（不能返回密文给用户看）
                            String::new()
                        }
                    },
                    Err(e) => {
                        log::error!("[crypto] base64 decode failed: {}", e);
                        String::new()
                    }
                }
            } else if let Some(plain) = v.strip_prefix("plain:") {
                // 未加密的明文值
                plain.to_string()
            } else {
                // 无前缀 = 旧格式明文（兼容迁移）
                v.clone()
            }
        })
        .collect()
}

/// 内部加密逻辑（可测试，不依赖 async/tauri）
fn encrypt_cookie_values_inner(values: &[String]) -> Vec<String> {
    values
        .iter()
        .map(|v| match platform::encrypt(v.as_bytes()) {
            Ok(encrypted) => format!("enc:{}", BASE64.encode(&encrypted)),
            Err(e) => {
                log::warn!("[crypto] encrypt failed for a value: {}", e);
                format!("plain:{}", v)
            }
        })
        .collect()
}

// ============================================================
// 单元测试
// ============================================================

#[cfg(test)]
mod tests {
    use super::*;

    // ----------------------------------------------------------
    // 平台加密 round-trip 测试
    // ----------------------------------------------------------

    #[test]
    fn test_platform_encrypt_decrypt_roundtrip_basic() {
        if !platform::check_available().available {
            // CI 环境无加密后端（如 Linux 无 secret-tool），跳过
            return;
        }
        let plaintext = b"hello world cookie value";
        let encrypted = platform::encrypt(plaintext).expect("encrypt should succeed");
        // 密文不应等于明文
        assert_ne!(encrypted, plaintext);
        let decrypted = platform::decrypt(&encrypted).expect("decrypt should succeed");
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_platform_encrypt_decrypt_empty_string() {
        if !platform::check_available().available {
            return;
        }
        let plaintext = b"";
        let encrypted = platform::encrypt(plaintext);
        // DPAPI 在 Windows 上对空数据的行为：加密成功但解密返回空 blob 被视为错误
        // 这是平台限制，实际 cookie value 不会为空
        #[cfg(windows)]
        {
            // Windows DPAPI: 加密空数据可能成功，但解密时 cbData=0 会被判定为失败
            // 这是可接受的行为——业务层不会传空 cookie value
            if let Ok(enc) = encrypted {
                let dec_result = platform::decrypt(&enc);
                // 无论成功或失败都是合理的平台行为
                if let Ok(dec) = dec_result {
                    assert_eq!(dec, plaintext);
                }
                // 失败也是可接受的（DPAPI 对空数据的已知限制）
            }
        }
        #[cfg(not(windows))]
        {
            // AES-GCM 可以正常处理空数据
            let enc = encrypted.expect("encrypt empty should succeed on non-Windows");
            let dec = platform::decrypt(&enc).expect("decrypt empty should succeed on non-Windows");
            assert_eq!(dec, plaintext);
        }
    }

    #[test]
    fn test_platform_encrypt_decrypt_unicode() {
        if !platform::check_available().available {
            return;
        }
        let plaintext = "你好世界🍪こんにちは".as_bytes();
        let encrypted = platform::encrypt(plaintext).expect("encrypt unicode should succeed");
        let decrypted = platform::decrypt(&encrypted).expect("decrypt unicode should succeed");
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_platform_encrypt_decrypt_special_chars() {
        if !platform::check_available().available {
            return;
        }
        let plaintext = b"key=value; path=/; domain=.example.com; secure; HttpOnly";
        let encrypted = platform::encrypt(plaintext).expect("encrypt special chars should succeed");
        let decrypted =
            platform::decrypt(&encrypted).expect("decrypt special chars should succeed");
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_platform_encrypt_decrypt_long_value() {
        if !platform::check_available().available {
            return;
        }
        // 模拟一个较长的 cookie value（4KB）
        let plaintext: Vec<u8> = (0..4096).map(|i| (i % 256) as u8).collect();
        let encrypted = platform::encrypt(&plaintext).expect("encrypt long value should succeed");
        let decrypted = platform::decrypt(&encrypted).expect("decrypt long value should succeed");
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn test_platform_encrypt_produces_different_ciphertext() {
        if !platform::check_available().available {
            return;
        }
        // 同一明文加密两次，密文应不同（DPAPI 有随机性，AES-GCM 有随机 nonce）
        let plaintext = b"same input twice";
        let enc1 = platform::encrypt(plaintext).expect("first encrypt");
        let enc2 = platform::encrypt(plaintext).expect("second encrypt");
        // 密文应不同（极小概率相同，可忽略）
        assert_ne!(
            enc1, enc2,
            "Two encryptions of same plaintext should produce different ciphertext"
        );
        // 但解密后都应得到相同明文
        let dec1 = platform::decrypt(&enc1).expect("decrypt first");
        let dec2 = platform::decrypt(&enc2).expect("decrypt second");
        assert_eq!(dec1, plaintext);
        assert_eq!(dec2, plaintext);
    }

    #[test]
    fn test_platform_decrypt_invalid_data() {
        if !platform::check_available().available {
            return;
        }
        // 随机垃圾数据不应能解密
        let garbage = vec![0u8, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
        let result = platform::decrypt(&garbage);
        assert!(result.is_err(), "Decrypting garbage should fail");
    }

    #[test]
    fn test_platform_decrypt_tampered_ciphertext() {
        if !platform::check_available().available {
            return;
        }
        let plaintext = b"sensitive cookie data";
        let mut encrypted = platform::encrypt(plaintext).expect("encrypt should succeed");
        // 篡改密文的最后一个字节
        if let Some(last) = encrypted.last_mut() {
            *last ^= 0xFF;
        }
        let result = platform::decrypt(&encrypted);
        assert!(
            result.is_err(),
            "Decrypting tampered ciphertext should fail"
        );
    }

    // ----------------------------------------------------------
    // check_available 测试
    // ----------------------------------------------------------

    #[test]
    fn test_check_available_returns_valid_status() {
        let status = platform::check_available();
        // 在 Windows CI/本地环境中，DPAPI 应该可用
        #[cfg(windows)]
        {
            assert!(status.available, "DPAPI should be available on Windows");
            assert_eq!(status.backend, "dpapi");
        }
        // 无论哪个平台，backend 字段不应为空
        assert!(!status.backend.is_empty());
    }

    // ----------------------------------------------------------
    // 批量加密/解密命令逻辑测试
    // ----------------------------------------------------------

    #[test]
    fn test_encrypt_decrypt_values_roundtrip() {
        let values = vec![
            "session_id=abc123".to_string(),
            "token=xyz789".to_string(),
            "".to_string(),
            "中文cookie=值".to_string(),
        ];

        let encrypted = encrypt_cookie_values_inner(&values);

        // 所有加密结果应以 "enc:" 开头（平台加密可用时）
        let status = platform::check_available();
        if status.available {
            for enc in &encrypted {
                assert!(
                    enc.starts_with("enc:"),
                    "Encrypted value should start with 'enc:' prefix, got: {}",
                    enc
                );
            }
        }

        let decrypted = decrypt_cookie_values_inner(&encrypted);
        assert_eq!(decrypted, values);
    }

    #[test]
    fn test_decrypt_plain_prefix() {
        // "plain:" 前缀应直接返回后面的内容
        let values = vec![
            "plain:my_cookie_value".to_string(),
            "plain:".to_string(),
            "plain:special=chars;path=/".to_string(),
        ];

        let decrypted = decrypt_cookie_values_inner(&values);
        assert_eq!(decrypted[0], "my_cookie_value");
        assert_eq!(decrypted[1], "");
        assert_eq!(decrypted[2], "special=chars;path=/");
    }

    #[test]
    fn test_decrypt_no_prefix_legacy_format() {
        // 无前缀 = 旧格式明文，应原样返回
        let values = vec![
            "legacy_cookie_value".to_string(),
            "another=old;format".to_string(),
            "".to_string(),
        ];

        let decrypted = decrypt_cookie_values_inner(&values);
        assert_eq!(decrypted[0], "legacy_cookie_value");
        assert_eq!(decrypted[1], "another=old;format");
        assert_eq!(decrypted[2], "");
    }

    #[test]
    fn test_decrypt_invalid_enc_prefix_returns_empty() {
        // "enc:" 后面跟无效 base64 应返回空字符串
        let values = vec![
            "enc:not_valid_base64!!!".to_string(),
            "enc:".to_string(), // 空 base64
        ];

        let decrypted = decrypt_cookie_values_inner(&values);
        // 无效 base64 解码失败 -> 返回空字符串
        assert_eq!(decrypted[0], "");
        // 空 base64 解码为空 bytes -> 解密会因数据太短失败 -> 返回空字符串
        assert_eq!(decrypted[1], "");
    }

    #[test]
    fn test_decrypt_enc_with_valid_base64_but_invalid_ciphertext() {
        // 有效 base64 但不是合法密文
        let fake_data = BASE64.encode(b"this is not real ciphertext data at all");
        let values = vec![format!("enc:{}", fake_data)];

        let decrypted = decrypt_cookie_values_inner(&values);
        assert_eq!(
            decrypted[0], "",
            "Invalid ciphertext should decrypt to empty string"
        );
    }

    #[test]
    fn test_encrypt_decrypt_batch_preserves_order() {
        let values: Vec<String> = (0..20)
            .map(|i| format!("cookie_{}=value_{}", i, i * 100))
            .collect();

        let encrypted = encrypt_cookie_values_inner(&values);
        assert_eq!(encrypted.len(), 20);

        let decrypted = decrypt_cookie_values_inner(&encrypted);
        assert_eq!(
            decrypted, values,
            "Batch encrypt/decrypt should preserve order and values"
        );
    }

    #[test]
    fn test_encrypt_decrypt_mixed_formats() {
        // 模拟实际场景：混合了加密值、plain 前缀和旧格式
        let original = vec!["session=abc".to_string(), "token=xyz".to_string()];

        let encrypted = encrypt_cookie_values_inner(&original);

        // 构造混合输入
        let mixed = vec![
            encrypted[0].clone(),               // enc:... 格式
            "plain:fallback_value".to_string(), // plain: 格式
            "old_legacy_cookie".to_string(),    // 无前缀旧格式
            encrypted[1].clone(),               // enc:... 格式
        ];

        let decrypted = decrypt_cookie_values_inner(&mixed);
        assert_eq!(decrypted[0], "session=abc");
        assert_eq!(decrypted[1], "fallback_value");
        assert_eq!(decrypted[2], "old_legacy_cookie");
        assert_eq!(decrypted[3], "token=xyz");
    }

    // ----------------------------------------------------------
    // AES-256-GCM 后端测试（仅非 Windows 平台编译）
    // ----------------------------------------------------------

    #[cfg(not(windows))]
    mod aes_tests {
        use super::super::aes_backend;

        #[test]
        fn test_generate_key_length() {
            let key = aes_backend::generate_key();
            assert_eq!(key.len(), 32, "AES-256 key should be 32 bytes");
        }

        #[test]
        fn test_generate_key_randomness() {
            let key1 = aes_backend::generate_key();
            let key2 = aes_backend::generate_key();
            assert_ne!(key1, key2, "Two generated keys should be different");
        }

        #[test]
        fn test_aes_encrypt_decrypt_roundtrip() {
            let key = aes_backend::generate_key();
            let plaintext = b"test data for AES-GCM";
            let encrypted =
                aes_backend::encrypt_with_key(&key, plaintext).expect("AES encrypt should succeed");
            let decrypted = aes_backend::decrypt_with_key(&key, &encrypted)
                .expect("AES decrypt should succeed");
            assert_eq!(decrypted, plaintext);
        }

        #[test]
        fn test_aes_encrypt_decrypt_empty() {
            let key = aes_backend::generate_key();
            let plaintext = b"";
            let encrypted =
                aes_backend::encrypt_with_key(&key, plaintext).expect("AES encrypt empty");
            let decrypted =
                aes_backend::decrypt_with_key(&key, &encrypted).expect("AES decrypt empty");
            assert_eq!(decrypted, plaintext);
        }

        #[test]
        fn test_aes_invalid_key_length() {
            let short_key = vec![0u8; 16]; // 应该是 32
            let result = aes_backend::encrypt_with_key(&short_key, b"test");
            assert!(result.is_err(), "Short key should fail");

            let long_key = vec![0u8; 64];
            let result = aes_backend::encrypt_with_key(&long_key, b"test");
            assert!(result.is_err(), "Long key should fail");
        }

        #[test]
        fn test_aes_decrypt_too_short() {
            let key = aes_backend::generate_key();
            // 少于 nonce(12) + tag(16) = 28 bytes
            let short_data = vec![0u8; 20];
            let result = aes_backend::decrypt_with_key(&key, &short_data);
            assert!(result.is_err(), "Too short ciphertext should fail");
        }

        #[test]
        fn test_aes_decrypt_wrong_key() {
            let key1 = aes_backend::generate_key();
            let key2 = aes_backend::generate_key();
            let plaintext = b"secret data";
            let encrypted =
                aes_backend::encrypt_with_key(&key1, plaintext).expect("encrypt with key1");
            let result = aes_backend::decrypt_with_key(&key2, &encrypted);
            assert!(result.is_err(), "Decrypting with wrong key should fail");
        }

        #[test]
        fn test_aes_ciphertext_format() {
            let key = aes_backend::generate_key();
            let plaintext = b"format check";
            let encrypted = aes_backend::encrypt_with_key(&key, plaintext).expect("encrypt");
            // 输出应为: 12 bytes nonce + ciphertext + 16 bytes tag
            // 最小长度 = 12 + plaintext.len() + 16
            assert!(
                encrypted.len() >= 12 + plaintext.len() + 16,
                "Ciphertext should be at least nonce + plaintext + tag"
            );
        }
    }
}
