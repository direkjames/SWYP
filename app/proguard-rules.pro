# Keep the JavaScript bridge methods the web editor calls.
-keepclassmembers class com.swyp.app.MainActivity$Bridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
