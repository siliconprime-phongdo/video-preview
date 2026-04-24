# Video Review (Next.js + TailwindCSS)

Client-side video and media review app with:
- Play/Pause
- Frame screenshot capture
- Quick seek: `-10s -5s -2s -1s +1s +2s +5s +10s`
- Custom timeline slider (HTML/CSS/JS, no native `<input type="range">`)
- ZIP upload and extraction in browser for `.mp4`/`.webm`/`.webp`/`.html`

## Run locally

```bash
npm install
npm run dev
```

Open: [http://localhost:3000](http://localhost:3000)

## Usage

Pass video URL via querystring:

```txt
http://localhost:3000/?video=https://example.com/video.mp4
```

You can also upload a ZIP file:
- Select a `.zip` file
- The app extracts files client-side
- It lists `.mp4`/`.webm`/`.webp`/`.html` files as selectable blocks
- The file list is compact and horizontally scrollable for large sets
- HTML files are prioritized first and shown in dedicated HTML review mode

If screenshot capture fails, the source may be blocked by CORS.

## Free deploy on Vercel

1. Push code to GitHub
2. Open [Vercel](https://vercel.com/) and click **Add New Project**
3. Select the repo and deploy with default settings

The free Vercel tier is enough for this project.
