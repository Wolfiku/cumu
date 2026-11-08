plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

// Version comes from the server's package.json, so app and server releases match
val serverVersion: String = run {
    val pkg = rootProject.file("../package.json")
    if (pkg.exists()) Regex("\"version\"\\s*:\\s*\"([^\"]+)\"").find(pkg.readText())?.groupValues?.get(1) ?: "0.0.0"
    else "0.0.0"
}

android {
    namespace = "com.cumu.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.cumu.app"
        minSdk = 26
        targetSdk = 36
        versionName = serverVersion
        versionCode = (System.getenv("CUMU_VERSION_CODE") ?: "1").toInt()
    }

    signingConfigs {
        // Release signing from environment (CI); falls back to the debug key locally
        val ks = System.getenv("CUMU_KEYSTORE")
        if (ks != null && file(ks).exists()) {
            create("release") {
                storeFile = file(ks)
                storePassword = System.getenv("CUMU_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("CUMU_KEY_ALIAS")
                keyPassword = System.getenv("CUMU_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.findByName("release") ?: signingConfigs.getByName("debug")
        }
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        compose = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.navigation.compose)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons)
    debugImplementation(libs.compose.ui.tooling)

    implementation(libs.media3.exoplayer)
    implementation(libs.media3.session)
    implementation(libs.media3.datasource.okhttp)

    implementation(libs.coil.compose)
    implementation(libs.coil.network.okhttp)
    implementation(libs.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.guava)
}
