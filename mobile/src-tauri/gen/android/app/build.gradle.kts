import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

val signingProperties = Properties().apply {
    val propFile = rootProject.file("key.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

val e2ePackaging = System.getenv("AIO_MOBILE_E2E_PACKAGING") == "1"
val e2eAbi = System.getenv("AIO_MOBILE_E2E_ABI")
val e2eJniRoot = layout.buildDirectory.dir("generated/e2eJniLibs")

android {
    compileSdk = 36
    namespace = "com.aiohub.mobile"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.aiohub.mobile"
        minSdk = 24
        targetSdk = 36
        versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()
        versionName = tauriProperties.getProperty("tauri.android.versionName", "1.0")
    }
    signingConfigs {
        create("release") {
            val storeFilePath = signingProperties.getProperty("storeFile")
            if (!storeFilePath.isNullOrBlank()) {
                storeFile = rootProject.file(storeFilePath)
                storePassword = signingProperties.getProperty("storePassword")
                keyAlias = signingProperties.getProperty("keyAlias")
                keyPassword = signingProperties.getProperty("keyPassword")
            }
        }
    }
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = !e2ePackaging
            isMinifyEnabled = false
            packaging {
                if (!e2ePackaging) {
                    jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                    jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                    jniLibs.keepDebugSymbols.add("*/x86/*.so")
                    jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
                }
            }
        }
        getByName("release") {
            // CI supplies key.properties; local builds remain installable with the debug key.
            signingConfig = signingConfigs.getByName("release").takeIf {
                it.storeFile?.exists() == true
            } ?: signingConfigs.getByName("debug")
            isMinifyEnabled = true
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
    sourceSets {
        getByName("main") {
            jniLibs.setSrcDirs(
                if (e2ePackaging) listOf(e2eJniRoot.get().asFile)
                else listOf("src/main/jniLibs")
            )
        }
    }
}

rust {
    rootDirRel = "../../../"
}

if (e2ePackaging) {
    val requiredE2eAbi = requireNotNull(e2eAbi?.takeIf { it.isNotBlank() }) {
        "AIO_MOBILE_E2E_ABI is required for E2E packaging"
    }
    val prepareE2eJniLibs = tasks.register("prepareE2eJniLibs") {
        dependsOn("rustBuildUniversalDebug")
        doLast {
            val sourceDirectory = file("src/main/jniLibs/$requiredE2eAbi")
            require(sourceDirectory.isDirectory) {
                "E2E JNI source directory not found: $sourceDirectory"
            }
            val outputDirectory = e2eJniRoot.get().dir(requiredE2eAbi).asFile
            delete(outputDirectory)
            outputDirectory.mkdirs()
            copy {
                from(sourceDirectory)
                into(outputDirectory)
                include("*.so")
            }

            val ndkHome = System.getenv("NDK_HOME")
                ?: System.getenv("ANDROID_NDK_HOME")
                ?: error("NDK_HOME or ANDROID_NDK_HOME is required for E2E packaging")
            val hostTag = when {
                System.getProperty("os.name").startsWith("Windows", ignoreCase = true) -> "windows-x86_64"
                System.getProperty("os.name").startsWith("Mac", ignoreCase = true) -> "darwin-x86_64"
                else -> "linux-x86_64"
            }
            val executableName = if (hostTag.startsWith("windows")) "llvm-strip.exe" else "llvm-strip"
            val stripExecutable = file("$ndkHome/toolchains/llvm/prebuilt/$hostTag/bin/$executableName")
            require(stripExecutable.isFile) {
                "NDK llvm-strip not found: $stripExecutable"
            }
            outputDirectory.listFiles { candidate -> candidate.extension == "so" }
                ?.forEach { library ->
                    exec {
                        commandLine(stripExecutable, "--strip-debug", library)
                    }
                }
        }
    }
    tasks.matching {
        it.name.startsWith("merge") && it.name.endsWith("DebugJniLibFolders")
    }.configureEach {
        dependsOn(prepareE2eJniLibs)
    }
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")
