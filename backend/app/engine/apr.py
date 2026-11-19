"""
True APR / IRR solver using scipy.optimize.brentq.

The APR is the periodic rate r that makes the Net Present Value (NPV) of
all cash flows equal to zero:

    0 = CF[0] + CF[1]/(1+r) + CF[2]/(1+r)^2 + … + CF[n]/(1+r)^n

For a loan/ISA:
  CF[0] = -principal  (negative: money out from lender's perspective)
  CF[1..n] = positive payments received

We solve for the monthly rate, then annualise.
"""

from __future__ import annotations
from typing import List, Literal
import numpy as np
from scipy.optimize import brentq


def _scaled_npv(rate: float, cashflows: np.ndarray) -> float:
    """Evaluate NPV with the same sign and roots, without large powers."""
    factor = 1 + rate
    if rate < 0:
        # Multiplying NPV by factor ** (n - 1) keeps the argument below one.
        return float(np.polynomial.polynomial.polyval(factor, cashflows[::-1]))
    return float(np.polynomial.polynomial.polyval(1 / factor, cashflows))


def solve_apr(
    cashflows: List[float],
    period: Literal["monthly", "annual"] = "monthly",
    lower: float = -0.9999,
    upper: float = 100.0,
    tol: float = 1e-10,
    maxiter: int = 500,
) -> float:
    """
    Solve for the internal rate of return (periodic) of a cash-flow series.

    Parameters
    ----------
    cashflows : list of float
        CF[0] is the initial outflow (negative), subsequent entries are inflows.
    period : {"monthly", "annual"}
        The period that each cash flow step represents.
        Returns the rate for that same period.
    lower, upper : float
        Bracket for brentq; defaults cover virtually all real-world loans.
    tol : float
        Absolute tolerance for root-finding.
    maxiter : int
        Maximum iterations for brentq.

    Returns
    -------
    float
        Periodic IRR (e.g. monthly rate if period="monthly").

    Raises
    ------
    ValueError
        If a root cannot be bracketed or found.
    """
    if len(cashflows) < 2:
        raise ValueError("Need at least two cash flows to solve APR.")

    if not -1 < lower < upper or not np.isfinite(upper):
        raise ValueError("The IRR bracket must be finite, increasing, and above -100%.")

    # Trailing zero payments do not change NPV. Removing them avoids
    # underflow when scaling the polynomial at the lower bound.
    flows = np.trim_zeros(np.asarray(cashflows, dtype=float), trim="b")
    if not np.all(np.isfinite(flows)):
        raise ValueError("Cash flows must be finite.")
    if not (np.any(flows > 0) and np.any(flows < 0)):
        raise ValueError("Cash flows have no valid IRR (all same sign or zero).")
    flows = flows / np.max(np.abs(flows))

    rate = brentq(
        _scaled_npv,
        lower,
        upper,
        args=(flows,),
        xtol=tol,
        maxiter=maxiter,
    )
    return float(rate)


def monthly_to_annual_apr(monthly_rate: float) -> float:
    """Convert monthly rate to effective annual rate."""
    return (1 + monthly_rate) ** 12 - 1


def cashflows_from_loan(principal: float, emi: float, term_months: int) -> List[float]:
    """Build a standard loan cash-flow list for APR solving."""
    return [-principal] + [emi] * term_months


def effective_apr_loan(
    principal: float, emi: float, term_months: int
) -> float:
    """Return the effective annual APR for a standard EMI loan."""
    cfs = cashflows_from_loan(principal, emi, term_months)
    monthly_rate = solve_apr(cfs)
    return monthly_to_annual_apr(monthly_rate)

