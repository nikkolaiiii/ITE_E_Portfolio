# Nikkolai Yabut | ITE Portfolio

A responsive, static student portfolio for GitHub Pages. It includes Home, Contents, Prelim, Midterm, Final, Reflection, and Profile sections. Course entries are published from `portfolio-data.json`; files and screenshots referenced there should be committed with the site.

## Preview locally

Open this folder in VS Code and start Live Server from `index.html`, or run any static HTTP server from this folder. The page uses `fetch()` to load the portfolio data, so opening `index.html` directly as a `file://` URL will not load entries.

## Add a published entry

This is a view-only static site. A browser upload cannot publish a file to GitHub Pages or share it across devices. To publish work, place the files in this repository, add an entry to `portfolio-data.json`, then commit and push the changes.

Example entry:

```json
{
  "id": "prelim-activity-1",
  "term": "prelim",
  "category": "classroom",
  "title": "Prelim Activity No. 1 - Example",
  "activityNumber": 1,
  "description": "A short summary of the activity.",
  "instructions": "The activity instructions or problem statement.",
  "solution": "A short note about the procedure or source code.",
  "results": "What the output demonstrates.",
  "createdAt": "2026-11-12",
  "files": [
    {
      "name": "activity-output.pdf",
      "src": "assets/prelim/activity-output.pdf",
      "type": "application/pdf",
      "size": 12345
    }
  ],
  "screenshots": [
    {
      "name": "submission.png",
      "src": "assets/prelim/submission.png",
      "type": "image/png",
      "size": 54321
    }
  ]
}
```

Use `prelim`, `midterm`, or `final` for `term`. Categories are `classroom`, `laboratory`, `quiz`, `project`, `exam`, or `other`. Activity numbers sort in ascending order within each category. Screenshots display inline; documents have download links. All attachment paths must point to files committed in this site and should be relative to this portfolio's root.

## Publish with GitHub Pages

In the repository settings, open **Pages**, select **Deploy from a branch**, choose the `main` branch and `/ (root)`, then save. Once the Pages deployment finishes, the site is expected at:

`https://nikkolaiiii.github.io/ITE_E_Portfolio/`

GitHub Pages serves committed files only; it does not persist uploads made in a visitor's browser.
