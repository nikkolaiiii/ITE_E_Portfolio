# Nikkolai Yabut | ITE Portfolio

A responsive student portfolio for GitHub Pages with Home, Contents, Prelim, Midterm, Final, Reflection, and Profile sections.

## Run locally

Open this folder in VS Code and run Live Server from `index.html`, or serve this folder with any static HTTP server. The portfolio uses `fetch()` for `portfolio-data.json`, so opening the HTML directly through a `file://` URL will not load the site data.

## Add course entries while preparing the portfolio

Open the **Upload course materials** panel in Prelim, Midterm, or Final. Each entry can include its category, title, activity number, documents, submission screenshots, instructions, procedure, and results. Choose at least one document or screenshot. Activity numbers sort in ascending order within their category. Saved drafts remain in IndexedDB in the current browser profile; they do not automatically appear in another browser or device.

Use **Export portfolio data** after adding entries. It downloads a `portfolio-data.json` containing the published entries plus drafts and embedded attachments. Replace the repository's `portfolio-data.json` with the exported file and commit/push that change to publish the entries across devices. Treat the exported file as the master copy and keep it somewhere safe. Attachment data is embedded in that JSON, so large attachments make the export larger. Individual uploads are limited to 25 MB.

The upload panels are preparation tools. Once the portfolio is finalized, remove the uploader forms, browser draft JavaScript, and export panel to make the site view-only.

## GitHub Pages

The live site is published from the repository's `main` branch root at:

`https://nikkolaiiii.github.io/ITE_E_Portfolio/`