# Deploy Relay on Vercel

1. Create a hosted PostgreSQL database and run `postgres/0001_initial.sql` once on the empty database.
2. Create a private Cloudflare R2 bucket and an R2 API token with Object Read & Write access to that bucket.
3. Drop the clean Relay source folder into Vercel, or import that source from Git. Use the Next.js preset. The included `vercel.json` selects the standard Next.js build.
4. Set the following in the Vercel project's Environment Variables for the deployment environment. If you already deployed, redeploy after saving the variables.

| Variable | Value |
| --- | --- |
| `POSTGRES_URL` | Hosted PostgreSQL connection string with the provider's TLS options |
| `RELAY_SETUP_TOKEN` | A long random secret you choose for creating the first Admin |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_BUCKET` | Private R2 bucket name |
| `R2_ACCESS_KEY_ID` | R2 API token access key ID |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret access key |

On a fresh database, open `/login` and use the setup token to create the first Admin. Verify login, the Quality Dashboard, and a small attachment upload and download. The Vercel app accepts files up to 4 MB each.

To enable **Run in background** and **Run and watch**, apply the two automation migrations and connect the Relay browser runner to the same database. See [Automated testing](AUTOMATED-TESTING.md).

To bring over the existing local workspace, use an empty hosted database and migrate the local PostgreSQL data before creating an Admin there. Transfer any existing attachment objects to R2 with the same keys. The clean source folder contains no workspace records or credentials.
