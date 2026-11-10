# Developing SWYP

Notes for building, signing and installing SWYP. For what the app does, see the [README](../README.md).

## Build the APK

### Option A: Android Studio (on your computer)

1. Open this folder in Android Studio (Ladybug or newer). Let Gradle sync finish.
2. Plug in your phone with USB debugging on and press **Run**, or
3. Choose **Build › Build App Bundle(s) / APK(s) › Build APK(s)**. The APK lands in `app/build/outputs/apk/debug/`.

For a smaller, optimised APK, run `./gradlew assembleRelease`. The file is `app/build/outputs/apk/release/app-release.apk`.

### Option B: GitHub (no Android Studio needed)

1. Push this folder to a GitHub repository.
2. GitHub Actions builds the APK automatically on every push to `main`. Open the **Actions** tab, select the latest run, and download **SWYP-apk**.
3. Push a tag such as `v1.0` (`git tag v1.0 && git push --tags`) and the APK is also attached to a GitHub Release. You can share that link with friends.

### About signing

Every build is signed with `app/swyp.keystore`, so a friend can install a newer APK over an older one without losing their projects. That key is in the repo, which is fine for sharing among friends. If you ever publish to the Play Store, create a private key and keep it out of the repo.

## Installing on a friend's phone

Send them `SWYP.apk`. When they open it, Android asks them to allow installs from that app (Files, Chrome, Messenger and so on) the first time. SWYP needs Android 10 or newer.

## How it's built

```
app/src/main/
├── java/com/swyp/app/MainActivity.kt   WebView shell, photo and file pickers, gallery saving, share sheet, system bars
└── assets/www/                         the editor (plain HTML, CSS and JavaScript, no frameworks)
    ├── index.html
    ├── css/app.css                     design tokens for light and dark themes
    ├── js/render.js                    canvas renderer shared by the editor and the export
    ├── js/editor.js                    touch gestures, selection, snapping, crop
    ├── js/app.js                       screens, sheets, tools, history, preview, export, project files
    ├── js/templates.js                 the starter templates
    ├── js/store.js                     IndexedDB storage for projects and photos
    └── fonts/                          bundled fonts (see LICENSES.txt)
```

The editor and the export use the same renderer, so saved slides match the screen exactly. To try the editor on a computer, serve `app/src/main/assets/www` with any local web server, for example `python3 -m http.server`, and open it in Chrome. Saving downloads the files instead of writing to the gallery.
