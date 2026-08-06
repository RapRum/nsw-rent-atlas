# NSW Rent Atlas

An interactive dashboard examining how population growth is associated with rental pressure across NSW local government areas, with results separated by dwelling type.

## Live site

After GitHub Pages is enabled, the dashboard will be available at:

`https://YOUR-USERNAME.github.io/nsw-rent-atlas/`

Replace `YOUR-USERNAME` with the GitHub account name.

## Dashboard pages

- `index.html` — explore an LGA on the map
- `analysis.html` — compare an LGA with the NSW median or another LGA
- `about.html` — concise method summary

## Run locally

The CSV is loaded with `fetch()`, so do not open `index.html` directly from the file system.

From this folder, run:

```bash
python -m http.server 8000
```

Then open:

`http://localhost:8000`

## Publish with GitHub Pages

1. Create an empty public GitHub repository named `nsw-rent-atlas`.
2. Push the contents of this folder to the repository root.
3. Open **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select branch **main** and folder **/(root)**, then save.
6. Wait for the Pages deployment to finish and open the published URL.

## Data and limitations

The dashboard contains 340 eligible LGA-by-dwelling-type records across 121 LGAs. Groups require at least 30 rental bonds. Median rent is used as a price-based proxy for rental pressure. The statewide analysis is bivariate and describes association rather than causation.

## External libraries and services

The dashboard loads Leaflet, Papa Parse, Chart.js and jsPDF from public CDNs. Map tiles are supplied by OpenStreetMap, and LGA boundary geometry is requested from the ABS boundary service when the Explore page loads.
