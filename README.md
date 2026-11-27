# ISA Truth

Compare an Income Share Agreement with an education loan for the same bootcamp tuition. The React frontend displays monthly repayments, total cost, effective annual rates, and how the answer changes with starting salary. The FastAPI backend performs the calculations.

## Deploy to Render

The [Render Blueprint](render.yaml) builds one [Docker image](Dockerfile) containing both the frontend and API. It selects the free web-service plan, listens on Render’s `PORT`, and checks `/api/health` before routing traffic. The frontend and API share one origin.

1. Put the contents of `isa-truth` at the root of a Git repository.
2. In Render, choose **New → Blueprint** and connect that repository.
3. Apply the Blueprint. Open the URL shown for the `isa-truth` service after its health check passes. [Render Blueprint setup](https://render.com/docs/infrastructure-as-code).

Saved contracts stay in the visitor’s browser and site origin. The account database stores profiles, planning preferences, synced offer workspaces, and private comparison reports.

### Enable hosted accounts and AI

- Set the Render service's `DATABASE_URL` to a persistent PostgreSQL database connection string to enable sign-up and sign-in. The app creates its account tables at first use. The database role needs permission to create tables and indexes. Without the URL, Render still serves the calculator and planner with accounts disabled.
- Set `OPENAI_API_KEY` on the backend to enable optional AI guidance for signed-in users. `OPENAI_MODEL` can override the default `gpt-4.1-mini` with another model that supports Structured Outputs. The model identifies the focus of an optional written concern and ranks follow-up steps. The calculator supplies repayment figures and the budget-based suggestion. The AI request includes entered estimates, the priority, calculated outcomes and any concern the user enters. Profile information is omitted.
- Accounts use the same frontend and API origin. For development, use the Vite proxy. For another HTTPS reverse proxy or domain, add the public app origin to the backend's `ALLOWED_ORIGINS` if the proxy does not preserve the original scheme and host.
- Local profiles use `backend/data/accounts.db` by default. Set `ACCOUNT_DB_PATH` to select a different SQLite file. For a persistent local Docker setup, mount a volume at `/app/data`.

### Enable Google and Microsoft sign-in

1. Set `OAUTH_PUBLIC_ORIGIN` to the app's browser origin, for example `http://localhost:5173` during Vite development or `https://your-app.example` in production. Render's external URL is the default when available.
2. Create a **Web application** OAuth client in Google Cloud and register `<origin>/api/auth/oauth/google/callback` as an authorized redirect URI. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the backend. [Google OpenID Connect setup](https://developers.google.com/identity/openid-connect/openid-connect).
3. Register a Microsoft Entra app that supports organizational directories and personal Microsoft accounts. Add `<origin>/api/auth/oauth/microsoft/callback` under the **Web** platform's redirect URIs. Set `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET` to the application's client ID and secret value. [Microsoft app registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app).
4. Restart the backend and open the site at the exact configured origin. Each provider works independently. Keep client secrets on the backend and out of source control.

The first successful provider sign-in creates an ISA Truth profile. Later sign-ins use the provider's stable identity. Existing profiles with the same email keep their original sign-in method.

### Run the container locally

```sh
docker build -t isa-truth .
docker run --rm -p 127.0.0.1:10000:10000 isa-truth
```

Open [http://localhost:10000](http://localhost:10000). The health endpoint is `/api/health` and interactive API docs are at `/docs`.

### Run the production app without Docker

Build the frontend from the project root with Node.js 22.

```powershell
cd frontend
npm ci
npm run build
```

In a second terminal opened at the project root, start the built app with Python 3.11.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-production.txt
$env:HOST = '127.0.0.1'
.\.venv\Scripts\python.exe -m app.production
```

Use `.venv/bin/python` and `HOST=127.0.0.1` on macOS/Linux. The production entry point defaults to port `10000` and reads the frontend from `frontend/dist`. Set `PORT` or `FRONTEND_DIST` to override those values. For a separate frontend origin, set a comma-separated `ALLOWED_ORIGINS` on the API and set `VITE_API_BASE` to its origin before building the frontend.

## Develop and test

Run these from `backend` using the same virtual environment.

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

Start `npm run dev` from `frontend` in another terminal. Vite serves the app on port 5173 and proxies the API to port 8000. The local API initializes SQLite at `backend/data/contracts.db`. The tests use temporary databases.

## How to use it

- **Calculator** compares a contract against a fixed-rate loan. Use **Share** to copy a link with the inputs.
- Under **Planning**, switch between **Dream Path** for study choices and **AI Planner** for financing.
- **AI Planner** compares expected and lower starting salaries against your monthly repayment budget and priority. Choose a lender by country or enter your own quote. Both options use the same financing amount in INR. Foreign quotes use your entered exchange rate throughout. Upfront fees count toward total cost and appear separately from the monthly budget. Monthly fees and costs added to the loan balance affect both total and monthly repayment. **Sign in** or **Create an account** to keep a budget and priority in your profile.
- **Dream Path** turns a written education goal, or manually chosen preferences, into a shortlist of up to three programs from a curated India catalog. Refine your field, qualification, current education and study format to update the ranking. Funding estimates start with published program fees and incorporate other costs, savings and confirmed aid when you enter them. You can send the estimate to the AI Planner. The optional signed-in AI reader extracts editable fields from the goal. Anonymous use and program ranking work without AI. The reviewed catalog and official sources are maintained in `backend/app/engine/dream_catalog.py`.
- **Help me decide** explains total cost, monthly budget headroom or income uncertainty. The income view shows lower-salary peak payments and what is due during a three-month no-income scenario at the start of the schedule. With AI guidance enabled, an optional written concern can choose the focus. The selected repayment priority is used when there is no clear concern or AI is unavailable.
- **Loan rules** covers banks and other lenders, government aid, schools, education bodies, and financial regulators in the five Planner markets. Search or filter by country and category. Each entry links to its official rules or register. **Use lender in AI Planner** opens the lender and currency so you can enter a written quote. Government repayment rules use their official guidance. A separate installment loan can still be compared in Planner.
- **Offer workspace** saves up to 12 offer versions and 20 named comparison snapshots. Edit offer details, duplicate a comparison, or reopen it with the quote dates, terms and assumptions used at the time. Copy the redacted comparison link or export a CSV or print report. Compare versions at the same funding amount to calculate which individual rate, income share, cap or fee waiver would meet a rival quote.
- **Account workspace** syncs offers, funding assumptions, bundle selections, and payment logs to your account when you select **Save to account**. **This browser** stays separate. You can import the browser copy when starting a new account workspace. If another session saves first, your draft stays open and you can choose which copy to keep.
- **Private reports** let a student generate a one-time, email-bound invite valid for seven days, or send to a reviewer using a 30-minute code generated by the reviewer. The read-only copy starts with the selected scenario, quote date and payment totals. The sender can opt in to salary, budget or key terms separately and revoke a pending invite or an accepted report.
- **Quote review** in the workspace scans pasted terms or text-based PDFs up to 5 MB and 20 pages. Match suggestions include their source line and require confirmation. The server extracts PDF text for that request and discards the file.
- **Account** lets you update your profile and log education expenses by date and category. Loan payments logged from the account workspace appear once in that ledger. Use the offer's funding date to view modeled installment dates, and save a lender statement balance to compare keeping the loan, prepaying and recasting, or refinancing. The schedule and statement balances are labeled separately.
- **Scenarios** opens after a successful calculation. Compare 6, 9, and 12 LPA or add a custom salary using the calculated terms.
- **Sensitivity** includes a combined salary, interest-rate and foreign-repayment-cost grid. Choose up to nine values on each varying axis, inspect every assumption, and download every result. The counts describe the tested grid.
- **Break-even** uses a completed Calculator comparison or a result opened from AI Planner to find the first starting salary where total repayment is equal, when one exists in the modeled range.
- **Compare Contracts** ranks saved ISAs at the calculator’s current starting salary. **Contract Checker** turns marked clauses into questions you can download and take to the provider. From the review, open the written quote tool or compare confirmed terms in Calculator.
- **Export** downloads or prints the calculator schedule. Income is opt-in. In Calculator, **Ask about a payment or contract term** explains the relevant schedule and terms. With AI enabled, the model chooses among facts calculated by the app.
- **Local planning** under AI Planner accepts take-home pay and expenses in INR, USD, GBP, CAD or AUD. Enter the conversion rate for foreign currencies. The panel offers English and Hindi, official aid links, and a separate payroll deduction worksheet that uses estimates you enter from official tax resources.

## Assumptions

By default the ISA pays a share of gross monthly salary once the annual income trigger is met. Advanced inputs support a share of eligible income, delayed employment, individual monthly income overrides, optional monthly caps, and contracts that count only months with payments within a separate maximum window.

Both options in Calculator use the same net funding. Loan terms can include separate upfront and recurring fees, withheld or financed costs, disbursements during grace, interest paid or deferred during grace, rate resets, and extra monthly payments. The simulator uses monthly periods. The modeled annual rate and present value use the timing of those simulated payments. The reported rate can be undefined when the cash flows do not produce a single supported result. Break-even samples the salary range and checks income thresholds separately when the ISA counts paying months.

Affordability uses the entered monthly budget and can also use take-home pay after essential expenses and other debt. The lower of the two limits applies when both are entered. The workspace compares explicit stress scenarios. Its probability weights are supplied by the user. Calculator and CSV schedules use lakhs of rupees, and the interface shows INR.

### Worked example

For ₹3,00,000 tuition, a 36-month ISA sharing 15% of income with a ₹5 lakh income trigger, a ₹4,50,000 cap, 8% annual salary growth, and zero grace period, the 36-month loan at 10.5% nominal interest costs **₹3,51,026** in total. The modeled break-even starts at approximately **7.2085 LPA**.

| Starting salary | ISA total | ISA effective annual rate | Lower repayment |
| --- | ---: | ---: | --- |
| 6 LPA | ₹2,92,176 | −1.64% | ISA |
| 9 LPA | ₹4,38,264 | 28.79% | Loan |
| 12 LPA | ₹4,50,000 | 41.18% | Loan |

See the in-app Methodology for the formulas and payment timing. Salary growth is a projection, and results depend on the actual contract terms entered.
