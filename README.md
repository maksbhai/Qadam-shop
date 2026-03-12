# Qadam Privé Storefront

Luxury mobile-first sneaker storefront synced to a public Google Sheet CSV.

## Vercel deployment

1. Push this repository to GitHub.
2. In Vercel, import the repo as a **Static Site** (no framework preset required).
3. Deploy with default settings.
4. (Optional) Update `window.__QADAM_CONFIG__` in `index.html` for:
   - `sheetUrl`
   - `whatsappAgents`

## Local preview

```bash
python3 -m http.server 4173
```

Then open `http://127.0.0.1:4173`.

## Public sheet fields used

- Product Name
- Image URL
- Size
- Condition
- Description
- Public Price
- Payment Status

Payment Status mapping:

- empty → Available
- Pending → Reserved
- Completed → Sold
