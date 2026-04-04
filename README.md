# Wedding Invitation (Static Site)

This project is a fully static website and can be hosted as-is on any static hosting provider.

## Project structure

- `index.html`
- `css/style.css`
- `js/script.js`
- `images/`

All links to CSS/JS/images are relative, so the site works from any domain/subdomain path.

## Deploy to GitHub Pages

1. Create a new GitHub repository.
2. Upload all files from this folder (`index.html`, `css`, `js`, `images`).
3. Open repository **Settings -> Pages**.
4. In **Build and deployment**, choose:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` (or `master`), folder `/ (root)`
5. Save and wait for deployment.

## Deploy to Netlify

1. Create a new site in Netlify.
2. Connect the GitHub repository (or drag-and-drop this folder).
3. Build settings are not required for a static site.
4. Publish.

## Deploy to Vercel

1. Create a new project in Vercel.
2. Import the repository with these static files.
3. Framework preset: `Other`.
4. Build command/output directory are not required.
5. Deploy.
