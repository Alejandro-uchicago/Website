# Academic website — Inés Alejandro Cruz Guerrero

Personal academic site for **Inés Alejandro Cruz Guerrero**, Postdoctoral Fellow
in the Department of Neurological Surgery, University of Chicago. Built as a
dependency-free static site so GitHub Pages can serve it directly — there is no
build step to fail. Publications are data-driven and refresh from Google Scholar
via a Python script and a scheduled GitHub Action.

## What's here

```
Website/
├── index.html                      # the whole site (single page, anchored sections)
├── assets/
│   ├── css/style.css               # design tokens + layout
│   ├── js/main.js                  # nav, hero graph animation, publication rendering
│   └── img/favicon.svg             # node/edge favicon
├── data/
│   └── publications.json           # single source of truth for publications
├── cv/
│   ├── CV_Cruz-Guerrero.pdf        # full CV (linked from the nav)
│   └── Resume_Cruz-Guerrero.pdf    # short résumé
├── scripts/
│   ├── update_publications.py      # Google Scholar → publications.json
│   └── requirements.txt
├── .github/workflows/
│   └── update-publications.yml     # weekly auto-refresh → pull request
└── README.md
```

The page loads `data/publications.json` at runtime and groups entries into
Journal articles, Book chapters, International conferences, and National
conferences, newest first, with section filters.

## Run it locally

Because the page fetches a JSON file, open it through a local server (opening
`index.html` from disk will block the fetch):

```bash
cd Website
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Publish on GitHub Pages

No build is required — serve the repository root directly:

1. Push this repository to GitHub (e.g. `Alejandro-uchicago/Website`).
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch.**
3. Choose branch `main` and folder `/ (root)`, then **Save**.
4. The site goes live at `https://alejandro-uchicago.github.io/Website/`.

For a cleaner URL, rename the repository to `alejandro-uchicago.github.io`; it
will then be served at `https://alejandro-uchicago.github.io/`.

## Updating publications

`data/publications.json` is the source of truth. Each entry looks like:

```json
{
  "section": "journal",              // journal | book | international | national
  "year": 2026,
  "title": "…",
  "authors": "Cruz-Guerrero, I. A., …",
  "venue": "Medical Image Analysis",
  "details": "72(9), 2732–2741",     // pages / volume / publisher (optional)
  "url": "https://…",                // optional link on the title
  "source": "manual",                // manual = locked; auto = needs review
  "id": "…"
}
```

### Automatically, from Google Scholar

```bash
pip install -r scripts/requirements.txt
python scripts/update_publications.py --user 6WnxDuUAAAAJ
python scripts/update_publications.py --dry-run     # preview without writing
```

Google Scholar does not record which *section* a paper belongs to, so the
script **merges** rather than overwrites:

- Existing entries are matched by title; their `section` and manual edits are kept.
- New papers are appended with a best-guess `section` and `"source": "auto"`.
- Anything marked `"source": "manual"` is never reclassified automatically.

After running, open the JSON, correct the `section` of any `auto` entry, set its
`"source"` to `"manual"` to lock it, and commit.

> Scholar has no official API and may rate-limit automated access. If a fetch
> fails, the script leaves the JSON untouched.

### Automatically, on a schedule

`.github/workflows/update-publications.yml` runs the script every Monday (and on
demand via **Actions → Run workflow**). It opens a **pull request** with any
changes so you can review new/auto entries in the diff before they go live.
Nothing is published without your review.

### By hand

Just edit `data/publications.json` directly — add an entry, set its `section`,
and commit. The site updates on the next load.

## Editing content

- **Bio, research, experience, awards, contact, references:** edit `index.html`
  (each section is clearly commented).
- **Colors and typography:** the design tokens live at the top of
  `assets/css/style.css` (`:root`).
- **CV / résumé PDFs:** replace the files in `cv/` (keep the same filenames, or
  update the links in `index.html`).

## License

Content © Inés Alejandro Cruz Guerrero. Code is free to reuse.
