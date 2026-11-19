# ISA Truth

Compare an Income Share Agreement with an education loan for the same bootcamp tuition. The React frontend displays monthly repayments, total cost, effective annual rates, and how the answer changes with starting salary. The FastAPI backend performs the calculations.

## Deploy to Render

The [Render Blueprint](render.yaml) builds one [Docker image](Dockerfile) containing both the frontend and API. It selects the free web-service plan, listens on Render’s `PORT`, and checks `/api/health` before routing traffic. The frontend and API share one origin.

1. Put the contents of `isa-truth` at the root of a Git repository.
2. In Render, choose **New → Blueprint** and connect that repository.
3. Apply the Blueprint. Open the URL shown for the `isa-truth` service after its health check passes. [Render Blueprint setup](https://render.com/docs/infrastructure-as-code).

Saved contracts are stored in the visitor’s browser in production. They stay with that browser and site origin. The production server exposes a stateless comparison endpoint and does not use a SQLite database. The development API retains its SQLite endpoints for local use.

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
- **Scenarios** compares 6, 9, and 12 LPA and accepts a custom salary using the current terms.
- **Sensitivity** varies salary and either salary growth or the repayment cap, with repayment and effective-rate views.
- **Break-even** finds the first starting salary where the same contract and loan have equal repayment, when one exists within the modeled range.
- **Compare Contracts** ranks saved ISAs at the calculator’s current starting salary. **Contract Checker** highlights clauses to review.
- **Export** downloads the full schedule as CSV. After calculating a comparison, **Print / Save as PDF** opens the browser’s print dialog with the full report.

## Assumptions

The ISA pays a share of gross monthly salary once the annual income trigger is met. Salary changes at each 12-month anniversary. A grace period postpones the payment window, and months below the trigger within that window count toward the term. The last payment is clipped to the remaining total cap.

The loan starts in month one and uses the same tuition principal. It can have a separate term. Taxes, fees, and loan moratoriums are outside the model. The ISA effective annual rate uses the actual payment month of each cash flow. With zero payments, the rate is undefined. Break-even searches from 0 to 100 LPA and distinguishes between a repayment match and a jump past the loan total at the income trigger. API and CSV amounts use lakhs of rupees, and the interface displays INR.

### Worked example

For ₹3,00,000 tuition, a 36-month ISA sharing 15% of income with a ₹5 lakh income trigger, a ₹4,50,000 cap, 8% annual salary growth, and zero grace period, the 36-month loan at 10.5% nominal interest costs **₹3,51,026** in total. The modeled break-even starts at approximately **7.2085 LPA**.

| Starting salary | ISA total | ISA effective annual rate | Lower repayment |
| --- | ---: | ---: | --- |
| 6 LPA | ₹2,92,176 | −1.64% | ISA |
| 9 LPA | ₹4,38,264 | 28.79% | Loan |
| 12 LPA | ₹4,50,000 | 41.18% | Loan |

See the in-app Methodology for the formulas and payment timing. Salary growth is a projection, and results depend on the actual contract terms entered.
