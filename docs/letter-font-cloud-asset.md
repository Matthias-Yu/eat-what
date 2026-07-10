# Letter Handwriting Font

Upload this file to cloud storage under `assets/font/`:

- `MaShanZheng-Regular.ttf`

Cloud file ID used by the mini program:

`cloud://cloudbase-4gz52ssycf6b2383.636c-cloudbase-4gz52ssycf6b2383-1394602819/assets/font/MaShanZheng-Regular.ttf`

The local upload copy and its SIL Open Font License are stored in `assets/font/`.
The folder is excluded from the mini-program package in `project.config.json`.

The font is loaded dynamically with `wx.loadFontFace` and is applied only to
the letter editor and letter body. If loading fails, the UI falls back to the
mini program's global system font.
