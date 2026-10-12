package com.swyp.app

import android.annotation.SuppressLint
import android.content.ContentValues
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.view.ViewGroup
import android.webkit.JavascriptInterface
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader

/**
 * SWYP is a single WebView that runs the editor bundled in assets/www.
 * The native side only does what the web page can't: pick photos with the
 * system photo picker, write finished slides into the gallery, and keep the
 * system bars in step with the app's light/dark theme.
 */
class MainActivity : ComponentActivity() {

    private lateinit var root: FrameLayout
    private lateinit var webView: WebView
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var safeBottomCss = 0f
    private var darkTheme = false

    private val assetLoader by lazy {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
    }

    private val pickMany = registerForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(MAX_PICK)) { uris ->
        deliverFiles(uris)
    }
    private val pickOne = registerForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        deliverFiles(listOfNotNull(uri))
    }
    // Used for importing .swyp project files, which aren't photos.
    private val openDocument = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        deliverFiles(listOfNotNull(uri))
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.light(Color.TRANSPARENT, Color.TRANSPARENT)
        )
        super.onCreate(savedInstanceState)

        root = FrameLayout(this).apply { setBackgroundColor(BG_LIGHT) }
        webView = WebView(this).apply { setBackgroundColor(BG_LIGHT) }
        root.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)

        // Status bar and cutouts are padded natively. The navigation bar area is handed to the page
        // as a CSS variable so the bottom toolbar can run underneath it.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            val keyboardUp = ime.bottom > bars.bottom
            v.setPadding(bars.left, bars.top, bars.right, if (keyboardUp) ime.bottom else 0)
            safeBottomCss = if (keyboardUp) 0f else bars.bottom / resources.displayMetrics.density
            pushSafeArea()
            WindowInsetsCompat.CONSUMED
        }

        with(webView.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = true
            mediaPlaybackRequiresUserGesture = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            textZoom = 100
        }
        webView.isVerticalScrollBarEnabled = false
        webView.isHorizontalScrollBarEnabled = false
        webView.overScrollMode = WebView.OVER_SCROLL_NEVER
        webView.addJavascriptInterface(Bridge(), "SwypAndroid")

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                assetLoader.shouldInterceptRequest(request.url)

            // The app never navigates anywhere else.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                request.url.host != APP_HOST

            override fun onPageFinished(view: WebView, url: String) = pushSafeArea()
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView,
                callback: ValueCallback<Array<Uri>>,
                params: WebChromeClient.FileChooserParams
            ): Boolean {
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val wantsImages = params.acceptTypes.any { it.startsWith("image") }
                val request = PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                return try {
                    when {
                        !wantsImages -> openDocument.launch(arrayOf("*/*"))
                        params.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE -> pickMany.launch(request)
                        else -> pickOne.launch(request)
                    }
                    true
                } catch (e: Exception) {
                    fileCallback = null
                    false
                }
            }
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                webView.evaluateJavascript("(window.swypBack && window.swypBack()) ? 'yes' : 'no'") { result ->
                    if (result?.contains("yes") != true) {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                        isEnabled = true
                    }
                }
            }
        })

        if (savedInstanceState != null) webView.restoreState(savedInstanceState)
        else webView.loadUrl("https://$APP_HOST/assets/www/index.html")
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onPause() {
        super.onPause()
        // Make sure the current design is written to storage before Android may stop the app.
        webView.evaluateJavascript("document.dispatchEvent(new Event('visibilitychange'))", null)
    }

    private fun deliverFiles(uris: List<Uri>) {
        fileCallback?.onReceiveValue(if (uris.isEmpty()) null else uris.toTypedArray())
        fileCallback = null
    }

    private fun pushSafeArea() {
        if (!::webView.isInitialized) return
        webView.evaluateJavascript(
            "document.documentElement.style.setProperty('--sab','${safeBottomCss}px')", null
        )
    }

    private fun applyTheme(dark: Boolean) {
        darkTheme = dark
        val bg = if (dark) BG_DARK else BG_LIGHT
        root.setBackgroundColor(bg)
        webView.setBackgroundColor(bg)
        window.setBackgroundDrawable(android.graphics.drawable.ColorDrawable(bg))
        WindowCompat.getInsetsController(window, root).apply {
            isAppearanceLightStatusBars = !dark
            isAppearanceLightNavigationBars = !dark
        }
    }

    /** Methods the web editor calls through window.SwypAndroid. They run on a background thread. */
    inner class Bridge {

        /** Opens the Android share sheet for a project file (Messenger, Drive, Nearby Share…). */
        @JavascriptInterface
        fun shareFile(base64: String, fileName: String, mimeType: String): String {
            return try {
                val dir = java.io.File(cacheDir, "share").apply { mkdirs() }
                dir.listFiles()?.forEach { it.delete() }
                val safeName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
                val file = java.io.File(dir, safeName)
                file.writeBytes(Base64.decode(base64, Base64.DEFAULT))
                val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", file)
                val send = Intent(Intent.ACTION_SEND).apply {
                    type = mimeType
                    putExtra(Intent.EXTRA_STREAM, uri)
                    putExtra(Intent.EXTRA_SUBJECT, safeName)
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                }
                runOnUiThread { startActivity(Intent.createChooser(send, "Share SWYP project")) }
                "ok"
            } catch (e: Exception) {
                e.message ?: "Unknown error"
            }
        }

        @JavascriptInterface
        fun setDarkTheme(dark: Boolean) {
            runOnUiThread { applyTheme(dark) }
        }

        /**
         * Writes one finished slide into Pictures/SWYP. The page saves the last slide first,
         * so slide 1 is the newest photo and shows first in Instagram's picker.
         */
        @JavascriptInterface
        fun saveImage(base64: String, fileName: String, mimeType: String, order: Int): String {
            return try {
                val bytes = Base64.decode(base64, Base64.DEFAULT)
                val resolver = contentResolver
                val collection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                val now = System.currentTimeMillis()
                val values = ContentValues().apply {
                    put(MediaStore.Images.Media.DISPLAY_NAME, fileName)
                    put(MediaStore.Images.Media.MIME_TYPE, mimeType)
                    put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/SWYP")
                    put(MediaStore.Images.Media.DATE_TAKEN, now)
                    put(MediaStore.Images.Media.IS_PENDING, 1)
                }
                val uri = resolver.insert(collection, values) ?: return "Could not create the photo"
                resolver.openOutputStream(uri)?.use { it.write(bytes) } ?: run {
                    resolver.delete(uri, null, null)
                    return "Could not write the photo"
                }
                values.clear()
                values.put(MediaStore.Images.Media.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
                // A small gap keeps the gallery's ordering stable between slides.
                Thread.sleep(40)
                "ok"
            } catch (e: Exception) {
                e.message ?: "Unknown error"
            }
        }
    }

    companion object {
        private const val APP_HOST = WebViewAssetLoader.DEFAULT_DOMAIN
        private const val MAX_PICK = 20
        private val BG_LIGHT = Color.parseColor("#F6F6F9")
        private val BG_DARK = Color.parseColor("#0D0D11")
    }
}
