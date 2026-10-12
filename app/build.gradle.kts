plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.swyp.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.swyp.app"
        minSdk = 29          // Android 10+, saves to the gallery without any storage permission
        targetSdk = 35
        versionCode = 3
        versionName = "1.1.1"
    }

    signingConfigs {
        // One shared key so every build (yours, a friend's, or GitHub's) can update an existing install.
        create("shared") {
            storeFile = file("swyp.keystore")
            storePassword = "swypswyp"
            keyAlias = "swyp"
            keyPassword = "swypswyp"
        }
    }

    buildTypes {
        debug {
            signingConfig = signingConfigs.getByName("shared")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfig = signingConfigs.getByName("shared")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    androidResources {
        // Keep the web fonts and images uncompressed and untouched.
        noCompress += listOf("woff", "png", "jpg")
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.webkit:webkit:1.12.1")
    implementation("androidx.exifinterface:exifinterface:1.3.7")
}
