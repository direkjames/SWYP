# SWYP

A free Android app for making seamless Instagram carousels. Design on one long canvas, and SWYP slices it into slides that flow into each other when you swipe.

No accounts, no ads, no watermark, no internet permission. Projects and photos stay on the phone.

## Features (version 1.1)

- **Projects:** home screen with every carousel, auto-saved, plus rename, duplicate and delete
- **Templates:** 8 starters (photo dump, panorama, travel diary, quote series, birthday, product launch, before & after, mood board)
- **Formats:** 4:5, 3:4, 1:1 and 9:16, from 1 to 20 slides, changeable at any time
- **Slides:** add before or after, duplicate, move left or right, clear, delete. Panoramas stretch and shrink with the carousel.
- **Photos:** a panorama across all slides, one photo per slide, or free-placed photos
- **Editing:** move, pinch to scale and rotate, side handles to resize, and snapping to slide edges, centres and seams
- **Crop:** double-tap a photo (or tap Crop), then drag and pinch inside the frame
- **Swap photos:** hold a photo for a moment, then drag it onto another frame
- **Photo tools:** 8 filters, brightness, contrast, saturation and warmth, frames (white or black border, polaroid, film), rounded corners, flip, opacity and shadow
- **Text:** 8 styles and 6 bundled fonts, with size, color, weight, italic, alignment, letter and line spacing, outline, curve and a highlight background
- **Stickers:** 32 emoji, 8 vector stickers, 5 shapes and ready-made photo frames
- **Layouts:** 10 single-slide grids and 4 layouts that span two slides, with spacing and corner options
- **Canvas:** solid colors or gradients that run across every seam
- **Layers:** reorder, hide and lock
- **Undo and redo**
- **Preview:** an Instagram-style post you can swipe through, plus a profile grid view showing how slide 1 crops to 3:4
- **Save to gallery:** full-resolution JPG or PNG files in `Pictures/SWYP`, numbered in order. Save every slide or pick just the ones you changed. Slide 1 is saved last, so it's the newest photo and shows first in Instagram's picker.
- **Share projects:** send a `.swyp` file (photos included) through the share sheet. Friends open it with **Import file** on the home screen.
- **Tips:** a short guide the first time someone opens the editor, available again in Settings
- **Appearance:** light by default, with a Dark or System option in Settings

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
