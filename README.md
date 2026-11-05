# Ye Teng's portfolio

This repository contains my personal website for DSC 106 Labs 1–6. It includes a home page, a responsive data-driven project gallery, a grid-based contact form, a styled semantic HTML resume, JavaScript-generated navigation, a persistent three-state theme switcher, live GitHub profile statistics, and a D3 repository analytics page with commit statistics, a scatterplot, tooltips, and brushing.

## Preview locally

Labs 3 and 4 require a local server. Run:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000/`.

To regenerate the repository analysis data after committing code changes, run:

```sh
npx elocuent -d . -o meta/loc.csv --spaces 2
```
