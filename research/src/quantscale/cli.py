"""Local research CLI; no exchange connectivity."""
import argparse
import json
from decimal import Decimal
from .core import read_observations, replay, summarize, chronological_split


def main():
    parser = argparse.ArgumentParser(prog="quantscale")
    parser.add_argument("csv", help="Resolved independent market observations")
    parser.add_argument("--fee", default="0.02", help="SYNTHETIC per-contract fee")
    parser.add_argument("--min-edge", default="0.05")
    parser.add_argument("--holdout", action="store_true")
    args = parser.parse_args()
    rows = read_observations(args.csv)
    if args.holdout:
        _, rows = chronological_split(rows)
    print(json.dumps(summarize(replay(rows, fee_per_contract=Decimal(args.fee), min_edge=Decimal(args.min_edge))), indent=2))


if __name__ == "__main__":
    main()
